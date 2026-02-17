"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import Link from "next/link";
import { PREDICTION_MARKET_ADDRESS, PREDICTION_MARKET_ABI } from "@/lib/contract";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

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
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <Card className="text-center py-10">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-white mb-4">Poliza creada!</h2>
          <p className="text-gray-400 mb-8">
            La poliza parametrica se creo correctamente.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/"
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-medium transition"
            >
              Ver polizas
            </Link>
            <a
              href={`https://sepolia.etherscan.io/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-medium transition"
            >
              Ver en Etherscan ↗
            </a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Crear poliza</h1>
        <p className="text-gray-400">
          Define una condicion parametrica que sera evaluada por Chainlink CRE + Gemini AI.
        </p>
      </div>

      {/* Form */}
      <Card>
        {!isConnected ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">🔒</div>
            <p className="text-gray-400 mb-2">
              Conecta tu wallet para crear una poliza
            </p>
            <p className="text-gray-500 text-sm">
              Usa el boton de conectar en la barra de navegacion.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Condicion de la poliza (SI/NO)
              </label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="¿Debe activarse el payout si en la ultima hora hubo ruido >70 dB, seguridad <5, obras o clima severo?"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none transition"
                rows={3}
                required
              />
              <p className="text-gray-500 text-sm mt-2">
                Debe ser una condicion binaria verificable por CRE (oraculo + clima + IA)
              </p>
            </div>

            <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-700/50">
              <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <span>📋</span> Como funciona
              </h3>
              <ul className="text-gray-400 text-sm space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">1.</span>
                  Aportas ETH al pool SI (payout) o NO (sin reclamo)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">2.</span>
                  Cualquiera puede solicitar liquidacion cuando este listo
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">3.</span>
                  Chainlink CRE orquesta: Oracle IoT + Open-Meteo + Gemini
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">4.</span>
                  El workflow escribe el reporte onchain y habilita reclamos
                </li>
              </ul>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-xl p-4">
                <p className="text-red-400 text-sm">
                  Error: {error.message}
                </p>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={isPending || isConfirming || !question.trim()}
              loading={isPending || isConfirming}
            >
              {isPending
                ? "Confirma en tu wallet..."
                : isConfirming
                  ? "Creando poliza..."
                  : "Crear poliza"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
