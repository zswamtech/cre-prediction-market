"use client";

import { ConnectKitButton } from "connectkit";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import Link from "next/link";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
  DISPUTE_CONFIDENCE_THRESHOLD
} from "@/lib/contract";
import { useEffect, useState } from "react";

export default function Home() {
  const { isConnected } = useAccount();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const { data: nextMarketId, isLoading, error, refetch: refetchMarkets } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getNextMarketId",
    query: {
      // ✅ Deshabilitar caché de wagmi
      gcTime: 0,
      staleTime: 0,
    }
  });

  // ✅ Auto-refresh cada 10 segundos
  useEffect(() => {
    // Inicializar en el cliente
    setLastRefresh(new Date());
    
    const interval = setInterval(() => {
      console.log("🔄 Refrescando mercados...");
      refetchMarkets();
      setLastRefresh(new Date());
    }, 10000);

    return () => clearInterval(interval);
  }, [refetchMarkets]);

  // Debug logging
  useEffect(() => {
    console.log("nextMarketId:", nextMarketId);
    console.log("isLoading:", isLoading);
    console.log("error:", error);
  }, [nextMarketId, isLoading, error]);

  const marketCount = nextMarketId ? Number(nextMarketId) : 0;

  const marketCalls = Array.from({ length: marketCount }, (_, i) => ({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getMarket" as const,
    args: [BigInt(i)] as const,
  }));

  const { data: markets, refetch: refetchMarketsList } = useReadContracts({
    contracts: marketCalls,
    query: {
      // ✅ Deshabilitar caché de wagmi
      gcTime: 0,
      staleTime: 0,
    }
  });

  // ✅ Debug: Log market states
  useEffect(() => {
    if (markets) {
      console.log("📊 Markets data:", markets);
      markets.forEach((m, idx) => {
        if (m.status === "success" && m.result) {
          console.log(`Market #${idx}:`, {
            settled: m.result.settled,
            question: m.result.question,
            yesPool: formatEther(m.result.totalYesPool),
            noPool: formatEther(m.result.totalNoPool),
            outcome: m.result.settled ? (m.result.outcome === 0 ? "YES" : "NO") : "N/A",
            confidence: m.result.settled ? `${m.result.confidence / 100}%` : "N/A",
          });
        }
      });
    }
  }, [markets]);

  // ✅ También refresca la lista de mercados
  useEffect(() => {
    const interval = setInterval(() => {
      if (marketCount > 0) {
        console.log("🔄 Refrescando lista de mercados...");
        refetchMarketsList();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [refetchMarketsList, marketCount]);

  // Función manual de refresh
  const handleManualRefresh = () => {
    console.log("🔄 Refresh manual...");
    refetchMarkets();
    refetchMarketsList();
    setLastRefresh(new Date());
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">
            🏠 FairLease — Seguro paramétrico (CRE)
          </h1>
          <p className="text-gray-400">
            Pool de garantías + liquidación automática con IA y datos reales
          </p>
        </div>
        <div className="flex gap-4 items-center">
          {isConnected && (
            <Link
              href="/create"
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition"
            >
              + Crear póliza
            </Link>
          )}
          <ConnectKitButton />
        </div>
      </header>

      {/* Auto-refresh indicator */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            Última actualización: {lastRefresh?.toLocaleTimeString() || 'Cargando...'}
          </span>
          <button
            onClick={handleManualRefresh}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded transition"
          >
            🔄 Actualizar ahora
          </button>
        </div>
        <span className="text-xs text-gray-500">
          Actualización automática cada 10s
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
          <p className="text-gray-400 text-sm">Pólizas totales</p>
          <p className="text-3xl font-bold text-white">{marketCount}</p>
        </div>
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
          <p className="text-gray-400 text-sm">Activas</p>
          <p className="text-3xl font-bold text-yellow-400">
            {markets?.filter(m => m.status === "success" && !m.result?.settled).length || 0}
          </p>
        </div>
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
          <p className="text-gray-400 text-sm">Resueltas</p>
          <p className="text-3xl font-bold text-green-400">
            {markets?.filter(m => m.status === "success" && m.result?.settled).length || 0}
          </p>
        </div>
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
          <p className="text-gray-400 text-sm">Red</p>
          <p className="text-2xl font-bold text-purple-400">Sepolia</p>
        </div>
      </div>

      {/* Verification signals used by the CRE workflow */}
      <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-xl p-6 border border-purple-700/50 mb-8">
        <h3 className="text-lg font-semibold text-white mb-3">
          Orquestación CRE (cómo se verifica)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <p className="text-white font-medium">Veredicto IA</p>
              <p className="text-gray-400">Gemini (SÍ/NO + confianza)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏠</span>
            <div>
              <p className="text-white font-medium">Oracle urbano</p>
              <p className="text-gray-400">Ruido, seguridad, obras, transporte</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌦️</span>
            <div>
              <p className="text-white font-medium">Clima</p>
              <p className="text-gray-400">Open‑Meteo (precipitación / viento)</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-4">
          Nota: En esta demo la póliza se modela como un contrato SÍ/NO con pools
          (tipo prediction market). Roadmap: colateral en stablecoin + disputas (V2).
        </p>
      </div>

      <h2 className="text-2xl font-bold text-white mb-6">Pólizas</h2>

      {error && (
        <div className="bg-red-900/50 border border-red-500 rounded-xl p-4 mb-6">
          <p className="text-red-400 text-sm">
            Error cargando pólizas: {error.message}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-12 border border-gray-700 text-center">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-1/3 mx-auto mb-4"></div>
            <p className="text-gray-400">Cargando pólizas...</p>
          </div>
        </div>
      ) : marketCount === 0 ? (
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-12 border border-gray-700 text-center">
          <p className="text-gray-400 text-lg">Aún no hay pólizas.</p>
          {isConnected && (
            <Link
              href="/create"
              className="inline-block mt-4 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition"
            >
              Crear la primera póliza
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {markets?.map((result, index) => {
            if (result.status !== "success" || !result.result) return null;
            const market = result.result;

            return (
              <Link
                key={index}
                href={`/market/${index}`}
                className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700 hover:border-purple-500 transition group"
              >
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs bg-purple-600/20 text-purple-400 px-2 py-1 rounded">
                    Póliza #{index}
                  </span>
                  {market.settled ? (
                    <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded flex items-center gap-1">
                      ✓ Resuelta
                    </span>
                  ) : (
                    <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded flex items-center gap-1">
                      ● Activa
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-semibold text-white mb-4 group-hover:text-purple-400 transition">
                  {market.question}
                </h3>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Pool SÍ (payout)</span>
                    <span className="text-green-400">
                      {formatEther(market.totalYesPool)} ETH
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Pool NO (sin reclamo)</span>
                    <span className="text-red-400">
                      {formatEther(market.totalNoPool)} ETH
                    </span>
                  </div>
                </div>

                {market.settled && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-gray-400">
                        Resultado:{" "}
                        <span
                          className={
                            market.outcome === 0 ? "text-green-400" : "text-red-400"
                          }
                        >
                          {market.outcome === 0 ? "SÍ (payout)" : "NO (sin reclamo)"}
                        </span>
                      </p>
                      {/* Confidence indicator */}
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          market.confidence >= 10000
                            ? "bg-blue-600/20 text-blue-400"
                            : market.confidence >= DISPUTE_CONFIDENCE_THRESHOLD
                            ? "bg-green-600/20 text-green-400"
                            : "bg-yellow-600/20 text-yellow-400"
                        }`}
                      >
                        {market.confidence >= 10000
                          ? "🔗 Verificado"
                          : market.confidence >= DISPUTE_CONFIDENCE_THRESHOLD
                          ? `${market.confidence / 100}%`
                          : `⚠ ${market.confidence / 100}%`}
                      </span>
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
