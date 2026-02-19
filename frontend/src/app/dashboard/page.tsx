"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";
import Link from "next/link";
import { PREDICTION_MARKET_ADDRESS, PREDICTION_MARKET_ABI } from "@/lib/contract";
import { useUserPositions } from "@/hooks/useUserPositions";
import { useReliableWrite } from "@/hooks/useReliableWrite";
import type { FilterOption } from "@/components/dashboard/FilterTabs";
import { FilterTabs } from "@/components/dashboard/FilterTabs";
import { SummaryStats } from "@/components/dashboard/SummaryStats";
import { PositionCard } from "@/components/dashboard/PositionCard";

export default function DashboardPage() {
  const { positions, summary, isLoading, isConnected, refetch } = useUserPositions();
  const { address } = useAccount();
  const [filter, setFilter] = useState<FilterOption>("all");

  const { writeContract, isPending: isClaiming, isConfirming, isSuccess } = useReliableWrite();
  const [claimingMarketId, setClaimingMarketId] = useState<number | null>(null);

  const handleClaim = (marketId: number) => {
    setClaimingMarketId(marketId);
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "claim",
      args: [BigInt(marketId)],
    });
  };

  // Refetch after successful claim
  if (isSuccess && claimingMarketId !== null) {
    refetch();
    setClaimingMarketId(null);
  }

  const filtered = filter === "all" ? positions : positions.filter((p) => p.status === filter);

  const counts: Record<FilterOption, number> = {
    all: positions.length,
    active: positions.filter((p) => p.status === "active").length,
    claimable: positions.filter((p) => p.status === "claimable").length,
    claimed: positions.filter((p) => p.status === "claimed").length,
    lost: positions.filter((p) => p.status === "lost").length,
  };

  // Not connected state
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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">Mi Dashboard</h1>
        <p className="text-gray-500 font-mono text-sm">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </p>
      </div>

      {/* Loading */}
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
          {/* Summary Stats */}
          <div className="mb-8">
            <SummaryStats summary={summary} />
          </div>

          {/* Filter Tabs */}
          <div className="mb-6">
            <FilterTabs active={filter} onChange={setFilter} counts={counts} />
          </div>

          {/* Positions Grid */}
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((position) => (
                <PositionCard
                  key={position.marketId}
                  position={position}
                  onClaim={handleClaim}
                  claiming={
                    (isClaiming || isConfirming) &&
                    claimingMarketId === position.marketId
                  }
                />
              ))}
            </div>
          ) : positions.length > 0 ? (
            /* Has positions but none match filter */
            <div className="text-center py-16">
              <div className="text-4xl mb-4">🔍</div>
              <p className="text-gray-400">
                No tienes posiciones con estado &quot;{filter}&quot;.
              </p>
            </div>
          ) : (
            /* No positions at all */
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
