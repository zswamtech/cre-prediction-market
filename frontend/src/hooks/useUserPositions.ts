"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { useMemo } from "react";
import { hexToString } from "viem";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
  PREDICTION_MARKET_V3_ADDRESS,
  PREDICTION_MARKET_V3_ABI,
} from "@/lib/contract";

const V3_PLACEHOLDER = "0x0000000000000000000000000000000000000000";
const BPS_DENOMINATOR = 10_000n;

export type PositionStatus = "active" | "claimable" | "claimed" | "lost";
export type MarketVersion = "v1" | "v3";

export type Position = {
  key: string;
  version: MarketVersion;
  marketId: number;
  createdAt: number;
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
  appliedTier: number | null;
  appliedPayoutBps: number | null;
};

export type PositionSummary = {
  totalInvested: bigint;
  totalClaimed: bigint;
  totalClaimable: bigint;
  netPnL: bigint;
  positionCount: number;
};

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

function computeV3Payout(
  market: {
    settled: boolean;
    appliedTier: number;
    appliedPayoutBps: number;
    totalInsuredPool: bigint;
    totalProviderPool: bigint;
    config: { maxPayoutWei: bigint };
  },
  stake: { amount: bigint; isInsured: boolean }
): bigint {
  if (!market.settled || stake.amount === 0n) return 0n;

  const totalInsured = market.totalInsuredPool;
  const totalProvider = market.totalProviderPool;
  const appliedBps = BigInt(market.appliedPayoutBps);
  const maxPayoutWei = market.config.maxPayoutWei;
  const isBreach = Number(market.appliedTier) > 0;

  if (isBreach) {
    if (stake.isInsured) {
      if (totalInsured === 0n || totalProvider === 0n) return 0n;
      const coverageShare = (totalProvider * stake.amount) / totalInsured;
      const rawPayout = (coverageShare * appliedBps) / BPS_DENOMINATOR;
      return rawPayout > maxPayoutWei ? maxPayoutWei : rawPayout;
    }

    if (totalProvider === 0n) return 0n;
    const remainingCoverage =
      (stake.amount * (BPS_DENOMINATOR - appliedBps)) / BPS_DENOMINATOR;
    const earnedPremium = (totalInsured * stake.amount) / totalProvider;
    return remainingCoverage + earnedPremium;
  }

  // No breach: insured gets 0, provider gets stake + pro-rata insured premiums.
  if (stake.isInsured) return 0n;
  if (totalProvider === 0n) return 0n;
  return stake.amount + (totalInsured * stake.amount) / totalProvider;
}

export function useUserPositions() {
  const { address, isConnected } = useAccount();
  const v3Enabled = PREDICTION_MARKET_V3_ADDRESS !== V3_PLACEHOLDER;

  const {
    data: nextMarketIdV1,
    isLoading: isLoadingCountV1,
    refetch: refetchCountV1,
  } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getNextMarketId",
    query: { gcTime: 0, staleTime: 0 },
  });

  const {
    data: nextMarketIdV3,
    isLoading: isLoadingCountV3,
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

  const marketCountV1 = nextMarketIdV1 ? Number(nextMarketIdV1) : 0;
  const marketCountV3 = v3Enabled && nextMarketIdV3 ? Number(nextMarketIdV3) : 0;

  const marketCallsV1 = useMemo(
    () =>
      Array.from({ length: marketCountV1 }, (_, i) => ({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: "getMarket" as const,
        args: [BigInt(i)] as const,
      })),
    [marketCountV1]
  );

  const {
    data: marketsV1,
    isLoading: isLoadingMarketsV1,
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
    isLoading: isLoadingMarketsV3,
    refetch: refetchMarketsV3,
  } = useReadContracts({
    contracts: marketCallsV3,
    query: {
      gcTime: 0,
      staleTime: 0,
      enabled: v3Enabled && marketCountV3 > 0,
    },
  });

  const predictionCallsV1 = useMemo(() => {
    if (!address || marketCountV1 === 0) return [];
    return Array.from({ length: marketCountV1 }, (_, i) => ({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "getPrediction" as const,
      args: [BigInt(i), address] as const,
    }));
  }, [address, marketCountV1]);

  const {
    data: predictionsV1,
    isLoading: isLoadingPredictionsV1,
    refetch: refetchPredictionsV1,
  } = useReadContracts({
    contracts: predictionCallsV1,
    query: {
      gcTime: 0,
      staleTime: 0,
      enabled: predictionCallsV1.length > 0 && isConnected,
    },
  });

  const stakeCallsV3 = useMemo(() => {
    if (!v3Enabled || !address || marketCountV3 === 0) return [];
    return Array.from({ length: marketCountV3 }, (_, i) => ({
      address: PREDICTION_MARKET_V3_ADDRESS,
      abi: PREDICTION_MARKET_V3_ABI,
      functionName: "getStake" as const,
      args: [BigInt(i), address] as const,
    }));
  }, [v3Enabled, address, marketCountV3]);

  const {
    data: stakesV3,
    isLoading: isLoadingStakesV3,
    refetch: refetchStakesV3,
  } = useReadContracts({
    contracts: stakeCallsV3,
    query: {
      gcTime: 0,
      staleTime: 0,
      enabled: stakeCallsV3.length > 0 && isConnected,
    },
  });

  const previewCallsV3 = useMemo(() => {
    if (!v3Enabled || !address || marketCountV3 === 0) return [];
    return Array.from({ length: marketCountV3 }, (_, i) => ({
      address: PREDICTION_MARKET_V3_ADDRESS,
      abi: PREDICTION_MARKET_V3_ABI,
      functionName: "previewClaim" as const,
      args: [BigInt(i), address] as const,
    }));
  }, [v3Enabled, address, marketCountV3]);

  const {
    data: previewsV3,
    isLoading: isLoadingPreviewsV3,
    refetch: refetchPreviewsV3,
  } = useReadContracts({
    contracts: previewCallsV3,
    query: {
      gcTime: 0,
      staleTime: 0,
      enabled: previewCallsV3.length > 0 && isConnected,
    },
  });

  const { positions, summary } = useMemo(() => {
    const positionsList: Position[] = [];

    if (!isConnected) {
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

    for (let i = 0; i < marketCountV1; i++) {
      const marketResult = marketsV1?.[i];
      const predResult = predictionsV1?.[i];

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
      const winningPool = market.outcome === 0 ? market.totalYesPool : market.totalNoPool;
      const isWinner = market.settled && pred.prediction === market.outcome;
      const payout = isWinner && winningPool > 0n ? (pred.amount * totalPool) / winningPool : 0n;

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
        key: `v1-${i}`,
        version: "v1",
        marketId: i,
        createdAt: Number(market.createdAt),
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
        appliedTier: null,
        appliedPayoutBps: null,
      });
    }

    for (let i = 0; i < marketCountV3; i++) {
      const marketResult = marketsV3?.[i];
      const stakeResult = stakesV3?.[i];

      if (
        !marketResult ||
        marketResult.status !== "success" ||
        !marketResult.result ||
        !stakeResult ||
        stakeResult.status !== "success" ||
        !stakeResult.result
      ) {
        continue;
      }

      const market = marketResult.result;
      const stake = stakeResult.result;

      if (stake.amount === 0n) continue;

      const previewResult = previewsV3?.[i];
      const previewPayout =
        previewResult?.status === "success" && previewResult.result
          ? previewResult.result
          : null;
      const computedPayout = computeV3Payout(
        {
          settled: market.settled,
          appliedTier: Number(market.appliedTier),
          appliedPayoutBps: Number(market.appliedPayoutBps),
          totalInsuredPool: market.totalInsuredPool,
          totalProviderPool: market.totalProviderPool,
          config: { maxPayoutWei: market.config.maxPayoutWei },
        },
        { amount: stake.amount, isInsured: stake.isInsured }
      );
      const payout =
        stake.claimed
          ? computedPayout
          : (previewPayout ?? computedPayout);

      const isWinner = market.settled && payout > 0n;
      const outcome = market.settled && Number(market.appliedTier) > 0 ? 0 : 1;

      let status: PositionStatus;
      if (!market.settled) {
        status = "active";
      } else if (stake.claimed) {
        status = "claimed";
      } else if (isWinner) {
        status = "claimable";
      } else {
        status = "lost";
      }

      totalInvested += stake.amount;
      if (status === "claimed") totalClaimed += payout;
      if (status === "claimable") totalClaimable += payout;

      positionsList.push({
        key: `v3-${i}`,
        version: "v3",
        marketId: i,
        createdAt: Number(market.createdAt),
        question: formatV3Question(i, {
          config: {
            policyType: Number(market.config.policyType),
            oracleRef: market.config.oracleRef,
            startTime: Number(market.config.startTime),
          },
        }),
        side: stake.isInsured ? 0 : 1,
        amount: stake.amount,
        settled: market.settled,
        outcome,
        confidence: Number(market.confidence),
        isWinner,
        payout,
        claimed: stake.claimed,
        status,
        totalYesPool: market.totalInsuredPool,
        totalNoPool: market.totalProviderPool,
        appliedTier: Number(market.appliedTier),
        appliedPayoutBps: Number(market.appliedPayoutBps),
      });
    }

    const statusOrder: Record<PositionStatus, number> = {
      claimable: 0,
      active: 1,
      claimed: 2,
      lost: 3,
    };

    positionsList.sort((a, b) => {
      const byStatus = statusOrder[a.status] - statusOrder[b.status];
      if (byStatus !== 0) return byStatus;
      if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
      if (a.marketId !== b.marketId) return b.marketId - a.marketId;
      return a.version === b.version ? 0 : a.version === "v3" ? -1 : 1;
    });

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
  }, [
    isConnected,
    marketCountV1,
    marketCountV3,
    marketsV1,
    predictionsV1,
    marketsV3,
    stakesV3,
    previewsV3,
  ]);

  const refetch = () => {
    void refetchCountV1();
    void refetchMarketsV1();
    void refetchPredictionsV1();
    if (v3Enabled) {
      void refetchCountV3();
      void refetchMarketsV3();
      void refetchStakesV3();
      void refetchPreviewsV3();
    }
  };

  return {
    positions,
    summary,
    isLoading:
      isLoadingCountV1 ||
      isLoadingMarketsV1 ||
      isLoadingPredictionsV1 ||
      (v3Enabled &&
        (isLoadingCountV3 || isLoadingMarketsV3 || isLoadingStakesV3 || isLoadingPreviewsV3)),
    isConnected,
    refetch,
  };
}
