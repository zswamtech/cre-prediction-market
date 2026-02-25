"use client";

import { useAccount, useReadContract } from "wagmi";
import { encodeAbiParameters, concat, formatEther, hexToString } from "viem";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
  PREDICTION_MARKET_V3_ADDRESS,
  PREDICTION_MARKET_V3_ABI,
} from "@/lib/contract";
import { useReliableWrite } from "@/hooks/useReliableWrite";
import { Badge } from "@/components/ui/Badge";
import { DecisionPanel, type FlightOracleData } from "@/components/market/DecisionPanel";
import { PredictForm } from "@/components/market/PredictForm";
import { loadPolicyDraft } from "@/types/policyPurchase";

const SEP_CHAINLINK_FORWARDER = "0x15fc6ae953e024d975e77382eeec56a9101f9f88";
const DEFAULT_ORACLE_BASE_URL =
  process.env.NEXT_PUBLIC_ORACLE_BASE_URL || "http://127.0.0.1:3001";
const FLIGHT_ORACLE_BASE_URL =
  process.env.NEXT_PUBLIC_FLIGHT_ORACLE_BASE_URL || DEFAULT_ORACLE_BASE_URL;
const FALLBACK_FLIGHT_ORACLE_BASE_URL = "http://127.0.0.1:3101";
const FLIGHT_KEYWORDS_RE = /\b(vuelo|flight|delay|retras[oa]s?|cancelad[oa]|cancelled)\b/i;
const FLIGHT_ID_RE = /\b([A-Z]{2,3}\d{2,5})\b/i;
const FLIGHT_DATE_RE = /\b(\d{2})-(\d{2})-(\d{4})\b/;
const V3_PLACEHOLDER = "0x0000000000000000000000000000000000000000";
const DEFAULT_ETH_PRICE_USD = Number(process.env.NEXT_PUBLIC_ETH_PRICE_USD || "3000");
const POLICY_WIZARD_STEPS = [
  "Fondeo incompleto",
  "Listo para liquidar",
  "Listo para claim",
] as const;
const BPS_DENOMINATOR = 10_000n;

function formatEthAmount(value: bigint): string {
  return `${formatEther(value)} ETH`;
}

function formatUsdApprox(value: bigint): string {
  const asEth = Number(formatEther(value));
  if (!Number.isFinite(asEth)) return "~USD —";
  return `~USD ${(asEth * DEFAULT_ETH_PRICE_USD).toFixed(2)}`;
}

type OracleMetrics = {
  address?: string;
  metrics?: {
    noiseLevelDb?: number;
    safetyIndex?: number;
    nearbyConstruction?: boolean;
    publicTransportStatus?: string;
  };
};

type WeatherMetrics = {
  time?: string;
  temperatureC?: number;
  precipitationMm?: number;
  windSpeedKmh?: number;
  sourceUrl: string;
};

type LocalSettleResponse = {
  success: boolean;
  marketId?: string;
  travelerAddress?: string | null;
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
};

type LocalClaimResponse = {
  success: boolean;
  marketId?: string;
  who?: string;
  previewOnly?: boolean;
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
};

function MarketDetailInner() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const { isConnected, address: userAddress } = useAccount();
  const isTest = process.env.NEXT_PUBLIC_TEST_MODE === "1";
  const oracleBaseUrl = DEFAULT_ORACLE_BASE_URL;
  const weatherLatitude = parseFloat(process.env.NEXT_PUBLIC_WEATHER_LAT || "6.2442");
  const weatherLongitude = parseFloat(process.env.NEXT_PUBLIC_WEATHER_LON || "-75.5812");
  const weatherTimezone = process.env.NEXT_PUBLIC_WEATHER_TIMEZONE || "America/Bogota";

  // V3 mode: enabled via ?v=3 URL param
  const isV3 = searchParams.get("v") === "3" && PREDICTION_MARKET_V3_ADDRESS !== V3_PLACEHOLDER;

  const [testHash, setTestHash] = useState<string | null>(null);
  const [oracleData, setOracleData] = useState<OracleMetrics | null>(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherMetrics | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [flightData, setFlightData] = useState<FlightOracleData | null>(null);
  const [flightLoading, setFlightLoading] = useState(false);
  const [flightError, setFlightError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [suggestedCoverageEth, setSuggestedCoverageEth] = useState<string | null>(null);
  const [suggestedPremiumPct, setSuggestedPremiumPct] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<"settle" | "claim" | null>(null);
  const [isLocalhostClient, setIsLocalhostClient] = useState(false);
  const [isRunningLocalSettle, setIsRunningLocalSettle] = useState(false);
  const [localSettleOutput, setLocalSettleOutput] = useState<string | null>(null);
  const [localSettleError, setLocalSettleError] = useState<string | null>(null);
  const [localSettleLastExitCode, setLocalSettleLastExitCode] = useState<number | null>(null);
  const [isRunningLocalClaim, setIsRunningLocalClaim] = useState(false);
  const [localClaimOutput, setLocalClaimOutput] = useState<string | null>(null);
  const [localClaimError, setLocalClaimError] = useState<string | null>(null);
  const [localClaimLastExitCode, setLocalClaimLastExitCode] = useState<number | null>(null);

  const marketId = id ? BigInt(Array.isArray(id) ? id[0] : id) : undefined;

  // V1 read
  const { data: marketResult, isLoading, refetch } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getMarket",
    args: marketId !== undefined ? [marketId] : undefined,
    query: {
      enabled: !isV3 && marketId !== undefined,
      gcTime: 0,
      staleTime: 0,
    },
  });

  // V3 read (only when isV3 and contract is deployed)
  const { data: v3MarketResult, isLoading: v3IsLoading, refetch: v3Refetch } = useReadContract({
    address: PREDICTION_MARKET_V3_ADDRESS,
    abi: PREDICTION_MARKET_V3_ABI,
    functionName: "getMarket",
    args: marketId !== undefined ? [marketId] : undefined,
    query: {
      enabled: isV3 && marketId !== undefined,
      gcTime: 0,
      staleTime: 0,
    },
  });

  // V3 user stake read
  const { data: v3UserStake } = useReadContract({
    address: PREDICTION_MARKET_V3_ADDRESS,
    abi: PREDICTION_MARKET_V3_ABI,
    functionName: "getStake",
    args: marketId !== undefined && userAddress ? [marketId, userAddress] : undefined,
    query: {
      enabled: isV3 && !!userAddress && marketId !== undefined,
    },
  });

  const effectiveMarket = isV3 ? v3MarketResult : marketResult;
  const effectiveIsLoading = isV3 ? v3IsLoading : isLoading;
  const effectiveRefetch = isV3 ? v3Refetch : refetch;

  // Map V3 market to V1-compatible display shape for DecisionPanel
  const displayMarket = isV3 && v3MarketResult
    ? {
        settled: v3MarketResult.settled,
        // breach (tier>0) = YES = outcome 0; no breach (tier=0) = NO = outcome 1
        outcome: v3MarketResult.appliedTier > 0 ? 0 : 1,
        confidence: v3MarketResult.confidence,
        totalYesPool: v3MarketResult.totalInsuredPool,
        totalNoPool: v3MarketResult.totalProviderPool,
      }
    : marketResult;
  const revealFlightOracle = Boolean(displayMarket?.settled);

  const configuredThresholdMinutes = isV3 && v3MarketResult
    ? Math.max(1, Math.floor(Number(v3MarketResult.config.thresholdPrimary) / 60))
    : null;
  const configuredTier2ThresholdMinutes = isV3 && v3MarketResult
    ? Math.max(1, Math.floor(Number(v3MarketResult.config.thresholdSecondary) / 60))
    : null;

  const oracleZoneId =
    (marketResult as any)?.question?.match(/(?:propiedad|property)\s*id\s*(\d+)/i)?.[1] ??
    (marketId !== undefined ? marketId.toString() : undefined);

  const { writeContract, hash, isPending: isWritePending, isConfirming, isSuccess, error: writeError } = useReliableWrite();

  // Auto-refresh (silent)
  useEffect(() => {
    const interval = setInterval(() => effectiveRefetch(), 5000);
    return () => clearInterval(interval);
  }, [effectiveRefetch]);

  // Detect localhost to enable local-only settle execution from UI.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname.toLowerCase();
    setIsLocalhostClient(
      host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost")
    );
  }, []);

  // Oracle fetch
  useEffect(() => {
    if (!oracleZoneId) return;
    let cancelled = false;
    const baseUrl = oracleBaseUrl.replace(/\/+$/, "");

    const fetchOracle = async () => {
      setOracleLoading(true);
      setOracleError(null);
      try {
        const response = await fetch(`${baseUrl}/api/market/${oracleZoneId}`);
        if (!response.ok) throw new Error(`Oracle responded with ${response.status}`);
        const json = await response.json();
        if (!json?.success) throw new Error(json?.error || "Oracle response invalid");
        if (!cancelled) setOracleData(json.data ?? null);
      } catch (error) {
        if (!cancelled) {
          setOracleData(null);
          setOracleError(error instanceof Error ? error.message : "Oracle error");
        }
      } finally {
        if (!cancelled) setOracleLoading(false);
      }
    };

    fetchOracle();
    const interval = setInterval(fetchOracle, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [oracleZoneId, oracleBaseUrl]);

  // Detect flight policy from question (V1) or policy config (V3)
  const questionText = (effectiveMarket as any)?.question ?? "";
  const extractedFlightIdFromV3 = (() => {
    if (!isV3 || !v3MarketResult) return null;
    try {
      return hexToString(v3MarketResult.config.oracleRef, { size: 32 })
        .replace(/\u0000/g, "")
        .trim()
        .toUpperCase();
    } catch {
      return null;
    }
  })();
  const extractedFlightDateFromV3 = (() => {
    if (!isV3 || !v3MarketResult) return null;
    const startTs = Number(v3MarketResult.config.startTime);
    if (!Number.isFinite(startTs) || startTs <= 0) return null;
    return new Date(startTs * 1000).toISOString().slice(0, 10);
  })();
  const isFlightPolicy = isV3
    ? Number(v3MarketResult?.config.policyType ?? 1) === 0
    : FLIGHT_KEYWORDS_RE.test(questionText);
  const extractedFlightId = isV3
    ? extractedFlightIdFromV3
    : questionText.match(FLIGHT_ID_RE)?.[1]?.toUpperCase() ?? null;
  const extractedFlightDate = isV3
    ? extractedFlightDateFromV3
    : (() => {
        const match = questionText.match(FLIGHT_DATE_RE);
        if (!match?.[1] || !match?.[2] || !match?.[3]) return null;
        const [, dd, mm, yyyy] = match;
        return `${yyyy}-${mm}-${dd}`;
      })();

  // Hydrate insurance hints from local draft when it matches the same flight/date.
  useEffect(() => {
    if (!isFlightPolicy || !extractedFlightId) {
      setSuggestedCoverageEth(null);
      setSuggestedPremiumPct(null);
      return;
    }

    const draft = loadPolicyDraft();
    if (!draft || draft.policyType !== "flight") {
      setSuggestedCoverageEth(null);
      setSuggestedPremiumPct(null);
      return;
    }

    const draftFlight = String(draft.flightCode || "").toUpperCase();
    const marketFlight = String(extractedFlightId || "").toUpperCase();
    const draftDate = draft.travelDate || "";
    const marketDate = extractedFlightDate || "";

    const sameFlight = draftFlight && marketFlight && draftFlight === marketFlight;
    const sameDate = !marketDate || !draftDate || draftDate === marketDate;

    if (sameFlight && sameDate) {
      if (draft.coverageCapEth !== undefined && Number.isFinite(draft.coverageCapEth)) {
        setSuggestedCoverageEth(String(draft.coverageCapEth));
      } else {
        setSuggestedCoverageEth(null);
      }
      if (draft.premiumRatePct !== undefined && Number.isFinite(draft.premiumRatePct)) {
        setSuggestedPremiumPct(String(draft.premiumRatePct));
      } else {
        setSuggestedPremiumPct(null);
      }
      return;
    }

    setSuggestedCoverageEth(null);
    setSuggestedPremiumPct(null);
  }, [isFlightPolicy, extractedFlightDate, extractedFlightId]);

  // Flight oracle fetch (only for flight policies)
  useEffect(() => {
    if (!isFlightPolicy || !extractedFlightId || !revealFlightOracle) {
      setFlightData(null);
      setFlightError(null);
      setFlightLoading(false);
      return;
    }
    let cancelled = false;
    const baseUrl = FLIGHT_ORACLE_BASE_URL.replace(/\/+$/, "");
    const fallbackBaseUrl = FALLBACK_FLIGHT_ORACLE_BASE_URL.replace(/\/+$/, "");
    const dateQuery = extractedFlightDate
      ? `date=${encodeURIComponent(extractedFlightDate)}`
      : "";

    const candidateBases = Array.from(
      new Set([baseUrl, fallbackBaseUrl].filter(Boolean))
    );

    const candidateUrls = candidateBases.flatMap((base) => {
      const pathEndpoint = `${base}/api/flight-delay/${encodeURIComponent(extractedFlightId)}${
        dateQuery ? `?${dateQuery}` : ""
      }`;
      const queryEndpoint = `${base}/api/flight-delay?flightId=${encodeURIComponent(
        extractedFlightId
      )}${dateQuery ? `&${dateQuery}` : ""}`;
      return [pathEndpoint, queryEndpoint];
    });

    const fetchFlight = async () => {
      setFlightLoading(true);
      setFlightError(null);
      try {
        let lastError: Error | null = null;
        for (const endpoint of candidateUrls) {
          try {
            const response = await fetch(endpoint);
            if (!response.ok) {
              lastError = new Error(`Flight oracle responded with ${response.status}`);
              continue;
            }
            const json = await response.json();
            if (!json?.success) {
              lastError = new Error(json?.error || "Flight oracle response invalid");
              continue;
            }
            if (!cancelled) setFlightData(json.data ?? null);
            return;
          } catch (error) {
            lastError =
              error instanceof Error
                ? error
                : new Error("Flight oracle request failed");
          }
        }
        throw (
          lastError ||
          new Error(
            "Flight oracle no disponible. Verifica nodos en 3001/3101."
          )
        );
      } catch (error) {
        if (!cancelled) {
          setFlightData(null);
          setFlightError(error instanceof Error ? error.message : "Flight oracle error");
        }
      } finally {
        if (!cancelled) setFlightLoading(false);
      }
    };

    fetchFlight();
    const interval = setInterval(fetchFlight, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isFlightPolicy, extractedFlightDate, extractedFlightId, revealFlightOracle]);

  // Weather fetch
  useEffect(() => {
    let cancelled = false;
    const sourceUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(String(weatherLatitude))}` +
      `&longitude=${encodeURIComponent(String(weatherLongitude))}` +
      `&current=temperature_2m,precipitation,wind_speed_10m` +
      `&timezone=${encodeURIComponent(weatherTimezone)}`;

    const fetchWeather = async () => {
      setWeatherLoading(true);
      setWeatherError(null);
      try {
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error(`Weather responded with ${response.status}`);
        const json = await response.json();
        const current = json?.current;
        if (!current) throw new Error("Weather response invalid");
        if (!cancelled) {
          setWeatherData({
            time: current.time,
            temperatureC: current.temperature_2m,
            precipitationMm: current.precipitation,
            windSpeedKmh: current.wind_speed_10m,
            sourceUrl,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setWeatherData(null);
          setWeatherError(error instanceof Error ? error.message : "Weather error");
        }
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [weatherLatitude, weatherLongitude, weatherTimezone]);

  // Reset form on success
  useEffect(() => {
    if (isSuccess) effectiveRefetch();
  }, [isSuccess, effectiveRefetch]);

  // Owner check for admin
  const { data: ownerAddress } = useReadContract({
    address: isV3 ? PREDICTION_MARKET_V3_ADDRESS : PREDICTION_MARKET_ADDRESS,
    abi: isV3 ? PREDICTION_MARKET_V3_ABI : PREDICTION_MARKET_ABI,
    functionName: "owner",
  });
  const isOwner = isConnected && ownerAddress && userAddress === ownerAddress;

  // Admin handlers
  const handleSettleMarket = async () => {
    if (!marketId || !isOwner) return;
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "setForwarderAddress",
      args: [userAddress!],
    });
  };

  const handleForceSettleStep2 = (outcome: 0 | 1) => {
    if (!marketId) return;
    if (isV3) {
      // V3 force settle: tier=1, payoutBps=5000 for SI; tier=0, payoutBps=0 for NO
      const appliedTier = outcome === 0 ? 1 : 0;
      const appliedPayoutBps = outcome === 0 ? 5000 : 0;
      const reportData = encodeAbiParameters(
        [
          { type: "uint256" },
          { type: "uint8" },
          { type: "uint16" },
          { type: "uint16" },
          { type: "bytes32" },
        ],
        [marketId, appliedTier, appliedPayoutBps, 10000, "0x0000000000000000000000000000000000000000000000000000000000000000"]
      );
      const fullReport = concat(["0x01", reportData]);
      writeContract({
        address: PREDICTION_MARKET_V3_ADDRESS,
        abi: PREDICTION_MARKET_V3_ABI,
        functionName: "onReport",
        args: ["0x", fullReport],
      });
    } else {
      const reportData = encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint8" }, { type: "uint16" }],
        [marketId, outcome, 10000]
      );
      const fullReport = concat(["0x01", reportData]);
      writeContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: "onReport",
        args: ["0x", fullReport],
      });
    }
  };

  const handleRestoreForwarder = () => {
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "setForwarderAddress",
      args: [SEP_CHAINLINK_FORWARDER],
    });
  };

  const handleClaim = () => {
    if (!marketId) return;
    if (isV3) {
      writeContract({
        address: PREDICTION_MARKET_V3_ADDRESS,
        abi: PREDICTION_MARKET_V3_ABI,
        functionName: "claim",
        args: [marketId],
      });
    } else {
      writeContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: "claim",
        args: [marketId],
      });
    }
  };

  const handlePredict = (outcome: 0 | 1, value: bigint) => {
    if (marketId === undefined) return;
    if (isV3) {
      // V3: stake(marketId, isInsured) — outcome 0 (SI/viajero) = isInsured true
      writeContract({
        address: PREDICTION_MARKET_V3_ADDRESS,
        abi: PREDICTION_MARKET_V3_ABI,
        functionName: "stake",
        args: [marketId, outcome === 0],
        value,
      });
    } else {
      writeContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: "predict",
        args: [marketId, outcome],
        value,
      });
    }
  };

  const handleRequestSettlement = () => {
    if (!marketId) return;
    if (isTest) {
      setTestHash("0x" + "e2e".padEnd(8, "0") + "cafebabedeadbeef".padEnd(56, "0"));
      return;
    }
    if (isV3) {
      writeContract({
        address: PREDICTION_MARKET_V3_ADDRESS,
        abi: PREDICTION_MARKET_V3_ABI,
        functionName: "requestSettlement",
        args: [marketId],
      });
    } else {
      writeContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: "requestSettlement",
        args: [marketId],
      });
    }
  };

  if (!marketId) return <div className="p-8 text-center text-gray-400">ID de poliza invalido</div>;
  if (effectiveIsLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-800/50 rounded w-1/3" />
          <div className="h-12 bg-gray-800/50 rounded w-2/3" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="h-48 bg-gray-800/50 rounded-xl" />
              <div className="h-48 bg-gray-800/50 rounded-xl" />
            </div>
            <div className="h-96 bg-gray-800/50 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }
  if (!effectiveMarket) return <div className="p-8 text-center text-red-400">Poliza no encontrada</div>;

  const market = effectiveMarket;
  const hasYesFunding = (displayMarket?.totalYesPool ?? 0n) > 0n;
  const hasNoFunding = (displayMarket?.totalNoPool ?? 0n) > 0n;
  const fundingReady = isFlightPolicy
    ? hasYesFunding && hasNoFunding
    : hasYesFunding || hasNoFunding;
  const wizardStepIndex = market.settled ? 2 : fundingReady ? 1 : 0;
  const missingFundingNotes = isFlightPolicy
    ? [
        !hasYesFunding ? "prima viajero (SI)" : null,
        !hasNoFunding ? "cobertura asegurador (NO)" : null,
      ].filter(Boolean) as string[]
    : [];
  const settleCommand = `scripts/v3-settle.sh ${marketId.toString()}`;
  const claimCommand = `scripts/v3-claim.sh ${marketId.toString()} --who both`;
  const v3InsuranceExample = (() => {
    if (!isV3 || !v3MarketResult) return null;

    const totalInsured = v3MarketResult.totalInsuredPool;
    const totalProvider = v3MarketResult.totalProviderPool;
    const totalPool = totalInsured + totalProvider;
    const maxPayoutWei = v3MarketResult.config.maxPayoutWei;
    const tier1Bps = BigInt(v3MarketResult.config.payoutBpsTier1);
    const tier2Bps = BigInt(v3MarketResult.config.payoutBpsTier2);
    const appliedBps = BigInt(v3MarketResult.appliedPayoutBps);
    const isSettled = v3MarketResult.settled;
    const isBreach = v3MarketResult.appliedTier > 0;

    const cap = (raw: bigint) => (raw > maxPayoutWei ? maxPayoutWei : raw);

    const tier1Traveler = cap((totalProvider * tier1Bps) / BPS_DENOMINATOR);
    const tier1Insurer = totalPool > tier1Traveler ? totalPool - tier1Traveler : 0n;
    const tier2Traveler = cap((totalProvider * tier2Bps) / BPS_DENOMINATOR);
    const tier2Insurer = totalPool > tier2Traveler ? totalPool - tier2Traveler : 0n;
    const noBreachTraveler = 0n;
    const noBreachInsurer = totalPool;

    let travelerApplied = 0n;
    let insurerApplied = totalPool;
    if (isSettled && isBreach) {
      travelerApplied = cap((totalProvider * appliedBps) / BPS_DENOMINATOR);
      insurerApplied = totalPool > travelerApplied ? totalPool - travelerApplied : 0n;
    }

    return {
      totalPool,
      maxPayoutWei,
      tier1Traveler,
      tier1Insurer,
      tier2Traveler,
      tier2Insurer,
      noBreachTraveler,
      noBreachInsurer,
      travelerApplied,
      insurerApplied,
      isSettled,
      isBreach,
    };
  })();

  const copyCommand = async (kind: "settle" | "claim", command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(kind);
      window.setTimeout(() => setCopiedCommand(null), 2000);
    } catch {
      setCopiedCommand(null);
    }
  };

  const handleRunLocalSettle = async () => {
    if (!isV3 || !marketId || market.settled || !isLocalhostClient) return;

    setIsRunningLocalSettle(true);
    setLocalSettleError(null);
    setLocalSettleOutput(null);
    setLocalSettleLastExitCode(null);

    try {
      const response = await fetch("/api/local/v3-settle", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          marketId: marketId.toString(),
          travelerAddress: userAddress || null,
        }),
      });

      const json = (await response.json()) as LocalSettleResponse;
      const output = [json.stdout || "", json.stderr || ""].filter(Boolean).join("\n").trim();
      setLocalSettleOutput(output || "(sin output)");
      setLocalSettleLastExitCode(Number.isFinite(json.exitCode) ? Number(json.exitCode) : null);

      if (!response.ok || !json.success) {
        setLocalSettleError(json.error || "Falló la ejecución del settle local.");
      } else {
        await effectiveRefetch();
      }
    } catch (error) {
      setLocalSettleError(error instanceof Error ? error.message : "Error ejecutando settle local");
    } finally {
      setIsRunningLocalSettle(false);
    }
  };

  const handleRunLocalClaim = async () => {
    if (!isV3 || !marketId || !market.settled || !isLocalhostClient) return;

    setIsRunningLocalClaim(true);
    setLocalClaimError(null);
    setLocalClaimOutput(null);
    setLocalClaimLastExitCode(null);

    try {
      const response = await fetch("/api/local/v3-claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          marketId: marketId.toString(),
          who: "both",
        }),
      });

      const json = (await response.json()) as LocalClaimResponse;
      const output = [json.stdout || "", json.stderr || ""].filter(Boolean).join("\n").trim();
      setLocalClaimOutput(output || "(sin output)");
      setLocalClaimLastExitCode(Number.isFinite(json.exitCode) ? Number(json.exitCode) : null);

      if (!response.ok || !json.success) {
        setLocalClaimError(json.error || "Falló la ejecución del claim local.");
      } else {
        await effectiveRefetch();
      }
    } catch (error) {
      setLocalClaimError(error instanceof Error ? error.message : "Error ejecutando claim local");
    } finally {
      setIsRunningLocalClaim(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/"
          className="text-gray-400 hover:text-white transition flex items-center gap-2 mb-4 text-sm"
        >
          ← Volver a polizas
        </Link>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <Badge variant="info">Poliza #{marketId.toString()}</Badge>
          {isV3 && <Badge variant="info">V3 Insurance</Badge>}
          <Badge variant={isFlightPolicy ? "flight" : "property"}>
            {isFlightPolicy ? "✈️ Vuelo" : "🏠 Inmueble"}
          </Badge>
          {market.settled ? (
            <Badge variant="settled">Resuelta</Badge>
          ) : (
            <Badge variant="active">Activa</Badge>
          )}
          {isFlightPolicy && extractedFlightId && (
            <Badge variant="info">{extractedFlightId}</Badge>
          )}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-white">
          {(market as any).question ??
            (isV3 && isFlightPolicy && extractedFlightId
              ? `Poliza V3 vuelo ${extractedFlightId}${
                  extractedFlightDate ? ` (${extractedFlightDate})` : ""
                }`
              : `Poliza #${marketId.toString()}`)}
        </h1>
      </div>

      {/* Wizard: policy progression for jurors/stakeholders */}
      <div className="mb-6 rounded-xl border border-cyan-700/40 bg-cyan-950/10 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300 mb-3">
          Progreso de póliza
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {POLICY_WIZARD_STEPS.map((stepTitle, index) => {
            const isComplete = index < wizardStepIndex;
            const isCurrent = index === wizardStepIndex;
            return (
              <div
                key={stepTitle}
                className={`rounded-lg border px-3 py-3 transition ${
                  isComplete
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : isCurrent
                      ? "border-cyan-500/50 bg-cyan-500/10"
                      : "border-gray-700 bg-gray-900/40"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                      isComplete
                        ? "bg-emerald-500 text-black"
                        : isCurrent
                          ? "bg-cyan-500 text-black"
                          : "bg-gray-700 text-gray-300"
                    }`}
                  >
                    {isComplete ? "✓" : index + 1}
                  </span>
                  <p
                    className={`text-sm font-medium ${
                      isComplete ? "text-emerald-200" : isCurrent ? "text-cyan-200" : "text-gray-400"
                    }`}
                  >
                    {stepTitle}
                  </p>
                </div>
                <p className="text-[11px] text-gray-400">
                  {index === 0 && "Se requiere fondear pools críticos para habilitar el flujo."}
                  {index === 1 && "Con fondos listos, se puede ejecutar liquidación automática CRE."}
                  {index === 2 && "Tras liquidación onchain, el usuario ganador puede reclamar."}
                </p>
              </div>
            );
          })}
        </div>
        {wizardStepIndex === 0 && missingFundingNotes.length > 0 && (
          <p className="mt-3 text-xs text-amber-300">
            Pendiente para continuar: {missingFundingNotes.join(" + ")}.
          </p>
        )}
        {isV3 && (
          <div className="mt-4 rounded-lg border border-gray-700 bg-black/30 p-3">
            <p className="text-xs text-gray-400 mb-2">
              {market.settled
                ? "Cierre de flujo (claim) sin pasos manuales de hash:"
                : "Liquidación asistida local (sin hash manual):"}
            </p>
            <div className="flex flex-col gap-2">
              <code className="block overflow-x-auto whitespace-nowrap rounded bg-gray-950 px-2 py-1.5 text-[11px] text-cyan-200">
                {market.settled ? claimCommand : settleCommand}
              </code>
              <button
                type="button"
                onClick={() =>
                  copyCommand(
                    market.settled ? "claim" : "settle",
                    market.settled ? claimCommand : settleCommand
                  )
                }
                className="self-start rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/20 transition"
              >
                {copiedCommand === (market.settled ? "claim" : "settle")
                  ? "Copiado"
                  : "Copiar comando"}
              </button>
              {!market.settled && (
                <p className="text-[11px] text-gray-500">
                  Este comando realiza requestSettlement + CRE settle + previewClaim en un solo flujo.
                </p>
              )}
              {!market.settled && isLocalhostClient && (
                <div className="mt-1 rounded border border-emerald-700/30 bg-emerald-950/10 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRunLocalSettle}
                      disabled={isRunningLocalSettle || !fundingReady}
                      className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRunningLocalSettle
                        ? "Ejecutando settle local..."
                        : "Ejecutar settle local"}
                    </button>
                    {!fundingReady && (
                      <span className="text-[11px] text-amber-300">
                        Completa fondeo para habilitar liquidación.
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Solo localhost. Ejecuta `scripts/v3-settle.sh` desde la app.
                  </p>
                  {localSettleLastExitCode !== null && (
                    <p
                      className={`mt-1 text-[11px] ${
                        localSettleLastExitCode === 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      Exit code: {localSettleLastExitCode}
                    </p>
                  )}
                  {localSettleError && (
                    <p className="mt-1 text-[11px] text-rose-300">{localSettleError}</p>
                  )}
                  {localSettleOutput && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/50 p-2 text-[10px] text-gray-300">
                      {localSettleOutput}
                    </pre>
                  )}
                </div>
              )}
              {market.settled && isLocalhostClient && (
                <div className="mt-1 rounded border border-indigo-700/30 bg-indigo-950/10 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRunLocalClaim}
                      disabled={isRunningLocalClaim}
                      className="rounded border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-1 text-[11px] text-indigo-200 transition hover:bg-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRunningLocalClaim
                        ? "Ejecutando claim local..."
                        : "Ejecutar claim local"}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Solo localhost. Ejecuta{" "}
                    <code>scripts/v3-claim.sh {marketId.toString()} --who both</code>.
                  </p>
                  {localClaimLastExitCode !== null && (
                    <p
                      className={`mt-1 text-[11px] ${
                        localClaimLastExitCode === 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      Exit code: {localClaimLastExitCode}
                    </p>
                  )}
                  {localClaimError && (
                    <p className="mt-1 text-[11px] text-rose-300">{localClaimError}</p>
                  )}
                  {localClaimOutput && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/50 p-2 text-[10px] text-gray-300">
                      {localClaimOutput}
                    </pre>
                  )}
                </div>
              )}
              {!market.settled && !isLocalhostClient && (
                <p className="text-[11px] text-gray-500">
                  Ejecución 1-click disponible solo en localhost.
                </p>
              )}
              {market.settled && !isLocalhostClient && (
                <p className="text-[11px] text-gray-500">
                  Claim local 1-click disponible solo en localhost.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* V3 Insurance State Panel */}
      {isV3 && v3MarketResult && (
        <div className="mb-6 bg-gray-900/50 border border-purple-700/40 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-3">
            Estado del seguro (V3)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-black/30 rounded-lg p-2.5">
              <p className="text-gray-500 mb-1">Prima depositada</p>
              <p className="text-white font-semibold">
                {v3MarketResult.totalInsuredPool > 0n
                  ? `${formatEther(v3MarketResult.totalInsuredPool)} ETH`
                  : "—"}
              </p>
            </div>
            <div className="bg-black/30 rounded-lg p-2.5">
              <p className="text-gray-500 mb-1">Cobertura depositada</p>
              <p className="text-white font-semibold">
                {v3MarketResult.totalProviderPool > 0n
                  ? `${formatEther(v3MarketResult.totalProviderPool)} ETH`
                  : "—"}
              </p>
            </div>
            <div className="bg-black/30 rounded-lg p-2.5">
              <p className="text-gray-500 mb-1">Tier aplicado</p>
              <p className={`font-semibold ${
                v3MarketResult.settled
                  ? v3MarketResult.appliedTier > 0
                    ? "text-amber-300"
                    : "text-green-400"
                  : "text-gray-400"
              }`}>
                {v3MarketResult.settled ? `Tier ${v3MarketResult.appliedTier}` : "Pendiente"}
              </p>
            </div>
            <div className="bg-black/30 rounded-lg p-2.5">
              <p className="text-gray-500 mb-1">Payout aplicado</p>
              <p className={`font-semibold ${
                v3MarketResult.settled && v3MarketResult.appliedTier > 0
                  ? "text-amber-300"
                  : "text-gray-400"
              }`}>
                {v3MarketResult.settled
                  ? `${(v3MarketResult.appliedPayoutBps / 100).toFixed(0)}%`
                  : "—"}
              </p>
            </div>
          </div>
          {v3UserStake && v3UserStake.amount > 0n && (
            <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-400">
              Tu posicion: {formatEther(v3UserStake.amount)} ETH como{" "}
              <span className={v3UserStake.isInsured ? "text-green-400" : "text-red-400"}>
                {v3UserStake.isInsured ? "viajero (asegurado)" : "asegurador (proveedor)"}
              </span>
              {v3UserStake.claimed && " — reclamado"}
            </div>
          )}
          {v3InsuranceExample && (
            <div className="mt-3 pt-3 border-t border-gray-700/50">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-300 mb-2">
                Simulación consistente (1 viajero + 1 asegurador)
              </h4>
              <p className="text-[11px] text-gray-400 mb-2">
                Tope onchain por viajero (`maxPayoutWei`):{" "}
                <span className="text-indigo-200 font-semibold">
                  {formatEthAmount(v3InsuranceExample.maxPayoutWei)}
                </span>
              </p>
              <p className="text-[11px] text-gray-400 mb-2">
                Modelo V3: la prima del viajero siempre queda en el asegurador; el payout del viajero sale del pool NO (cobertura).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-lg border border-indigo-700/30 bg-indigo-950/10 p-2">
                  <p className="text-indigo-200 font-medium mb-1">Tier 1 (50%)</p>
                  <p className="text-gray-300">
                    Viajero: <span className="text-white">{formatEthAmount(v3InsuranceExample.tier1Traveler)}</span>
                  </p>
                  <p className="text-gray-500">{formatUsdApprox(v3InsuranceExample.tier1Traveler)}</p>
                  <p className="text-gray-300">
                    Asegurador:{" "}
                    <span className="text-white">{formatEthAmount(v3InsuranceExample.tier1Insurer)}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-indigo-700/30 bg-indigo-950/10 p-2">
                  <p className="text-indigo-200 font-medium mb-1">Tier 2 (100%/cancelado)</p>
                  <p className="text-gray-300">
                    Viajero: <span className="text-white">{formatEthAmount(v3InsuranceExample.tier2Traveler)}</span>
                  </p>
                  <p className="text-gray-500">{formatUsdApprox(v3InsuranceExample.tier2Traveler)}</p>
                  <p className="text-gray-300">
                    Asegurador:{" "}
                    <span className="text-white">{formatEthAmount(v3InsuranceExample.tier2Insurer)}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-indigo-700/30 bg-indigo-950/10 p-2">
                  <p className="text-indigo-200 font-medium mb-1">Sin breach</p>
                  <p className="text-gray-300">
                    Viajero: <span className="text-white">{formatEthAmount(v3InsuranceExample.noBreachTraveler)}</span>
                  </p>
                  <p className="text-gray-300">
                    Asegurador:{" "}
                    <span className="text-white">{formatEthAmount(v3InsuranceExample.noBreachInsurer)}</span>
                  </p>
                </div>
              </div>
              {v3InsuranceExample.isSettled && (
                <div className="mt-2 rounded-lg border border-emerald-700/30 bg-emerald-950/10 p-2 text-[11px]">
                  <p className="text-emerald-200 font-medium mb-1">Resultado aplicado</p>
                  <p className="text-gray-300">
                    Viajero:{" "}
                    <span className="text-white">
                      {formatEthAmount(v3InsuranceExample.travelerApplied)}
                    </span>
                  </p>
                  <p className="text-gray-500">{formatUsdApprox(v3InsuranceExample.travelerApplied)}</p>
                  <p className="text-gray-300">
                    Asegurador:{" "}
                    <span className="text-white">
                      {formatEthAmount(v3InsuranceExample.insurerApplied)}
                    </span>
                    {" "} (incluye prima del viajero)
                  </p>
                </div>
              )}
              <p className="mt-2 text-[11px] text-gray-500">
                Nota: con múltiples viajeros/aseguradores, el contrato reparte pro-rata por stake.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Evidence & Result */}
        {displayMarket && (
          <DecisionPanel
            market={displayMarket}
            isFlightPolicy={isFlightPolicy}
            isV3={isV3}
            revealFlightOracle={revealFlightOracle}
            flightReference={{
              flightId: extractedFlightId,
              flightDate: extractedFlightDate,
              thresholdMinutes:
                configuredThresholdMinutes ??
                (flightData?.thresholdMinutes ?? null),
              tier2ThresholdMinutes:
                configuredTier2ThresholdMinutes ??
                (flightData?.tier2ThresholdMinutes ?? null),
            }}
            flightData={flightData}
            flightLoading={flightLoading}
            flightError={flightError}
            oracleData={oracleData}
            oracleLoading={oracleLoading}
            oracleError={oracleError}
            oracleBaseUrl={oracleBaseUrl}
            weatherData={weatherData}
            weatherLoading={weatherLoading}
            weatherError={weatherError}
            weatherLatitude={weatherLatitude}
            weatherLongitude={weatherLongitude}
            weatherTimezone={weatherTimezone}
            onClaim={handleClaim}
            isProcessing={isWritePending || isConfirming}
          />
        )}

        {/* Right: Predict form (only when not settled) */}
        {!market.settled && (
          <PredictForm
            isConnected={isConnected}
            isTest={isTest}
            isFlightPolicy={isFlightPolicy}
            isV3={isV3}
            suggestedCoverageEth={suggestedCoverageEth}
            suggestedPremiumPct={suggestedPremiumPct}
            totalYesPool={displayMarket?.totalYesPool}
            totalNoPool={displayMarket?.totalNoPool}
            onPredict={handlePredict}
            onRequestSettlement={handleRequestSettlement}
            isProcessing={isWritePending}
            isConfirming={isConfirming}
            isSuccess={isSuccess}
            writeError={writeError}
            txHash={(hash || testHash) ?? null}
          />
        )}
      </div>

      {/* Admin zone - hidden by default, toggle via button */}
      {isOwner && (
        <div className="mt-12">
          <button
            type="button"
            onClick={() => setShowAdmin(!showAdmin)}
            className="text-xs text-gray-600 hover:text-gray-400 transition"
          >
            {showAdmin ? "Ocultar admin" : "Mostrar herramientas admin"}
          </button>
          {showAdmin && (
            <div className="mt-4 bg-gray-900/50 border border-gray-800 rounded-xl p-6">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">
                Zona admin (testing)
              </h3>
              <div className="space-y-2">
                <p className="text-xs text-gray-500 mb-2">
                  Forzar liquidacion para pruebas.
                </p>
                {!isV3 && (
                  <button
                    type="button"
                    onClick={handleSettleMarket}
                    className="text-xs bg-blue-900 text-blue-200 px-3 py-2 rounded w-full"
                  >
                    Paso 1: Ponerme como Forwarder
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleForceSettleStep2(0)}
                    className="flex-1 text-xs bg-green-900 text-green-200 px-3 py-2 rounded"
                  >
                    {isV3 ? "Liquidar SI (Tier 1, 50%)" : "Paso 2: Liquidar SI"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleForceSettleStep2(1)}
                    className="flex-1 text-xs bg-red-900 text-red-200 px-3 py-2 rounded"
                  >
                    {isV3 ? "Liquidar NO (Tier 0)" : "Paso 2: Liquidar NO"}
                  </button>
                </div>
                {!isV3 && (
                  <button
                    type="button"
                    onClick={handleRestoreForwarder}
                    className="text-xs bg-gray-700 text-gray-300 px-3 py-2 rounded w-full mt-2"
                  >
                    Paso 3: Restaurar Forwarder real
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MarketDetail() {
  return (
    <Suspense fallback={null}>
      <MarketDetailInner />
    </Suspense>
  );
}
