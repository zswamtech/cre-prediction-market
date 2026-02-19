"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import Link from "next/link";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
  DISPUTE_CONFIDENCE_THRESHOLD,
} from "@/lib/contract";
import { useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";

const POLICIES_LIMIT = 12;

function PoolBar({ yesPool, noPool }: { yesPool: bigint; noPool: bigint }) {
  const total = yesPool + noPool;
  if (total === 0n) return null;
  const yesPct = Number((yesPool * 100n) / total);
  return (
    <div className="w-full h-2 rounded-full bg-gray-700/50 overflow-hidden flex">
      <div
        className="h-full bg-green-500/70 transition-all duration-500"
        style={{ width: `${yesPct}%` }}
      />
      <div
        className="h-full bg-red-500/70 transition-all duration-500"
        style={{ width: `${100 - yesPct}%` }}
      />
    </div>
  );
}

export default function Home() {
  const { isConnected } = useAccount();

  const { data: nextMarketId, isLoading, error, refetch: refetchMarkets } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getNextMarketId",
    query: { gcTime: 0, staleTime: 0 },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      refetchMarkets();
    }, 10000);
    return () => clearInterval(interval);
  }, [refetchMarkets]);

  const marketCount = nextMarketId ? Number(nextMarketId) : 0;

  const marketCalls = Array.from({ length: marketCount }, (_, i) => ({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getMarket" as const,
    args: [BigInt(i)] as const,
  }));

  const { data: markets, refetch: refetchMarketsList } = useReadContracts({
    contracts: marketCalls,
    query: { gcTime: 0, staleTime: 0 },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (marketCount > 0) refetchMarketsList();
    }, 10000);
    return () => clearInterval(interval);
  }, [refetchMarketsList, marketCount]);

  const orderedMarkets = useMemo(() => {
    if (!markets) return [];
    return markets
      .map((result, marketId) => ({ result, marketId }))
      .sort((a, b) => b.marketId - a.marketId)
      .slice(0, POLICIES_LIMIT);
  }, [markets]);

  const activeCount = markets?.filter(m => m.status === "success" && !m.result?.settled).length || 0;
  const settledCount = markets?.filter(m => m.status === "success" && m.result?.settled).length || 0;
  const totalPoolEth = useMemo(() => {
    if (!markets) return "0";
    let total = 0n;
    for (const m of markets) {
      if (m.status === "success" && m.result) {
        total += m.result.totalYesPool + m.result.totalNoPool;
      }
    }
    return formatEther(total);
  }, [markets]);

  const inferPolicyIcon = (question: string) => {
    if (/\b(vuelo|flight|delay|retras|cancelad|cancelled)\b/i.test(question)) return "✈️";
    return "🏠";
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <section className="relative py-16 md:py-24 text-center overflow-hidden">
        {/* Background orbs */}
        <div className="absolute top-0 left-1/4 w-72 h-72 bg-purple-600/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl animate-float" style={{ animationDelay: "1.5s" }} />

        <div className="relative z-10">
          <h1 className="text-5xl md:text-7xl font-extrabold mb-4 animate-fade-in-up">
            <span className="gradient-text">FairLease</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 max-w-2xl mx-auto mb-3 animate-fade-in-up-delay-1">
            Seguro parametrico de experiencias
          </p>
          <p className="text-base text-gray-400 max-w-xl mx-auto mb-8 animate-fade-in-up-delay-2">
            Proteccion automatica para tu vuelo y tu estadia. Verificado por Chainlink CRE + IA.
          </p>
          <div className="flex flex-wrap justify-center gap-4 animate-fade-in-up-delay-3">
            <Link href="/create">
              <Button variant="primary" size="lg">Crear Poliza</Button>
            </Link>
            {isConnected && (
              <Link href="/dashboard">
                <Button variant="outline" size="lg">Mi Dashboard</Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 mb-8">
        <h2 className="text-2xl font-bold text-white text-center mb-10">Como funciona</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="text-center animate-fade-in-up">
            <div className="text-4xl mb-4">🛡️</div>
            <h3 className="text-lg font-semibold text-white mb-2">1. Crea tu poliza</h3>
            <p className="text-sm text-gray-400">
              Define la condicion parametrica: retraso de vuelo, calidad de estadia, clima severo.
            </p>
          </Card>
          <Card className="text-center animate-fade-in-up-delay-1">
            <div className="text-4xl mb-4">💎</div>
            <h3 className="text-lg font-semibold text-white mb-2">2. Aporta al pool</h3>
            <p className="text-sm text-gray-400">
              Toma posicion SI o NO con ETH. Los fondos quedan en el smart contract en Sepolia.
            </p>
          </Card>
          <Card className="text-center animate-fade-in-up-delay-2">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-lg font-semibold text-white mb-2">3. Liquidacion automatica</h3>
            <p className="text-sm text-gray-400">
              Chainlink CRE orquesta oracle de vuelos + Gemini IA para verificar y liquidar onchain.
            </p>
          </Card>
        </div>
      </section>

      {/* Stats */}
      <section className="mb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Polizas totales" value={marketCount} />
          <StatCard label="Activas" value={activeCount} color="yellow" />
          <StatCard label="Resueltas" value={settledCount} color="green" />
          <StatCard label="Pool total" value={`${totalPoolEth} ETH`} color="purple" />
        </div>
      </section>

      {/* Policies Grid */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Polizas</h2>
          {marketCount > POLICIES_LIMIT && (
            <span className="text-xs text-gray-500">
              Mostrando {POLICIES_LIMIT} de {marketCount}
            </span>
          )}
        </div>

        {error && (
          <Card className="mb-6 border-red-700/50">
            <p className="text-red-400 text-sm">Error cargando polizas: {error.message}</p>
          </Card>
        )}

        {isLoading ? (
          <Card className="text-center py-12">
            <div className="animate-shimmer h-4 bg-gray-700 rounded w-1/3 mx-auto mb-4" />
            <p className="text-gray-400">Cargando polizas...</p>
          </Card>
        ) : marketCount === 0 ? (
          <Card className="text-center py-12">
            <p className="text-gray-400 text-lg mb-4">Aun no hay polizas.</p>
            {isConnected && (
              <Link href="/create">
                <Button variant="primary">Crear la primera poliza</Button>
              </Link>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orderedMarkets.map(({ result, marketId }) => {
              if (result.status !== "success" || !result.result) return null;
              const market = result.result;
              const icon = inferPolicyIcon(market.question || "");

              return (
                <Link key={marketId} href={`/market/${marketId}`}>
                  <Card hover className="h-full group">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="info">#{marketId}</Badge>
                        <span className="text-lg">{icon}</span>
                      </div>
                      {market.settled ? (
                        <Badge variant="settled">Resuelta</Badge>
                      ) : (
                        <Badge variant="active">Activa</Badge>
                      )}
                    </div>

                    <h3 className="text-sm font-semibold text-white mb-4 group-hover:text-purple-400 transition line-clamp-3">
                      {market.question}
                    </h3>

                    <PoolBar yesPool={market.totalYesPool} noPool={market.totalNoPool} />

                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">SI</span>
                        <span className="text-green-400 font-mono">
                          {formatEther(market.totalYesPool)} ETH
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">NO</span>
                        <span className="text-red-400 font-mono">
                          {formatEther(market.totalNoPool)} ETH
                        </span>
                      </div>
                    </div>

                    {market.settled && (
                      <div className="mt-3 pt-3 border-t border-gray-700/50">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-400">
                            Resultado:{" "}
                            <span className={market.outcome === 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                              {market.outcome === 0 ? "SI" : "NO"}
                            </span>
                          </span>
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded ${
                              market.confidence >= 10000
                                ? "bg-blue-600/20 text-blue-400"
                                : market.confidence >= DISPUTE_CONFIDENCE_THRESHOLD
                                ? "bg-green-600/20 text-green-400"
                                : "bg-yellow-600/20 text-yellow-400"
                            }`}
                          >
                            {market.confidence >= 10000
                              ? "Verificado"
                              : `${market.confidence / 100}%`}
                          </span>
                        </div>
                      </div>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
