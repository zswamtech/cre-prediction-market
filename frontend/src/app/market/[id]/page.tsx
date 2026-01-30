"use client";

import { ConnectKitButton } from "connectkit";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatEther, parseEther } from "viem";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
  DISPUTE_CONFIDENCE_THRESHOLD,
  MIN_DISPUTE_STAKE,
} from "@/lib/contract";

type Prediction = 0 | 1; // 0 = Yes, 1 = No

export default function MarketDetail() {
  const params = useParams();
  const marketId = BigInt(params.id as string);
  const { address, isConnected } = useAccount();

  const [betAmount, setBetAmount] = useState("0.001");
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction>(0);

  // Read market data
  const { data: market, refetch: refetchMarket } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getMarket",
    args: [marketId],
  });

  // Read user's prediction
  const { data: userPredictionData, refetch: refetchPrediction } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getPrediction",
    args: [marketId, address!],
    query: { enabled: !!address },
  });

  // Debug: log userPrediction structure
  console.log("userPredictionData:", userPredictionData);

  // Normalize userPrediction (handle both tuple and object formats)
  const userPrediction = userPredictionData as {
    amount: bigint;
    prediction: number;
    claimed: boolean;
  } | undefined;

  // Write contracts
  const {
    writeContract: predict,
    data: predictHash,
    isPending: isPredicting,
  } = useWriteContract();

  const {
    writeContract: requestSettlement,
    data: settlementHash,
    isPending: isRequestingSettlement,
  } = useWriteContract();

  const {
    writeContract: claim,
    data: claimHash,
    isPending: isClaiming,
  } = useWriteContract();

  // Wait for transactions
  const { isLoading: isConfirmingPredict, isSuccess: predictSuccess } =
    useWaitForTransactionReceipt({ hash: predictHash });

  const { isLoading: isConfirmingSettlement, isSuccess: settlementSuccess } =
    useWaitForTransactionReceipt({ hash: settlementHash });

  const { isLoading: isConfirmingClaim, isSuccess: claimSuccess } =
    useWaitForTransactionReceipt({ hash: claimHash });

  // Refetch data after successful transactions
  if (predictSuccess || settlementSuccess || claimSuccess) {
    refetchMarket();
    refetchPrediction();
  }

  const handlePredict = () => {
    predict({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "predict",
      args: [marketId, selectedPrediction],
      value: parseEther(betAmount),
    });
  };

  const handleRequestSettlement = () => {
    requestSettlement({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "requestSettlement",
      args: [marketId],
    });
  };

  const handleClaim = () => {
    claim({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "claim",
      args: [marketId],
    });
  };

  if (!market) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  const totalPool = market.totalYesPool + market.totalNoPool;
  const yesPercentage =
    totalPool > 0n
      ? Number((market.totalYesPool * 100n) / totalPool)
      : 50;
  const noPercentage = 100 - yesPercentage;

  const hasUserPredicted = userPrediction && userPrediction.amount > 0n;
  const userWon =
    market.settled &&
    hasUserPredicted &&
    userPrediction.prediction === market.outcome;
  const canClaim = userWon && !userPrediction.claimed;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <Link
          href="/"
          className="text-gray-400 hover:text-white transition flex items-center gap-2"
        >
          ← Back to Markets
        </Link>
        <ConnectKitButton />
      </header>

      {/* Market Info Card */}
      <div className="bg-gray-800/50 backdrop-blur rounded-xl p-8 border border-gray-700 mb-8">
        <div className="flex justify-between items-start mb-6">
          <span className="text-sm bg-purple-600/20 text-purple-400 px-3 py-1 rounded">
            Market #{params.id}
          </span>
          {market.settled ? (
            <span className="text-sm bg-green-600/20 text-green-400 px-3 py-1 rounded">
              Settled
            </span>
          ) : (
            <span className="text-sm bg-yellow-600/20 text-yellow-400 px-3 py-1 rounded">
              Active
            </span>
          )}
        </div>

        <h1 className="text-3xl font-bold text-white mb-6">{market.question}</h1>

        {/* Pool Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-green-900/20 rounded-lg p-4 border border-green-800">
            <p className="text-green-400 text-sm mb-1">YES Pool</p>
            <p className="text-2xl font-bold text-white">
              {formatEther(market.totalYesPool)} ETH
            </p>
            <p className="text-green-400 text-sm">{yesPercentage}%</p>
          </div>
          <div className="bg-red-900/20 rounded-lg p-4 border border-red-800">
            <p className="text-red-400 text-sm mb-1">NO Pool</p>
            <p className="text-2xl font-bold text-white">
              {formatEther(market.totalNoPool)} ETH
            </p>
            <p className="text-red-400 text-sm">{noPercentage}%</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-4 bg-gray-700 rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-green-400"
            style={{ width: `${yesPercentage}%` }}
          />
        </div>

        {/* Settlement Result */}
        {market.settled && (
          <div className="bg-purple-900/30 rounded-lg p-6 border border-purple-700">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-white">
                Settlement Result
              </h3>
              {/* Confidence Badge */}
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  market.confidence >= 9000
                    ? "bg-green-600/20 text-green-400 border border-green-600"
                    : market.confidence >= 7000
                    ? "bg-yellow-600/20 text-yellow-400 border border-yellow-600"
                    : "bg-red-600/20 text-red-400 border border-red-600"
                }`}
              >
                {market.confidence >= 10000
                  ? "🔗 Verified"
                  : market.confidence >= 9000
                  ? "✓ High Confidence"
                  : market.confidence >= 7000
                  ? "⚠ Medium"
                  : "⚡ Low - Disputable"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-gray-400 text-sm">Outcome</p>
                <p
                  className={`text-2xl font-bold ${
                    market.outcome === 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {market.outcome === 0 ? "YES" : "NO"}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Confidence</p>
                <p className="text-2xl font-bold text-white">
                  {market.confidence / 100}%
                </p>
              </div>
            </div>

            {/* Confidence Progress Bar */}
            <div className="mb-4">
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    market.confidence >= 9000
                      ? "bg-green-500"
                      : market.confidence >= 7000
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${market.confidence / 100}%` }}
                />
              </div>
            </div>

            {/* Source indicator */}
            <div className="flex items-center gap-2 text-sm">
              {market.confidence === 10000 ? (
                <>
                  <span className="text-blue-400">🔗</span>
                  <span className="text-gray-400">
                    Verified by Chainlink Price Feeds
                  </span>
                </>
              ) : (
                <>
                  <span className="text-purple-400">🤖</span>
                  <span className="text-gray-400">
                    Powered by Gemini AI via Chainlink CRE
                  </span>
                </>
              )}
            </div>

            {/* Dispute Warning */}
            {market.confidence < DISPUTE_CONFIDENCE_THRESHOLD && (
              <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                <p className="text-yellow-400 text-sm flex items-center gap-2">
                  <span>⚠️</span>
                  <span>
                    Low confidence result. This market may be eligible for dispute
                    in V2 contracts.
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Betting Section */}
        {!market.settled && (
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">
              Make a Prediction
            </h2>

            {!isConnected ? (
              <p className="text-gray-400">Connect your wallet to predict</p>
            ) : hasUserPredicted ? (
              <div className="text-center py-4">
                <p className="text-gray-300 mb-2">You already predicted:</p>
                <p
                  className={`text-2xl font-bold ${
                    userPrediction.prediction === 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {userPrediction.prediction === 0 ? "YES" : "NO"}
                </p>
                <p className="text-gray-400 mt-2">
                  Amount: {formatEther(userPrediction.amount)} ETH
                </p>
              </div>
            ) : (
              <>
                <div className="flex gap-4 mb-4">
                  <button
                    onClick={() => setSelectedPrediction(0)}
                    className={`flex-1 py-3 rounded-lg font-semibold transition ${
                      selectedPrediction === 0
                        ? "bg-green-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    YES
                  </button>
                  <button
                    onClick={() => setSelectedPrediction(1)}
                    className={`flex-1 py-3 rounded-lg font-semibold transition ${
                      selectedPrediction === 1
                        ? "bg-red-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    NO
                  </button>
                </div>

                <div className="mb-4">
                  <label className="block text-gray-400 text-sm mb-2">
                    Amount (ETH)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <button
                  onClick={handlePredict}
                  disabled={isPredicting || isConfirmingPredict}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition"
                >
                  {isPredicting || isConfirmingPredict
                    ? "Confirming..."
                    : `Predict ${selectedPrediction === 0 ? "YES" : "NO"} with ${betAmount} ETH`}
                </button>
              </>
            )}
          </div>
        )}

        {/* Settlement Section */}
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Settlement</h2>

          {market.settled ? (
            <>
              {canClaim ? (
                <div>
                  <p className="text-green-400 mb-4">
                    Congratulations! You won. Claim your winnings below.
                  </p>
                  <button
                    onClick={handleClaim}
                    disabled={isClaiming || isConfirmingClaim}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition"
                  >
                    {isClaiming || isConfirmingClaim
                      ? "Claiming..."
                      : "Claim Winnings"}
                  </button>
                </div>
              ) : hasUserPredicted && userPrediction.claimed ? (
                <p className="text-gray-400">
                  You have already claimed your winnings.
                </p>
              ) : hasUserPredicted ? (
                <p className="text-red-400">
                  Unfortunately, your prediction was incorrect.
                </p>
              ) : (
                <p className="text-gray-400">
                  This market has been settled. You did not participate.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-gray-400 mb-4">
                Request AI-powered settlement via Chainlink CRE. The market will
                be resolved using Gemini AI.
              </p>
              {!isConnected ? (
                <p className="text-gray-400">
                  Connect your wallet to request settlement
                </p>
              ) : (
                <button
                  onClick={handleRequestSettlement}
                  disabled={isRequestingSettlement || isConfirmingSettlement}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition"
                >
                  {isRequestingSettlement || isConfirmingSettlement
                    ? "Requesting..."
                    : "Request Settlement"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dispute Section (V2 Preview) */}
      {market.settled && market.confidence < DISPUTE_CONFIDENCE_THRESHOLD && (
        <div className="mt-8 bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-yellow-700/50">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">⚖️</span>
            <h2 className="text-xl font-bold text-white">Dispute System</h2>
            <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded">
              V2 Preview
            </span>
          </div>

          <p className="text-gray-400 mb-4">
            This market was settled with {market.confidence / 100}% confidence,
            which is below the 90% threshold. In the V2 contract, participants
            can challenge this verdict.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm">Dispute Window</p>
              <p className="text-white font-semibold">24 hours</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm">Min. Stake</p>
              <p className="text-white font-semibold">{MIN_DISPUTE_STAKE} ETH</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm">If Valid</p>
              <p className="text-green-400 font-semibold">Stake + 10%</p>
            </div>
          </div>

          <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-700">
            <h4 className="text-white font-medium mb-2">How Disputes Work</h4>
            <ol className="text-gray-400 text-sm space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-purple-400">1.</span>
                Participant stakes {MIN_DISPUTE_STAKE} ETH with a dispute reason
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400">2.</span>
                CRE triggers Gemini AI to re-evaluate with dispute context
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400">3.</span>
                If valid: outcome reversed, disputer gets stake + 10% bonus
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400">4.</span>
                If invalid: stake distributed to winning pool
              </li>
            </ol>
          </div>

          <p className="text-gray-500 text-xs mt-4">
            Deploy PredictionMarketV2.sol to enable dispute functionality
          </p>
        </div>
      )}

      {/* Transaction Status */}
      {(predictHash || settlementHash || claimHash) && (
        <div className="mt-8 bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-2">
            Transaction Status
          </h3>
          {predictHash && (
            <p className="text-gray-300">
              Predict TX:{" "}
              <a
                href={`https://sepolia.etherscan.io/tx/${predictHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                {predictHash.slice(0, 10)}...{predictHash.slice(-8)}
              </a>
            </p>
          )}
          {settlementHash && (
            <p className="text-gray-300">
              Settlement TX:{" "}
              <a
                href={`https://sepolia.etherscan.io/tx/${settlementHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                {settlementHash.slice(0, 10)}...{settlementHash.slice(-8)}
              </a>
            </p>
          )}
          {claimHash && (
            <p className="text-gray-300">
              Claim TX:{" "}
              <a
                href={`https://sepolia.etherscan.io/tx/${claimHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                {claimHash.slice(0, 10)}...{claimHash.slice(-8)}
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
