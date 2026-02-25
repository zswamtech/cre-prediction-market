"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatEther, hexToString } from "viem";
import Link from "next/link";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
  PREDICTION_MARKET_V3_ADDRESS,
  PREDICTION_MARKET_V3_ABI,
  DISPUTE_CONFIDENCE_THRESHOLD,
} from "@/lib/contract";
import { useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";

const POLICIES_LIMIT = 12;
const V3_PLACEHOLDER = "0x0000000000000000000000000000000000000000";

type ListedMarket = {
  key: string;
  marketId: number;
  version: "v1" | "v3";
  href: string;
  question: string;
  settled: boolean;
  outcome: number;
  confidence: number;
  yesPool: bigint;
  noPool: bigint;
  icon: string;
};

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

function inferPolicyIcon(question: string) {
  if (/\b(vuelo|flight|delay|retras|cancelad|cancelled)\b/i.test(question)) return "✈️";
  return "🏠";
}

function decodeOracleRef(oracleRef: `0x${string}`) {
  try {
    return hexToString(oracleRef, { size: 32 }).replace(/\u0000/g, "").trim();
  } catch {
    return "";
  }
}

function formatV3Question(marketId: number, market: {
  config: {
    policyType: number;
    oracleRef: `0x${string}`;
    startTime: number;
  };
}) {
  const policyType = Number(market.config.policyType);
  if (policyType === 0) {
    const flightCode = decodeOracleRef(market.config.oracleRef);
    const startTs = Number(market.config.startTime);
    if (flightCode && startTs > 0) {
      const isoDate = new Date(startTs * 1000).toISOString().slice(0, 10);
      return `Poliza V3 vuelo ${flightCode} (${isoDate})`;
    }
    if (flightCode) return `Poliza V3 vuelo ${flightCode}`;
  }

  return `Poliza V3 #${marketId}`;
}

export default function Home() {
  const { isConnected } = useAccount();
  const v3Enabled = PREDICTION_MARKET_V3_ADDRESS !== V3_PLACEHOLDER;

  const {
    data: nextMarketIdV1,
    isLoading: isLoadingV1,
    error: errorV1,
    refetch: refetchCountV1,
  } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getNextMarketId",
    query: { gcTime: 0, staleTime: 0 },
  });

  const {
    data: nextMarketIdV3,
    isLoading: isLoadingV3,
    error: errorV3,
    refetch: refetchCountV3,
  } = useReadContract({
    address: PREDICTION_MARKET_V3_ADDRESS,
    abi: PREDICTION_MARKET_V3_ABI,
    functionName: "getNextMarketId",
    query: {
      gcTime: 0,
      staleTime: 0,
      enabled: v3Enabled,
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      void refetchCountV1();
      if (v3Enabled) void refetchCountV3();
    }, 10000);
    return () => clearInterval(interval);
  }, [refetchCountV1, refetchCountV3, v3Enabled]);

  const marketCountV1 = nextMarketIdV1 ? Number(nextMarketIdV1) : 0;
  const marketCountV3 = v3Enabled && nextMarketIdV3 ? Number(nextMarketIdV3) : 0;
  const totalMarketCount = marketCountV1 + marketCountV3;

  const marketCallsV1 = Array.from({ length: marketCountV1 }, (_, i) => ({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getMarket" as const,
    args: [BigInt(i)] as const,
  }));

  const {
    data: marketsV1,
    refetch: refetchMarketsV1,
  } = useReadContracts({
    contracts: marketCallsV1,
    query: { gcTime: 0, staleTime: 0, enabled: marketCountV1 > 0 },
  });

  const marketCallsV3 = useMemo(() => {
    if (!v3Enabled) return [];
    return Array.from({ length: marketCountV3 }, (_, i) => ({
      address: PREDICTION_MARKET_V3_ADDRESS,
      abi: PREDICTION_MARKET_V3_ABI,
      functionName: "getMarket" as const,
      args: [BigInt(i)] as const,
    }));
  }, [v3Enabled, marketCountV3]);

  const {
    data: marketsV3,
    refetch: refetchMarketsV3,
  } = useReadContracts({
    contracts: marketCallsV3,
    query: {
      gcTime: 0,
      staleTime: 0,
      enabled: v3Enabled && marketCountV3 > 0,
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (marketCountV1 > 0) void refetchMarketsV1();
      if (v3Enabled && marketCountV3 > 0) void refetchMarketsV3();
    }, 10000);
    return () => clearInterval(interval);
  }, [refetchMarketsV1, refetchMarketsV3, marketCountV1, marketCountV3, v3Enabled]);

  const listedMarkets = useMemo(() => {
    const rows: ListedMarket[] = [];

    for (let i = 0; i < marketCountV1; i++) {
      const result = marketsV1?.[i];
      if (!result || result.status !== "success" || !result.result) continue;
      const market = result.result;
      const question = market.question || `Poliza #${i}`;

      rows.push({
        key: `v1-${i}`,
        marketId: i,
        version: "v1",
        href: `/market/${i}`,
        question,
        settled: market.settled,
        outcome: market.outcome,
        confidence: market.confidence,
        yesPool: market.totalYesPool,
        noPool: market.totalNoPool,
        icon: inferPolicyIcon(question),
      });
    }

    for (let i = 0; i < marketCountV3; i++) {
      const result = marketsV3?.[i];
      if (!result || result.status !== "success" || !result.result) continue;
      const market = result.result;
      const question = formatV3Question(i, {
        config: {
          policyType: Number(market.config.policyType),
          oracleRef: market.config.oracleRef,
          startTime: Number(market.config.startTime),
        },
      });
      const settledYes = Number(market.appliedTier) > 0;

      rows.push({
        key: `v3-${i}`,
        marketId: i,
        version: "v3",
        href: `/market/${i}?v=3`,
        question,
        settled: market.settled,
        outcome: settledYes ? 0 : 1,
        confidence: Number(market.confidence),
        yesPool: market.totalInsuredPool,
        noPool: market.totalProviderPool,
        icon: Number(market.config.policyType) === 0 ? "✈️" : "🏠",
      });
    }

    return rows
      .sort((a, b) => {
        if (a.marketId !== b.marketId) return b.marketId - a.marketId;
        if (a.version === b.version) return 0;
        return a.version === "v3" ? -1 : 1;
      })
      .slice(0, POLICIES_LIMIT);
  }, [marketsV1, marketsV3, marketCountV1, marketCountV3]);

  const metrics = useMemo(() => {
    let active = 0;
    let settled = 0;
    let totalPool = 0n;

    for (const entry of marketsV1 || []) {
      if (entry.status !== "success" || !entry.result) continue;
      if (entry.result.settled) settled += 1;
      else active += 1;
      totalPool += entry.result.totalYesPool + entry.result.totalNoPool;
    }

    for (const entry of marketsV3 || []) {
      if (entry.status !== "success" || !entry.result) continue;
      if (entry.result.settled) settled += 1;
      else active += 1;
      totalPool += entry.result.totalInsuredPool + entry.result.totalProviderPool;
    }

    return {
      activeCount: active,
      settledCount: settled,
      totalPoolEth: formatEther(totalPool),
    };
  }, [marketsV1, marketsV3]);

  const isLoadingHome = isLoadingV1 || (v3Enabled && isLoadingV3);

  return (
    <div className="container mx-auto px-4 py-8">
      <section className="relative py-16 md:py-24 text-center overflow-hidden">
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

      <section className="mb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Polizas totales" value={totalMarketCount} />
          <StatCard label="Activas" value={metrics.activeCount} color="yellow" />
          <StatCard label="Resueltas" value={metrics.settledCount} color="green" />
          <StatCard label="Pool total" value={`${metrics.totalPoolEth} ETH`} color="purple" />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Polizas</h2>
          {totalMarketCount > POLICIES_LIMIT && (
            <span className="text-xs text-gray-500">
              Mostrando {POLICIES_LIMIT} de {totalMarketCount}
            </span>
          )}
        </div>

        {(errorV1 || errorV3) && (
          <Card className="mb-6 border-red-700/50">
            <p className="text-red-400 text-sm">
              Error cargando polizas: {errorV1?.message || errorV3?.message}
            </p>
          </Card>
        )}

        {isLoadingHome ? (
          <Card className="text-center py-12">
            <div className="animate-shimmer h-4 bg-gray-700 rounded w-1/3 mx-auto mb-4" />
            <p className="text-gray-400">Cargando polizas...</p>
          </Card>
        ) : totalMarketCount === 0 ? (
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
            {listedMarkets.map((market) => (
              <Link key={market.key} href={market.href}>
                <Card hover className="h-full group">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="info">#{market.marketId}</Badge>
                      <Badge variant="pending">{market.version.toUpperCase()}</Badge>
                      <span className="text-lg">{market.icon}</span>
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

                  <PoolBar yesPool={market.yesPool} noPool={market.noPool} />

                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">SI</span>
                      <span className="text-green-400 font-mono">
                        {formatEther(market.yesPool)} ETH
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">NO</span>
                      <span className="text-red-400 font-mono">
                        {formatEther(market.noPool)} ETH
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
                          {market.confidence >= 10000 ? "Verificado" : `${market.confidence / 100}%`}
                        </span>
                      </div>
                    </div>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
