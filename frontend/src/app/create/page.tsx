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
          <h2 className="text-2xl font-bold text-white mb-4">¡Póliza creada!</h2>
          <p className="text-gray-400 mb-6">
            La póliza paramétrica se creó correctamente.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/"
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition"
            >
              Ver pólizas
            </Link>
            <a
              href={`https://sepolia.etherscan.io/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-medium transition"
            >
              Ver en Etherscan ↗
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
            ← Volver a pólizas
          </Link>
          <h1 className="text-3xl font-bold text-white mt-2">Crear póliza</h1>
        </div>
        <ConnectKitButton />
      </header>

      {/* Form */}
      <div className="max-w-2xl mx-auto">
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-8 border border-gray-700">
          {!isConnected ? (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">
                Conecta tu wallet para crear una póliza
              </p>
              <ConnectKitButton />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-gray-400 mb-2">
                  Condición de la póliza (SÍ/NO)
                </label>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="¿Debe activarse el payout si en la última hora hubo ruido >70 dB, seguridad <5, obras o clima severo?"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none"
                  rows={3}
                  required
                />
                <p className="text-gray-500 text-sm mt-2">
                  Debe ser una condición binaria verificable por CRE (oráculo + clima + IA)
                </p>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                <h3 className="text-white font-medium mb-2">📋 Cómo funciona (demo)</h3>
                <ul className="text-gray-400 text-sm space-y-1">
                  <li>• Aportas ETH al pool SÍ (payout) o NO (sin reclamo)</li>
                  <li>• Cualquiera puede solicitar liquidación cuando esté listo</li>
                  <li>• Chainlink CRE orquesta: Oracle IoT + Open‑Meteo + Gemini</li>
                  <li>• El workflow escribe el reporte onchain y habilita reclamos</li>
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
                  ? "⏳ Confirma en tu wallet..."
                  : isConfirming
                  ? "⏳ Creando póliza..."
                  : "🛡️ Crear póliza"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
