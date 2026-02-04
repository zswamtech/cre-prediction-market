// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IRouterClient} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/// @title PredictionMarketSender
/// @notice Helps users on satellite chains send bets to the main PredictionMarket on Sepolia
/// @dev Wraps native ETH to WETH and transfers it alongside the prediction message
contract PredictionMarketSender {
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;

    // ================================================================
    // |                        ERRORS                                |
    // ================================================================
    error NotEnoughBalanceForFees(uint256 currentBalance, uint256 calculatedFees);
    error InvalidPrediction();
    error InvalidAmount();

    // ================================================================
    // |                        STATE VARIABLES                       |
    // ================================================================
    IRouterClient public immutable i_router;
    address public immutable i_destinationContract;
    uint64 public immutable i_destinationChainSelector;
    IWETH public immutable i_weth; // Wrapped Native Token address for the current chain

    // ================================================================
    // |                        EVENTS                                |
    // ================================================================
    event PredictionSent(
        bytes32 indexed messageId,
        uint256 indexed marketId,
        uint8 prediction,
        address predictor,
        uint256 amountSent,
        uint256 fees
    );

    // ================================================================
    // |                      CONSTRUCTOR                             |
    // ================================================================
    constructor(address router, address destinationContract, uint64 destinationChainSelector, address weth) {
        i_router = IRouterClient(router);
        i_destinationContract = destinationContract;
        i_destinationChainSelector = destinationChainSelector;
        i_weth = IWETH(weth);
    }

    // ================================================================
    // |                        FUNCTIONS                             |
    // ================================================================
    
    /// @notice Place a bet on a market on the main chain.
    /// @dev Wraps the 'betAmount' of ETH into WETH and sends it via CCIP. 
    ///      The remaining msg.value is used for CCIP fees.
    /// @param marketId The ID of the market to bet on.
    /// @param prediction The prediction (0 = Yes, 1 = No).
    /// @param betAmount The amount of ETH (in wei) to wager.
    function predictCrossChain(
        uint256 marketId,
        uint8 prediction,
        uint256 betAmount
    ) external payable returns (bytes32 messageId) {
        if (prediction > 1) revert InvalidPrediction();
        if (betAmount == 0) revert InvalidAmount();
        
        // 1. Wrap the bet amount to WETH
        // We rely on IWETH existing interface. 
        // Ensure user sent enough ETH for bet + fees.
        if (address(this).balance < betAmount) revert InvalidAmount();

        i_weth.deposit{value: betAmount}();

        // 2. Construct the CCIP Token Amount
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({
            token: address(i_weth),
            amount: betAmount
        });

        // 3. Encode the payload
        // We emit: predictor, marketId, prediction
        bytes memory data = abi.encode(msg.sender, marketId, prediction);

        // 4. Build the CCIP Message
        Client.EVM2AnyMessage memory evm2AnyMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(i_destinationContract),
            data: data,
            tokenAmounts: tokenAmounts,
            extraArgs: Client._argsToBytes(
                // Gas limit for execution on destination chain
                Client.EVMExtraArgsV1({gasLimit: 300_000}) 
            ),
            feeToken: address(0) // Pay fees in native ETH
        });

        // 5. Calculate and Pay Fees
        uint256 fees = i_router.getFee(i_destinationChainSelector, evm2AnyMessage);
        
        // Check if we have enough ETH left after wrapping
        if (address(this).balance < fees) {
            revert NotEnoughBalanceForFees(address(this).balance, fees);
        }

        // Approve router to spend WETH
        i_weth.upgradeTo(address(i_weth)); // SafeERC20 compatibility trick if needed, usually just approve
        IERC20(address(i_weth)).approve(address(i_router), betAmount);

        // Send message
        messageId = i_router.ccipSend{value: fees}(
            i_destinationChainSelector,
            evm2AnyMessage
        );

        emit PredictionSent(messageId, marketId, prediction, msg.sender, betAmount, fees);

        // 6. Refund excess ETH to user
        uint256 remaining = address(this).balance;
        if (remaining > 0) {
            (bool success, ) = msg.sender.call{value: remaining}("");
            require(success, "Refund failed");
        }
    }

    /// @notice Allows funding the contract for operational costs if needed
    receive() external payable {}
}
