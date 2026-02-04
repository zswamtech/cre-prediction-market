"use client";

import { ConnectKitButton } from "connectkit";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, parseEther, encodeAbiParameters, concat, toHex, keccak256, encodePacked } from "viem";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
} from "@/lib/contract";

const SEP_CHAINLINK_FORWARDER = "0x15fc6ae953e024d975e77382eeec56a9101f9f88";

export default function MarketDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { isConnected } = useAccount();
  const isTest = process.env.NEXT_PUBLIC_TEST_MODE === '1';
  const [amount, setAmount] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState<0 | 1 | null>(null); // 0 = Yes, 1 = No
  const [testHash, setTestHash] = useState<string | null>(null);

  // Parse ID securely
  const marketId = id ? BigInt(Array.isArray(id) ? id[0] : id) : undefined;

  const { data: marketResult, isLoading, refetch } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getMarket",
    args: marketId !== undefined ? [marketId] : undefined,
    query: {
      enabled: marketId !== undefined,
      // Disable cache for fresh data
      gcTime: 0,
      staleTime: 0,
    }
  });

  const { data: hash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  
  // Debug effect
  useEffect(() => {
    if (hash) console.log("Transaction Hash Generated:", hash);
  }, [hash]);

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Auto-refresh logic
  useEffect(() => {
    const interval = setInterval(() => {
      console.log("🔄 Refreshing market...");
      refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [refetch]);

  useEffect(() => {
    if (isSuccess) {
      setAmount("");
      setSelectedOutcome(null);
      refetch();
    }
  }, [isSuccess, refetch]);

  const { data: ownerAddress } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "owner",
  });

  // Safe check for owner without calling hooks conditionally
  const userAccount = useAccount();
  const isOwner = isConnected && ownerAddress && userAccount.address === ownerAddress;
  const [adminProcessing, setAdminProcessing] = useState(false);

  const handleSettleMarket = async (outcome: 0 | 1) => {
    if (!marketId || !isOwner) return;
    setAdminProcessing(true);

    try {
      // 1. Set Forwarder to self
      console.log("Setting forwarder to self...");
      await writeContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: "setForwarderAddress",
        args: [useAccount().address!],
      });
      // Note: In a real app we'd wait for tx confirmation here properly, 
      // but wagmi's writeContract is async. 
      // For this simplified UI, user might need to click multiple times or we rely on user waiting.
      // Better flow: 3 separate buttons/steps or a sequenced call if we had a multicall (which we don't for these permissions).
      
      alert("Step 1: Pushed 'Set Forwarder'. Confirm in wallet, wait for it to mine, then click Settle again.");
    } catch (err) {
      console.error(err);
    }
    setAdminProcessing(false);
  };

  const handleForceSettleStep2 = (outcome: 0 | 1) => {
    if (!marketId) return;
    // Construct Report: [0x01] + [marketId, outcome, confidence]
    // confidence 10000 = 100%
    const reportData = encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint8" }, // Prediction enum
        { type: "uint16" },
      ],
      [marketId, outcome, 10000]
    );

    const fullReport = concat([
      "0x01", // Prefix for settlement
      reportData
    ]);

    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "onReport",
      args: ["0x", fullReport], // empty metadata
    });
  };

  const handleRestoreForwarder = () => {
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "setForwarderAddress",
      args: [SEP_CHAINLINK_FORWARDER],
    });
  };

  const handleClaim = () => {
    if (!marketId) return;
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "claim",
      args: [marketId],
    });
  };

  if (!marketId) return <div className="p-8 text-center">Invalid Market ID</div>;
  if (isLoading) return <div className="p-8 text-center text-white">Loading market data...</div>;
  if (!marketResult) return <div className="p-8 text-center text-red-400">Market not found</div>;


  const handlePredict = () => {
    if (!amount || selectedOutcome === null || marketId === undefined) return;
    
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "predict",
      args: [marketId, selectedOutcome],
      value: parseEther(amount),
    });
  };

  const handleRequestSettlement = () => {
    if (!marketId) return;
    // In E2E test mode, simulate a transaction hash without wallet
    if (isTest) {
      setTestHash(
        '0x' + 'e2e'.padEnd(8, '0') + 'cafebabedeadbeef'.padEnd(56, '0')
      );
      return;
    }
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "requestSettlement",
      args: [marketId],
    });
  };

  const market = marketResult;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <Link 
          href="/" 
          className="text-gray-400 hover:text-white transition flex items-center gap-2 mb-4"
        >
          ← Back to Markets
        </Link>
        <header className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs bg-purple-600/20 text-purple-400 px-2 py-1 rounded">
                Market #{marketId.toString()}
              </span>
              {market.settled ? (
                <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded">
                  ✓ Settled
                </span>
              ) : (
                <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded">
                  ● Active
                </span>
              )}
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">
              {market.question}
            </h1>
          </div>
          <ConnectKitButton />
        </header>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">Market Stats</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-700/30 rounded-lg">
                <span className="text-gray-300">Yes Pool</span>
                <span className="font-mono text-green-400 text-lg">
                  {formatEther(market.totalYesPool)} ETH
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-700/30 rounded-lg">
                <span className="text-gray-300">No Pool</span>
                <span className="font-mono text-red-400 text-lg">
                  {formatEther(market.totalNoPool)} ETH
                </span>
              </div>
            </div>
          </div>


          {market.settled && (
             <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">Result</h2>
              <div className="text-center py-4">
                 <p className="text-gray-400 mb-2">Outcome</p>
                 <div className={`text-4xl font-bold ${market.outcome === 0 ? "text-green-500" : "text-red-500"}`}>
                   {market.outcome === 0 ? "YES" : "NO"}
                 </div>
                 <p className="text-sm text-gray-500 mt-2">
                   Confidence: {market.confidence / 100}%
                 </p>
              </div>
              <button
                onClick={handleClaim}
                disabled={isWritePending || isConfirming}
                className="w-full mt-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-bold py-3 rounded-xl transition"
              >
                Claim Winnings
              </button>
             </div>
          )}
        </div>


        {!market.settled && (
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700 h-fit">
            <h2 className="text-xl font-semibold text-white mb-6">Place Prediction</h2>
            
            {!isConnected && !isTest ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">Connect wallet to predict</p>
                <ConnectKitButton />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSelectedOutcome(0)}
                    className={`p-4 rounded-xl border-2 transition text-lg font-bold ${
                      selectedOutcome === 0
                        ? "border-green-500 bg-green-500/20 text-green-400"
                        : "border-gray-700 hover:border-green-500/50 text-gray-400"
                    }`}
                  >
                    YES
                  </button>
                  <button
                    onClick={() => setSelectedOutcome(1)}
                    className={`p-4 rounded-xl border-2 transition text-lg font-bold ${
                      selectedOutcome === 1
                        ? "border-red-500 bg-red-500/20 text-red-400"
                        : "border-gray-700 hover:border-red-500/50 text-gray-400"
                    }`}
                  >
                    NO
                  </button>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Amount (ETH)
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.01"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition"
                    min="0"
                    step="0.001"
                  />
                </div>

                {writeError && (
                  <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg">
                    {writeError.message.split("\n")[0]}
                  </div>
                )}

                {isSuccess && !isConfirming && (
                   <div className="text-green-400 text-sm bg-green-900/20 p-3 rounded-lg">
                     Transaction confirmed!
                   </div>
                 )}

                <button
                  onClick={handlePredict}
                  disabled={!amount || selectedOutcome === null || isWritePending || isConfirming}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition"
                >
                  {isWritePending || isConfirming ? "Processing..." : "Submit Prediction"}
                </button>

                 {/* AI Settlement Button */}
                 <div className="pt-6 border-t border-gray-700 mt-6">
                   <h3 className="text-sm font-semibold text-gray-300 mb-3">Settlement</h3>
                   <button
                     onClick={handleRequestSettlement}
                     disabled={isWritePending || isConfirming}
                     className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
                     data-testid="ai-settlement-button"
                   >
                     <span>🤖</span> Request AI Settlement
                   </button>                    {(hash || testHash) && (
                      <div className="mt-2 text-xs bg-black/40 p-2 rounded border border-blue-500/30 text-blue-200 break-all">
                        <p className="font-bold text-blue-400 mb-1">TX Hash (Copia este!):</p>
                        {hash || testHash}
                      </div>
                    )}                   <p className="text-xs text-gray-500 mt-2 text-center">
                     This triggers Gemini AI to resolve the market.
                   </p>
                 </div>
              </div>
            )}
            
            {/* Admin Tool for Forcing Settlement (Only visible to Owner) */}
            {isOwner && (
               <div className="mt-8 pt-6 border-t border-gray-700">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">⚠️ Admin Zone</h3>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 mb-2">
                      Force settle market for testing.
                      <br/>Step 1: Set Forwarder to your address.
                      <br/>Step 2: Submit settlement report.
                      <br/>Step 3: Restore Forwarder.
                    </p>
                    <button 
                      onClick={() => handleSettleMarket(0)}
                      className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded w-full mb-2"
                    >
                      Step 1: Set Me as Forwarder
                    </button>
                    <div className="flex gap-2">
                        <button 
                        onClick={() => handleForceSettleStep2(0)}
                        className="flex-1 text-xs bg-green-900 text-green-200 px-2 py-1 rounded"
                        >
                        Step 2: Settle YES
                        </button>
                        <button 
                        onClick={() => handleForceSettleStep2(1)}
                        className="flex-1 text-xs bg-red-900 text-red-200 px-2 py-1 rounded"
                        >
                        Step 2: Settle NO
                        </button>
                    </div>
                    <button 
                      onClick={handleRestoreForwarder}
                      className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded w-full mt-2"
                    >
                      Step 3: Restore Real Forwarder
                    </button>
                  </div>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
