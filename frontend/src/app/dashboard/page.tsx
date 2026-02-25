"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";
import Link from "next/link";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
  PREDICTION_MARKET_V3_ADDRESS,
  PREDICTION_MARKET_V3_ABI,
} from "@/lib/contract";
import { useUserPositions } from "@/hooks/useUserPositions";
import type { Position } from "@/hooks/useUserPositions";
import { useReliableWrite } from "@/hooks/useReliableWrite";
import type { FilterOption } from "@/components/dashboard/FilterTabs";
import { FilterTabs } from "@/components/dashboard/FilterTabs";
import { SummaryStats } from "@/components/dashboard/SummaryStats";
import { PositionCard } from "@/components/dashboard/PositionCard";

export default function DashboardPage() {
  const { positions, summary, isLoading, isConnected, refetch } = useUserPositions();
  const { address } = useAccount();
  const [filter, setFilter] = useState<FilterOption>("all");
  const [versionFilter, setVersionFilter] = useState<"all" | "v1" | "v3">("all");

  const { writeContract, isPending: isClaiming, isConfirming, isSuccess } = useReliableWrite();
  const [claimingPositionKey, setClaimingPositionKey] = useState<string | null>(null);

  const handleClaim = (position: Position) => {
    setClaimingPositionKey(position.key);
    writeContract({
      address: position.version === "v3" ? PREDICTION_MARKET_V3_ADDRESS : PREDICTION_MARKET_ADDRESS,
      abi: position.version === "v3" ? PREDICTION_MARKET_V3_ABI : PREDICTION_MARKET_ABI,
      functionName: "claim",
      args: [BigInt(position.marketId)],
    });
  };

  if (isSuccess && claimingPositionKey !== null) {
    refetch();
    setClaimingPositionKey(null);
  }

  const statusFiltered = filter === "all" ? positions : positions.filter((p) => p.status === filter);
  const filtered = versionFilter === "all"
    ? statusFiltered
    : statusFiltered.filter((p) => p.version === versionFilter);

  const counts: Record<FilterOption, number> = {
    all: positions.length,
    created: positions.filter((p) => p.status === "created").length,
    active: positions.filter((p) => p.status === "active").length,
    claimable: positions.filter((p) => p.status === "claimable").length,
    claimed: positions.filter((p) => p.status === "claimed").length,
    lost: positions.filter((p) => p.status === "lost").length,
  };

  if (!isConnected) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="text-center">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-3xl font-bold text-white mb-4">Mi Dashboard</h1>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            Conecta tu wallet para ver tus posiciones, reclamar payouts y monitorear tu portafolio.
          </p>
          <ConnectKitButton />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">Mi Dashboard</h1>
        <p className="text-gray-500 font-mono text-sm">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-800/50 rounded-xl" />
            ))}
          </div>
          <div className="h-12 bg-gray-800/50 rounded-xl w-1/2" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-48 bg-gray-800/50 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <SummaryStats summary={summary} />
          </div>

          <div className="mb-6">
            <FilterTabs active={filter} onChange={setFilter} counts={counts} />
          </div>

          <div className="mb-6 inline-flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-900/40 p-1">
            <button
              type="button"
              onClick={() => setVersionFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                versionFilter === "all"
                  ? "bg-purple-600/30 text-purple-200 border border-purple-500/40"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setVersionFilter("v1")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                versionFilter === "v1"
                  ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/40"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              V1
            </button>
            <button
              type="button"
              onClick={() => setVersionFilter("v3")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                versionFilter === "v3"
                  ? "bg-sky-600/30 text-sky-200 border border-sky-500/40"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              V3
            </button>
          </div>

          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((position) => (
                <PositionCard
                  key={position.key}
                  position={position}
                  onClaim={handleClaim}
                  claiming={(isClaiming || isConfirming) && claimingPositionKey === position.key}
                />
              ))}
            </div>
          ) : positions.length > 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-4">🔍</div>
              <p className="text-gray-400">
                No tienes posiciones con estado &quot;{filter}&quot;.
              </p>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="text-6xl mb-6">📊</div>
              <h2 className="text-xl font-semibold text-white mb-3">
                Sin posiciones aun
              </h2>
              <p className="text-gray-400 mb-8 max-w-md mx-auto">
                Explora las polizas disponibles y aporta al pool para comenzar a participar.
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-medium transition"
              >
                Explorar polizas
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
