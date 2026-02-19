"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { useMemo } from "react";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
} from "@/lib/contract";

export type PositionStatus = "active" | "claimable" | "claimed" | "lost";

export type Position = {
  marketId: number;
  question: string;
  side: 0 | 1;
  amount: bigint;
  settled: boolean;
  outcome: number;
  confidence: number;
  isWinner: boolean;
  payout: bigint;
  claimed: boolean;
  status: PositionStatus;
  totalYesPool: bigint;
  totalNoPool: bigint;
};

export type PositionSummary = {
  totalInvested: bigint;
  totalClaimed: bigint;
  totalClaimable: bigint;
  netPnL: bigint;
  positionCount: number;
};

export function useUserPositions() {
  const { address, isConnected } = useAccount();

  const { data: nextMarketId, isLoading: isLoadingCount } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getNextMarketId",
    query: { gcTime: 0, staleTime: 0 },
  });

  const marketCount = nextMarketId ? Number(nextMarketId) : 0;

  const marketCalls = useMemo(
    () =>
      Array.from({ length: marketCount }, (_, i) => ({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: "getMarket" as const,
        args: [BigInt(i)] as const,
      })),
    [marketCount]
  );

  const { data: markets, isLoading: isLoadingMarkets } = useReadContracts({
    contracts: marketCalls,
    query: { gcTime: 0, staleTime: 0, enabled: marketCount > 0 },
  });

  const predictionCalls = useMemo(() => {
    if (!address || marketCount === 0) return [];
    return Array.from({ length: marketCount }, (_, i) => ({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "getPrediction" as const,
      args: [BigInt(i), address] as const,
    }));
  }, [address, marketCount]);

  const { data: predictions, isLoading: isLoadingPredictions, refetch } = useReadContracts({
    contracts: predictionCalls,
    query: {
      gcTime: 0,
      staleTime: 0,
      enabled: predictionCalls.length > 0 && isConnected,
    },
  });

  const { positions, summary } = useMemo(() => {
    const positionsList: Position[] = [];

    if (!markets || !predictions || !isConnected) {
      return {
        positions: positionsList,
        summary: {
          totalInvested: 0n,
          totalClaimed: 0n,
          totalClaimable: 0n,
          netPnL: 0n,
          positionCount: 0,
        } as PositionSummary,
      };
    }

    let totalInvested = 0n;
    let totalClaimed = 0n;
    let totalClaimable = 0n;

    for (let i = 0; i < marketCount; i++) {
      const marketResult = markets[i];
      const predResult = predictions[i];

      if (
        !marketResult ||
        marketResult.status !== "success" ||
        !marketResult.result ||
        !predResult ||
        predResult.status !== "success" ||
        !predResult.result
      ) {
        continue;
      }

      const market = marketResult.result;
      const pred = predResult.result;

      if (pred.amount === 0n) continue;

      const totalPool = market.totalYesPool + market.totalNoPool;
      const winningPool =
        market.outcome === 0 ? market.totalYesPool : market.totalNoPool;
      const isWinner =
        market.settled && pred.prediction === market.outcome;
      const payout =
        isWinner && winningPool > 0n
          ? (pred.amount * totalPool) / winningPool
          : 0n;

      let status: PositionStatus;
      if (!market.settled) {
        status = "active";
      } else if (pred.claimed) {
        status = "claimed";
      } else if (isWinner) {
        status = "claimable";
      } else {
        status = "lost";
      }

      totalInvested += pred.amount;
      if (status === "claimed") totalClaimed += payout;
      if (status === "claimable") totalClaimable += payout;

      positionsList.push({
        marketId: i,
        question: market.question,
        side: pred.prediction as 0 | 1,
        amount: pred.amount,
        settled: market.settled,
        outcome: market.outcome,
        confidence: market.confidence,
        isWinner,
        payout,
        claimed: pred.claimed,
        status,
        totalYesPool: market.totalYesPool,
        totalNoPool: market.totalNoPool,
      });
    }

    // Sort: claimable first, then active, then claimed, then lost
    const statusOrder: Record<PositionStatus, number> = {
      claimable: 0,
      active: 1,
      claimed: 2,
      lost: 3,
    };
    positionsList.sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] ||
        b.marketId - a.marketId
    );

    const netPnL = totalClaimed + totalClaimable - totalInvested;

    return {
      positions: positionsList,
      summary: {
        totalInvested,
        totalClaimed,
        totalClaimable,
        netPnL,
        positionCount: positionsList.length,
      } as PositionSummary,
    };
  }, [markets, predictions, marketCount, isConnected]);

  return {
    positions,
    summary,
    isLoading: isLoadingCount || isLoadingMarkets || isLoadingPredictions,
    isConnected,
    refetch,
  };
}
