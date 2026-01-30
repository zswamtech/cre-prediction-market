// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";

/// @title PredictionMarketV2
/// @notice Prediction market with dispute resolution system
/// @dev Implements dispute mechanism for controversial AI settlements
contract PredictionMarketV2 is ReceiverTemplate {
    // ================================================================
    // |                        ERRORS                                |
    // ================================================================
    error MarketDoesNotExist();
    error MarketAlreadySettled();
    error MarketNotSettled();
    error AlreadyPredicted();
    error InvalidAmount();
    error NothingToClaim();
    error AlreadyClaimed();
    error TransferFailed();
    // Dispute errors
    error DisputePeriodEnded();
    error DisputePeriodNotEnded();
    error DisputeAlreadyOpen();
    error DisputeNotOpen();
    error DisputeAlreadyResolved();
    error NotParticipant();
    error InsufficientDisputeStake();
    error ConfidenceTooHigh();
    error ClaimsPaused();

    // ================================================================
    // |                        EVENTS                                |
    // ================================================================
    event MarketCreated(uint256 indexed marketId, string question, address creator);
    event PredictionMade(uint256 indexed marketId, address indexed predictor, Prediction prediction, uint256 amount);
    event SettlementRequested(uint256 indexed marketId, string question);
    event MarketSettled(uint256 indexed marketId, Prediction outcome, uint16 confidence);
    event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 amount);
    // Dispute events
    event DisputeOpened(uint256 indexed marketId, address indexed disputer, string reason, uint256 stake);
    event DisputeResolved(uint256 indexed marketId, bool isValid, Prediction newOutcome, uint16 newConfidence);
    event DisputeStakeReturned(uint256 indexed marketId, address indexed disputer, uint256 amount);
    event DisputeStakeSlashed(uint256 indexed marketId, uint256 amount);

    // ================================================================
    // |                        TYPES                                 |
    // ================================================================
    enum Prediction {
        Yes,
        No
    }

    enum DisputeStatus {
        None,
        Open,
        ResolvedValid,
        ResolvedInvalid
    }

    struct Market {
        address creator;
        uint48 createdAt;
        uint48 settledAt;
        bool settled;
        uint16 confidence;
        Prediction outcome;
        uint256 totalYesPool;
        uint256 totalNoPool;
        string question;
        // Dispute fields
        uint48 disputePeriodEnd;
        DisputeStatus disputeStatus;
    }

    struct UserPrediction {
        uint256 amount;
        Prediction prediction;
        bool claimed;
    }

    struct Dispute {
        address disputer;
        uint256 stake;
        string reason;
        uint48 openedAt;
    }

    // ================================================================
    // |                        CONSTANTS                             |
    // ================================================================
    uint256 public constant DISPUTE_PERIOD = 24 hours;
    uint256 public constant MIN_DISPUTE_STAKE = 0.01 ether;
    uint16 public constant DISPUTE_CONFIDENCE_THRESHOLD = 9000; // Can only dispute if confidence < 90%

    // ================================================================
    // |                    STATE VARIABLES                           |
    // ================================================================
    uint256 internal nextMarketId;
    mapping(uint256 marketId => Market market) internal markets;
    mapping(uint256 marketId => mapping(address user => UserPrediction)) internal predictions;
    mapping(uint256 marketId => Dispute) internal disputes;

    // ================================================================
    // |                      CONSTRUCTOR                             |
    // ================================================================

    /// @notice Constructor sets the Chainlink Forwarder address for security
    /// @param _forwarderAddress The address of the Chainlink KeystoneForwarder contract
    constructor(address _forwarderAddress) ReceiverTemplate(_forwarderAddress) {}

    // ================================================================
    // |                       CREATE MARKET                          |
    // ================================================================

    /// @notice Create a new prediction market.
    /// @param question The question for the market.
    /// @return marketId The ID of the newly created market.
    function createMarket(string memory question) public returns (uint256 marketId) {
        marketId = nextMarketId++;

        markets[marketId] = Market({
            creator: msg.sender,
            createdAt: uint48(block.timestamp),
            settledAt: 0,
            settled: false,
            confidence: 0,
            outcome: Prediction.Yes,
            totalYesPool: 0,
            totalNoPool: 0,
            question: question,
            disputePeriodEnd: 0,
            disputeStatus: DisputeStatus.None
        });

        emit MarketCreated(marketId, question, msg.sender);
    }

    // ================================================================
    // |                          PREDICT                             |
    // ================================================================

    /// @notice Make a prediction on a market.
    /// @param marketId The ID of the market.
    /// @param prediction The prediction (Yes or No).
    function predict(uint256 marketId, Prediction prediction) external payable {
        Market memory m = markets[marketId];

        if (m.creator == address(0)) revert MarketDoesNotExist();
        if (m.settled) revert MarketAlreadySettled();
        if (msg.value == 0) revert InvalidAmount();

        UserPrediction memory userPred = predictions[marketId][msg.sender];
        if (userPred.amount != 0) revert AlreadyPredicted();

        predictions[marketId][msg.sender] = UserPrediction({
            amount: msg.value,
            prediction: prediction,
            claimed: false
        });

        if (prediction == Prediction.Yes) {
            markets[marketId].totalYesPool += msg.value;
        } else {
            markets[marketId].totalNoPool += msg.value;
        }

        emit PredictionMade(marketId, msg.sender, prediction, msg.value);
    }

    // ================================================================
    // |                    REQUEST SETTLEMENT                        |
    // ================================================================

    /// @notice Request settlement for a market.
    /// @param marketId The ID of the market to settle.
    function requestSettlement(uint256 marketId) external {
        Market memory m = markets[marketId];

        if (m.creator == address(0)) revert MarketDoesNotExist();
        if (m.settled) revert MarketAlreadySettled();

        emit SettlementRequested(marketId, m.question);
    }

    // ================================================================
    // |                 MARKET SETTLEMENT BY CRE                     |
    // ================================================================

    /// @notice Settles a market from a CRE report with AI-determined outcome.
    /// @param report ABI-encoded (uint256 marketId, Prediction outcome, uint16 confidence)
    function _settleMarket(bytes calldata report) internal {
        (uint256 marketId, Prediction outcome, uint16 confidence) = abi.decode(
            report,
            (uint256, Prediction, uint16)
        );

        Market storage m = markets[marketId];

        if (m.creator == address(0)) revert MarketDoesNotExist();
        if (m.settled) revert MarketAlreadySettled();

        m.settled = true;
        m.confidence = confidence;
        m.settledAt = uint48(block.timestamp);
        m.outcome = outcome;

        // Set dispute period end (24 hours from settlement)
        m.disputePeriodEnd = uint48(block.timestamp + DISPUTE_PERIOD);

        emit MarketSettled(marketId, outcome, confidence);
    }

    // ================================================================
    // |                      DISPUTE SYSTEM                          |
    // ================================================================

    /// @notice Open a dispute for a settled market
    /// @dev User must have participated and stake minimum amount
    /// @param marketId The ID of the market to dispute
    /// @param reason The reason for the dispute
    function openDispute(uint256 marketId, string calldata reason) external payable {
        Market storage m = markets[marketId];

        // Validations
        if (m.creator == address(0)) revert MarketDoesNotExist();
        if (!m.settled) revert MarketNotSettled();
        if (block.timestamp > m.disputePeriodEnd) revert DisputePeriodEnded();
        if (m.disputeStatus != DisputeStatus.None) revert DisputeAlreadyOpen();
        if (msg.value < MIN_DISPUTE_STAKE) revert InsufficientDisputeStake();

        // Only participants can dispute
        UserPrediction memory userPred = predictions[marketId][msg.sender];
        if (userPred.amount == 0) revert NotParticipant();

        // Can only dispute if AI confidence was below threshold
        if (m.confidence >= DISPUTE_CONFIDENCE_THRESHOLD) revert ConfidenceTooHigh();

        // Open the dispute
        m.disputeStatus = DisputeStatus.Open;

        disputes[marketId] = Dispute({
            disputer: msg.sender,
            stake: msg.value,
            reason: reason,
            openedAt: uint48(block.timestamp)
        });

        emit DisputeOpened(marketId, msg.sender, reason, msg.value);
    }

    /// @notice Resolve a dispute (called by CRE workflow)
    /// @param report ABI-encoded (uint256 marketId, bool isValid, Prediction newOutcome, uint16 newConfidence)
    function _resolveDispute(bytes calldata report) internal {
        (uint256 marketId, bool isValid, Prediction newOutcome, uint16 newConfidence) = abi.decode(
            report,
            (uint256, bool, Prediction, uint16)
        );

        Market storage m = markets[marketId];
        Dispute storage d = disputes[marketId];

        if (m.creator == address(0)) revert MarketDoesNotExist();
        if (m.disputeStatus != DisputeStatus.Open) revert DisputeNotOpen();

        if (isValid) {
            // Dispute is valid - update outcome
            m.outcome = newOutcome;
            m.confidence = newConfidence;
            m.disputeStatus = DisputeStatus.ResolvedValid;

            // Return stake to disputer with bonus (10% of stake as reward)
            uint256 reward = d.stake + (d.stake / 10);
            (bool success,) = d.disputer.call{value: reward}("");
            if (!success) revert TransferFailed();

            emit DisputeStakeReturned(marketId, d.disputer, reward);
        } else {
            // Dispute is invalid - stake is slashed
            m.disputeStatus = DisputeStatus.ResolvedInvalid;

            // Stake goes to the winning pool
            if (m.outcome == Prediction.Yes) {
                m.totalYesPool += d.stake;
            } else {
                m.totalNoPool += d.stake;
            }

            emit DisputeStakeSlashed(marketId, d.stake);
        }

        emit DisputeResolved(marketId, isValid, newOutcome, newConfidence);
    }

    // ================================================================
    // |                      CRE ENTRY POINT                         |
    // ================================================================

    /// @inheritdoc ReceiverTemplate
    /// @dev Routes based on prefix byte:
    ///      - No prefix -> Create market
    ///      - 0x01 -> Settle market
    ///      - 0x02 -> Resolve dispute
    function _processReport(bytes calldata report) internal override {
        if (report.length > 0) {
            if (report[0] == 0x01) {
                _settleMarket(report[1:]);
            } else if (report[0] == 0x02) {
                _resolveDispute(report[1:]);
            } else {
                string memory question = abi.decode(report, (string));
                createMarket(question);
            }
        } else {
            string memory question = abi.decode(report, (string));
            createMarket(question);
        }
    }

    // ================================================================
    // |                      CLAIM WINNINGS                          |
    // ================================================================

    /// @notice Claim winnings after market settlement.
    /// @param marketId The ID of the market.
    function claim(uint256 marketId) external {
        Market memory m = markets[marketId];

        if (m.creator == address(0)) revert MarketDoesNotExist();
        if (!m.settled) revert MarketNotSettled();

        // Cannot claim during active dispute
        if (m.disputeStatus == DisputeStatus.Open) revert ClaimsPaused();

        // Cannot claim during dispute period if confidence was low
        if (m.confidence < DISPUTE_CONFIDENCE_THRESHOLD &&
            block.timestamp <= m.disputePeriodEnd &&
            m.disputeStatus == DisputeStatus.None) {
            revert ClaimsPaused();
        }

        UserPrediction memory userPred = predictions[marketId][msg.sender];

        if (userPred.amount == 0) revert NothingToClaim();
        if (userPred.claimed) revert AlreadyClaimed();
        if (userPred.prediction != m.outcome) revert NothingToClaim();

        predictions[marketId][msg.sender].claimed = true;

        uint256 totalPool = m.totalYesPool + m.totalNoPool;
        uint256 winningPool = m.outcome == Prediction.Yes ? m.totalYesPool : m.totalNoPool;
        uint256 payout = (userPred.amount * totalPool) / winningPool;

        (bool success,) = msg.sender.call{value: payout}("");
        if (!success) revert TransferFailed();

        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    // ================================================================
    // |                          GETTERS                             |
    // ================================================================

    /// @notice Get market details.
    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    /// @notice Get user's prediction for a market.
    function getPrediction(uint256 marketId, address user) external view returns (UserPrediction memory) {
        return predictions[marketId][user];
    }

    /// @notice Get dispute details for a market.
    function getDispute(uint256 marketId) external view returns (Dispute memory) {
        return disputes[marketId];
    }

    /// @notice Get the next market ID (total markets created)
    function getNextMarketId() external view returns (uint256) {
        return nextMarketId;
    }

    /// @notice Check if a market can be disputed
    function canDispute(uint256 marketId) external view returns (bool) {
        Market memory m = markets[marketId];
        return m.settled &&
               block.timestamp <= m.disputePeriodEnd &&
               m.disputeStatus == DisputeStatus.None &&
               m.confidence < DISPUTE_CONFIDENCE_THRESHOLD;
    }

    /// @notice Check if claims are available for a market
    function canClaim(uint256 marketId) external view returns (bool) {
        Market memory m = markets[marketId];
        if (!m.settled) return false;
        if (m.disputeStatus == DisputeStatus.Open) return false;
        if (m.confidence < DISPUTE_CONFIDENCE_THRESHOLD &&
            block.timestamp <= m.disputePeriodEnd &&
            m.disputeStatus == DisputeStatus.None) {
            return false;
        }
        return true;
    }
}
