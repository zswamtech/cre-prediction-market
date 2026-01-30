"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectKitButton } from "connectkit";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import Link from "next/link";
import { PREDICTION_MARKET_ADDRESS, PREDICTION_MARKET_ABI } from "@/lib/contract";

export default function CreateMarket() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const [question, setQuestion] = useState("");

  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "createMarket",
      args: [question],
    });
  };

  if (isSuccess) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto bg-gray-800/50 backdrop-blur rounded-xl p-8 border border-gray-700 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-white mb-4">Market Created!</h2>
          <p className="text-gray-400 mb-6">
            Your prediction market has been created successfully.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/"
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition"
            >
              View Markets
            </Link>
            <a
              href={`https://sepolia.etherscan.io/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-medium transition"
            >
              View on Etherscan ↗
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <header className="flex justify-between items-center mb-12">
        <div>
          <Link href="/" className="text-gray-400 hover:text-white transition">
            ← Back to Markets
          </Link>
          <h1 className="text-3xl font-bold text-white mt-2">Create Market</h1>
        </div>
        <ConnectKitButton />
      </header>

      {/* Form */}
      <div className="max-w-2xl mx-auto">
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-8 border border-gray-700">
          {!isConnected ? (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">
                Connect your wallet to create a market
              </p>
              <ConnectKitButton />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-gray-400 mb-2">
                  Market Question
                </label>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Will Bitcoin exceed $100k in 2026?"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none"
                  rows={3}
                  required
                />
                <p className="text-gray-500 text-sm mt-2">
                  Ask a yes/no question that can be verified by AI
                </p>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                <h3 className="text-white font-medium mb-2">📋 How it works</h3>
                <ul className="text-gray-400 text-sm space-y-1">
                  <li>• Users can stake ETH on YES or NO</li>
                  <li>• Anyone can request settlement when ready</li>
                  <li>• Chainlink CRE + Gemini AI determines the outcome</li>
                  <li>• Winners share the losing pool proportionally</li>
                </ul>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                  <p className="text-red-400 text-sm">
                    Error: {error.message}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isPending || isConfirming || !question.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition"
              >
                {isPending
                  ? "⏳ Confirm in Wallet..."
                  : isConfirming
                  ? "⏳ Creating Market..."
                  : "🔮 Create Market"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}