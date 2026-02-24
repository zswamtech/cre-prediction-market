"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { decodeEventLog, parseAbiItem, parseEther, stringToHex } from "viem";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
  PREDICTION_MARKET_V3_ABI,
  PREDICTION_MARKET_V3_ADDRESS,
} from "@/lib/contract";
import { useReliableWrite } from "@/hooks/useReliableWrite";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getCoverageTemplates } from "@/lib/policyTemplates";
import {
  buildFlightQuestionExamples,
  buildFlightQuestion,
  buildFlightQuestionVariant,
  buildPropertyQuestion,
  FLIGHT_QUESTION_VARIANTS,
  normalizeDelayThreshold,
  normalizeFlightCode,
  normalizePropertyId,
  validateDelayThreshold,
  validateFlightCode,
  validatePropertyId,
  type CoverageKind,
  type DraftPolicyItem,
  type DraftPolicyParams,
  type FlightCoverageKind,
  type FlightQuestionVariant,
  type PolicyType,
  type PropertyCoverageKind,
} from "@/lib/questionBuilders";
import { loadPolicyDraft, savePolicyDraft } from "@/types/policyPurchase";

const MARKET_CREATED_EVENT_ABI = [
  parseAbiItem("event MarketCreated(uint256 indexed marketId, string question, address creator)"),
] as const;
const POLICY_CREATED_EVENT_ABI = [
  parseAbiItem(
    "event PolicyCreated(uint256 indexed marketId, address indexed creator, uint8 policyType, bytes32 oracleRef, uint48 startTime, uint48 endTime, uint16 payoutBpsTier1, uint16 payoutBpsTier2, uint256 maxPayoutWei)"
  ),
] as const;
const V3_PLACEHOLDER = "0x0000000000000000000000000000000000000000";
const DEFAULT_ETH_PRICE_USD = Number(process.env.NEXT_PUBLIC_ETH_PRICE_USD || "3000");

function createDraftId(): string {
  return `draft_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type Eip1193ProviderLike = {
  isMetaMask?: boolean;
  isAaveWallet?: boolean;
  providers?: Eip1193ProviderLike[];
  providerInfo?: { name?: string };
  providersInfo?: { name?: string };
  name?: string;
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
};

function getProviderLabel(provider: Eip1193ProviderLike): string {
  return (
    provider.providerInfo?.name ||
    provider.providersInfo?.name ||
    provider.name ||
    ""
  );
}

function isLikelyFamilyAccountsProvider(provider: Eip1193ProviderLike): boolean {
  const label = getProviderLabel(provider).toLowerCase();
  if (provider.isAaveWallet) return true;
  return label.includes("aave") || label.includes("family");
}

function pickPreferredProvider(rootProvider: Eip1193ProviderLike): Eip1193ProviderLike {
  const providers = Array.isArray(rootProvider.providers)
    ? rootProvider.providers
    : [rootProvider];

  const metaMaskWithoutFamily = providers.find(
    (provider) => provider.isMetaMask && !isLikelyFamilyAccountsProvider(provider)
  );
  if (metaMaskWithoutFamily) return metaMaskWithoutFamily;

  const anyMetaMask = providers.find((provider) => provider.isMetaMask);
  if (anyMetaMask) return anyMetaMask;

  return rootProvider;
}

function toMarketCreatedId(receipt: {
  logs: Array<{ data: `0x${string}`; topics: `0x${string}`[] }>;
}): string | undefined {
  for (const log of receipt.logs) {
    if (log.topics.length === 0) continue;
    try {
      const decodedV1 = decodeEventLog({
        abi: MARKET_CREATED_EVENT_ABI,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decodedV1.eventName === "MarketCreated" && decodedV1.args.marketId !== undefined) {
        return decodedV1.args.marketId.toString();
      }
    } catch {
      // ignore V1 decode errors
    }
    try {
      const decodedV3 = decodeEventLog({
        abi: POLICY_CREATED_EVENT_ABI,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decodedV3.eventName === "PolicyCreated" && decodedV3.args.marketId !== undefined) {
        return decodedV3.args.marketId.toString();
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

function statusBadgeVariant(status: DraftPolicyItem["status"]) {
  switch (status) {
    case "confirmed": return "settled" as const;
    case "failed": return "error" as const;
    case "skipped": return "pending" as const;
    case "awaiting_signature":
    case "broadcasted":
    case "queued": return "active" as const;
    default: return "info" as const;
  }
}

function statusLabel(status: DraftPolicyItem["status"]): string {
  switch (status) {
    case "draft": return "Draft";
    case "queued": return "En cola";
    case "awaiting_signature": return "Esperando firma";
    case "broadcasted": return "Tx enviada";
    case "confirmed": return "Confirmada";
    case "failed": return "Fallida";
    case "skipped": return "Omitida";
    default: return "Draft";
  }
}

export default function CreateMarket() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isConnected, address } = useAccount();
  const isTestMode = process.env.NEXT_PUBLIC_TEST_MODE === "1";
  const publicClient = usePublicClient();
  const v3Enabled = PREDICTION_MARKET_V3_ADDRESS !== V3_PLACEHOLDER;
  const isV3 = v3Enabled && searchParams.get("v") !== "1";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { writeContract: _reliableWrite } = useReliableWrite();

  const [policyType, setPolicyType] = useState<PolicyType>("flight");
  const [selectedCoverage, setSelectedCoverage] = useState<CoverageKind>("flight_delay");
  const [question, setQuestion] = useState("");

  // Flight fields
  const [flightCode, setFlightCode] = useState("AV8520");
  const [flightDate, setFlightDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [flightDelayThresholdMinutes, setFlightDelayThresholdMinutes] = useState("45");
  const [flightQuestionVariant, setFlightQuestionVariant] =
    useState<FlightQuestionVariant>("standard");

  // Property fields
  const [propertyId, setPropertyId] = useState("110");

  // Insurance-first fields (offchain only — not recorded onchain in V1)
  const [ticketPriceUsd, setTicketPriceUsd] = useState("");
  const [coverageCapEth, setCoverageCapEth] = useState("");
  const [premiumRatePct, setPremiumRatePct] = useState("15");

  // UX mode: single policy (default) or bundle (advanced)
  const [showBundle, setShowBundle] = useState(false);

  // Bundle state
  const [bundleItems, setBundleItems] = useState<DraftPolicyItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [bundleCreating, setBundleCreating] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const templates = useMemo(() => getCoverageTemplates(policyType), [policyType]);

  // Computed insurance fields (offchain, for display only)
  const payoutCapUsd = useMemo(() => {
    const price = parseFloat(ticketPriceUsd);
    if (!isNaN(price) && price > 0) return (price * 0.5).toFixed(2);
    return null;
  }, [ticketPriceUsd]);

  const premiumEstimateUsd = useMemo(() => {
    const price = parseFloat(ticketPriceUsd);
    const rate = parseFloat(premiumRatePct);
    if (!isNaN(price) && price > 0 && !isNaN(rate) && rate > 0) {
      return (price * (rate / 100)).toFixed(2);
    }
    return null;
  }, [ticketPriceUsd, premiumRatePct]);

  const tier1CoverageEth = useMemo(() => {
    const cap = parseFloat(coverageCapEth);
    if (!isNaN(cap) && cap > 0) return (cap * 0.5).toFixed(6);
    return null;
  }, [coverageCapEth]);

  const ticketEthEstimate = useMemo(() => {
    const ticketUsd = Number.parseFloat(ticketPriceUsd);
    if (!Number.isFinite(ticketUsd) || ticketUsd <= 0) return null;
    if (!Number.isFinite(DEFAULT_ETH_PRICE_USD) || DEFAULT_ETH_PRICE_USD <= 0) return null;
    return ticketUsd / DEFAULT_ETH_PRICE_USD;
  }, [ticketPriceUsd]);

  const tier1TicketEthEstimate = useMemo(() => {
    if (ticketEthEstimate === null) return null;
    return ticketEthEstimate * 0.5;
  }, [ticketEthEstimate]);

  const coverageAdequacy = useMemo(() => {
    const configuredCoverage = Number.parseFloat(coverageCapEth);
    if (!Number.isFinite(configuredCoverage) || configuredCoverage <= 0) {
      return {
        hasCoverage: false,
        isEnoughForTicket: false,
        gapEth: null as number | null,
      };
    }
    if (ticketEthEstimate === null) {
      return {
        hasCoverage: true,
        isEnoughForTicket: true,
        gapEth: 0,
      };
    }
    const gapEth = ticketEthEstimate - configuredCoverage;
    return {
      hasCoverage: true,
      isEnoughForTicket: gapEth <= 0,
      gapEth: gapEth > 0 ? gapEth : 0,
    };
  }, [coverageCapEth, ticketEthEstimate]);

  const suggestedPremiumEth = useMemo(() => {
    const cap = parseFloat(coverageCapEth);
    const rate = parseFloat(premiumRatePct);
    if (!isNaN(cap) && cap > 0 && !isNaN(rate) && rate > 0) {
      return (cap * (rate / 100)).toFixed(6);
    }
    return null;
  }, [coverageCapEth, premiumRatePct]);

  const flightQuestionExamples = useMemo(() => {
    return buildFlightQuestionExamples(
      flightCode,
      flightDate,
      normalizeDelayThreshold(Number(flightDelayThresholdMinutes))
    );
  }, [flightCode, flightDate, flightDelayThresholdMinutes]);

  useEffect(() => {
    const validKinds = new Set(templates.map((t) => t.coverageKind));
    if (!validKinds.has(selectedCoverage)) {
      setSelectedCoverage(templates[0]?.coverageKind ?? "flight_delay");
    }
  }, [policyType, selectedCoverage, templates]);

  // Load draft from localStorage on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const draft = loadPolicyDraft();
    if (draft) {
      if (draft.policyType) setPolicyType(draft.policyType);
      if (draft.flightCode) setFlightCode(draft.flightCode);
      if (draft.travelDate) setFlightDate(draft.travelDate);
      if (draft.delayThresholdMinutes) setFlightDelayThresholdMinutes(String(draft.delayThresholdMinutes));
      if (draft.propertyId) setPropertyId(draft.propertyId);
      if (draft.ticketPriceUsd !== undefined) setTicketPriceUsd(String(draft.ticketPriceUsd));
      if (draft.coverageCapEth !== undefined) setCoverageCapEth(String(draft.coverageCapEth));
      if (draft.premiumRatePct !== undefined) setPremiumRatePct(String(draft.premiumRatePct));
      if (draft.question) setQuestion(draft.question);
    }
    setDraftHydrated(true);
  }, []); // intentionally run once on mount

  // Save draft to localStorage on any field change
  useEffect(() => {
    if (!draftHydrated) return;

    const parsedTicketPrice = Number.parseFloat(ticketPriceUsd);
    const normalizedTicketPriceUsd =
      Number.isFinite(parsedTicketPrice) && parsedTicketPrice > 0
        ? parsedTicketPrice
        : undefined;

    const parsedPayoutCapUsd = payoutCapUsd ? Number.parseFloat(payoutCapUsd) : NaN;
    const normalizedPayoutCapUsd =
      Number.isFinite(parsedPayoutCapUsd) && parsedPayoutCapUsd > 0
        ? parsedPayoutCapUsd
        : undefined;

    const parsedCoverageCapEth = Number.parseFloat(coverageCapEth);
    const normalizedCoverageCapEth =
      Number.isFinite(parsedCoverageCapEth) && parsedCoverageCapEth > 0
        ? parsedCoverageCapEth
        : undefined;

    const parsedPremiumRatePct = Number.parseFloat(premiumRatePct);
    const normalizedPremiumRatePct =
      Number.isFinite(parsedPremiumRatePct) && parsedPremiumRatePct > 0
        ? parsedPremiumRatePct
        : undefined;

    const parsedSuggestedPremiumEth = suggestedPremiumEth ? Number.parseFloat(suggestedPremiumEth) : NaN;
    const normalizedSuggestedPremiumEth =
      Number.isFinite(parsedSuggestedPremiumEth) && parsedSuggestedPremiumEth > 0
        ? parsedSuggestedPremiumEth
        : undefined;

    savePolicyDraft({
      version: 1,
      policyType,
      flightCode: flightCode || undefined,
      travelDate: flightDate || undefined,
      delayThresholdMinutes: Number(flightDelayThresholdMinutes) || undefined,
      propertyId: propertyId || undefined,
      ticketPriceUsd: normalizedTicketPriceUsd,
      payoutCapUsd: normalizedPayoutCapUsd,
      coverageCapEth: normalizedCoverageCapEth,
      premiumRatePct: normalizedPremiumRatePct,
      suggestedPremiumEth: normalizedSuggestedPremiumEth,
      wallet: address?.toLowerCase() || undefined,
      // PNR hash is not captured yet in /create (V1 insurance-first UX).
      pnrHash: undefined,
      question: question || undefined,
      savedAt: new Date().toISOString(),
    });
  }, [draftHydrated, policyType, flightCode, flightDate, flightDelayThresholdMinutes, propertyId, ticketPriceUsd, payoutCapUsd, coverageCapEth, premiumRatePct, suggestedPremiumEth, question, address]);

  const packageSummary = useMemo(() => {
    const total = bundleItems.length;
    const confirmed = bundleItems.filter((i) => i.status === "confirmed").length;
    const failed = bundleItems.filter((i) => i.status === "failed").length;
    return { total, confirmed, failed };
  }, [bundleItems]);

  // ── Helpers ──
  const buildSuggestedQuestion = (): string => {
    if (policyType === "flight") {
      const threshold = normalizeDelayThreshold(Number(flightDelayThresholdMinutes));
      return buildFlightQuestionVariant(
        flightCode,
        flightDate,
        threshold,
        flightQuestionVariant
      );
    }
    return buildPropertyQuestion(
      selectedCoverage as PropertyCoverageKind,
      normalizePropertyId(propertyId)
    );
  };

  const getV3InsuranceConfigError = (): string | null => {
    if (!isV3 || policyType !== "flight") return null;

    const configuredCoverage = Number.parseFloat(coverageCapEth);
    if (!Number.isFinite(configuredCoverage) || configuredCoverage <= 0) {
      return "En V3 debes definir Capital cobertura Tier 2 (ETH) mayor a 0.";
    }

    const premiumPct = Number.parseFloat(premiumRatePct);
    if (!Number.isFinite(premiumPct) || premiumPct <= 0 || premiumPct > 100) {
      return "Prima % inválida. Usa un valor entre 0.1 y 100.";
    }

    if (ticketEthEstimate !== null && configuredCoverage < ticketEthEstimate) {
      return `Cobertura Tier 2 insuficiente para cubrir 100% del ticket. Recomendado >= ${ticketEthEstimate.toFixed(
        6
      )} ETH.`;
    }

    return null;
  };

  const validateCurrentDraft = (): string | null => {
    if (isV3 && policyType !== "flight") {
      return "En modo V3, esta pantalla soporta polizas de vuelo.";
    }
    if (policyType === "property") {
      if (!validatePropertyId(propertyId)) return "Property ID invalido.";
    }
    if (policyType === "flight") {
      if (!validateFlightCode(flightCode)) return "Flight Code invalido (ej: AV8520).";
      if (!flightDate.trim()) return "Fecha de viaje obligatoria.";
      const threshold = normalizeDelayThreshold(Number(flightDelayThresholdMinutes));
      if (!validateDelayThreshold(threshold)) return "Threshold entre 15 y 240 minutos.";
      const v3InsuranceError = getV3InsuranceConfigError();
      if (v3InsuranceError) return v3InsuranceError;
    }
    if (!isV3 && !question.trim()) return "La pregunta es obligatoria.";
    return null;
  };

  const buildCurrentDraftItem = (): DraftPolicyItem | null => {
    const validationError = validateCurrentDraft();
    if (validationError) {
      setSubmitError(validationError);
      return null;
    }

    let params: DraftPolicyParams;
    if (policyType === "flight") {
      params = {
        policyType: "flight",
        coverageKind: "flight_delay" as FlightCoverageKind,
        flightCode: normalizeFlightCode(flightCode),
        travelDate: flightDate.trim(),
        delayThresholdMinutes: normalizeDelayThreshold(Number(flightDelayThresholdMinutes)),
      };
    } else {
      params = {
        policyType: "property",
        coverageKind: selectedCoverage as PropertyCoverageKind,
        propertyId: normalizePropertyId(propertyId),
        planType: "balanced",
      };
    }

    return {
      id: editingItemId || createDraftId(),
      policyType,
      coverageKind: selectedCoverage,
      question: question.trim() || buildSuggestedQuestion(),
      params,
      status: "draft",
    };
  };

  // ── Bundle actions ──
  const handleAddToBundle = () => {
    setSubmitError(null);
    setBundleError(null);
    const item = buildCurrentDraftItem();
    if (!item) return;

    setBundleItems((prev) => {
      if (editingItemId) {
        return prev.map((cur) =>
          cur.id === editingItemId ? { ...item, status: "draft" as const } : cur
        );
      }
      return [...prev, item];
    });
    setEditingItemId(null);
    setQuestion("");
  };

  const handleEditItem = (item: DraftPolicyItem) => {
    setEditingItemId(item.id);
    setPolicyType(item.policyType);
    setSelectedCoverage(item.coverageKind);
    setQuestion(item.question);
    if (item.params.policyType === "property") {
      setPropertyId(item.params.propertyId);
    }
    if (item.params.policyType === "flight") {
      setFlightCode(item.params.flightCode);
      setFlightDate(item.params.travelDate);
      setFlightDelayThresholdMinutes(String(item.params.delayThresholdMinutes));
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setBundleItems((prev) => prev.filter((i) => i.id !== itemId));
    if (editingItemId === itemId) {
      setEditingItemId(null);
      setQuestion("");
    }
  };

  const updateBundleItem = (itemId: string, patch: Partial<DraftPolicyItem>) => {
    setBundleItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    );
  };

  // ── Sequential execution ──
  const createBundleSequentially = async (items: DraftPolicyItem[]) => {
    setBundleCreating(true);
    setSubmitError(null);
    setBundleError(null);

    const queuedIds = new Set(items.map((i) => i.id));
    setBundleItems((prev) =>
      prev.map((item) =>
        queuedIds.has(item.id)
          ? { ...item, status: "queued" as const, txHash: undefined, marketId: undefined, error: undefined }
          : item
      )
    );

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      updateBundleItem(item.id, { status: "awaiting_signature" });

      try {
        let txHash: `0x${string}` | undefined;
        let expectedMarketId: string | undefined;
        let targetAddress: `0x${string}` = PREDICTION_MARKET_ADDRESS;

        const { encodeFunctionData, createWalletClient, custom } = await import("viem");
        const { sepolia } = await import("viem/chains");

        console.log(
          `[Bundle] Creating ${isV3 ? "policy V3" : "market V1"}: "${item.question.slice(0, 60)}..."`
        );

        let data: `0x${string}`;
        if (isV3) {
          if (item.params.policyType !== "flight") {
            throw new Error("En modo V3, /create solo soporta polizas de vuelo.");
          }
          const thresholdMinutes = normalizeDelayThreshold(item.params.delayThresholdMinutes);
          const thresholdPrimarySeconds = thresholdMinutes * 60;
          const thresholdSecondarySeconds = Math.max(90 * 60, thresholdPrimarySeconds * 2);

          const parsedStart = new Date(`${item.params.travelDate}T00:00:00Z`);
          const nowSec = Math.floor(Date.now() / 1000);
          let startTime = Number.isFinite(parsedStart.getTime())
            ? Math.floor(parsedStart.getTime() / 1000)
            : nowSec;
          let endTime = startTime + 24 * 60 * 60;
          if (endTime <= nowSec) {
            startTime = nowSec;
            endTime = nowSec + 24 * 60 * 60;
          }

          const configuredCoverageEth = Number.parseFloat(coverageCapEth);
          if (!Number.isFinite(configuredCoverageEth) || configuredCoverageEth <= 0) {
            throw new Error("V3 requiere Capital cobertura Tier 2 (ETH) mayor a 0.");
          }
          const maxPayoutWei = parseEther(
            String(
              configuredCoverageEth
            )
          );
          const oracleRef = stringToHex(normalizeFlightCode(item.params.flightCode), {
            size: 32,
          }) as `0x${string}`;

          data = encodeFunctionData({
            abi: PREDICTION_MARKET_V3_ABI,
            functionName: "createPolicy",
            args: [{
              policyType: 0, // PolicyType.FlightDelay
              oracleRef,
              startTime,
              endTime,
              thresholdPrimary: thresholdPrimarySeconds,
              thresholdSecondary: thresholdSecondarySeconds,
              payoutBpsTier1: 5000, // Tier 1 payout bps (50%)
              payoutBpsTier2: 10000, // Tier 2 payout bps (100%)
              maxPayoutWei,
            }],
          });
          targetAddress = PREDICTION_MARKET_V3_ADDRESS;
          if (publicClient) {
            try {
              const nextId = await publicClient.readContract({
                address: PREDICTION_MARKET_V3_ADDRESS,
                abi: PREDICTION_MARKET_V3_ABI,
                functionName: "getNextMarketId",
              });
              expectedMarketId = nextId.toString();
            } catch (nextIdErr) {
              console.warn("[Bundle] Could not pre-read V3 next market id:", nextIdErr);
            }
          }
        } else {
          data = encodeFunctionData({
            abi: PREDICTION_MARKET_ABI,
            functionName: "createMarket",
            args: [item.question],
          });
          targetAddress = PREDICTION_MARKET_ADDRESS;
        }

        if (typeof window === "undefined" || !(window as any).ethereum) {
          throw new Error("No wallet provider found (window.ethereum)");
        }

        const rootProvider = (window as any).ethereum as Eip1193ProviderLike;
        const selectedProvider = pickPreferredProvider(rootProvider);
        const selectedProviderLabel = getProviderLabel(selectedProvider);
        console.log(
          `[Bundle] Using provider: ${
            selectedProviderLabel || (selectedProvider.isMetaMask ? "MetaMask" : "Injected")
          }`
        );

        await selectedProvider.request({ method: "eth_requestAccounts" });
        const chainHex = (await selectedProvider.request({
          method: "eth_chainId",
        })) as string;

        if (chainHex?.toLowerCase() !== "0xaa36a7") {
          try {
            await selectedProvider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: "0xaa36a7" }],
            });
          } catch {
            throw new Error(
              "Cambia tu wallet a Sepolia (11155111) en MetaMask y vuelve a intentarlo."
            );
          }
          // Verify switch actually took effect
          const chainHexAfter = (await selectedProvider.request({
            method: "eth_chainId",
          })) as string;
          if (chainHexAfter?.toLowerCase() !== "0xaa36a7") {
            throw new Error(
              "La red no cambio a Sepolia. Cambia manualmente en MetaMask (red: Sepolia, chain ID 11155111) y recarga la pagina."
            );
          }
        }

        const accounts = (await selectedProvider.request({
          method: "eth_accounts",
        })) as string[];
        const activeAccount = (accounts?.[0] || address || "") as `0x${string}`;
        if (!activeAccount) {
          throw new Error("No se pudo obtener una cuenta activa desde MetaMask.");
        }

        let gas = 500_000n;
        let nonce: number | undefined;
        let maxFeePerGas: bigint | undefined;
        let maxPriorityFeePerGas: bigint | undefined;

        if (publicClient) {
          try {
            const [estimated, gasPrice, txCount] = await Promise.all([
              publicClient.estimateGas({
                to: targetAddress,
                data,
                account: activeAccount,
              }),
              publicClient.getGasPrice(),
              publicClient.getTransactionCount({
                address: activeAccount,
                blockTag: "pending",
              }),
            ]);
            gas = (estimated * 150n) / 100n;
            maxFeePerGas = gasPrice * 2n;
            maxPriorityFeePerGas = gasPrice / 10n;
            nonce = txCount;
            console.log(
              `[Bundle] Pre-computed: gas=${gas}, maxFee=${maxFeePerGas}, nonce=${nonce}`
            );
          } catch (preErr) {
            console.warn("[Bundle] Pre-computation partial failure:", preErr);
          }
        }

        const walletClient = createWalletClient({
          chain: sepolia,
          transport: custom(selectedProvider),
        });

        console.log("[Bundle] Sending via walletClient.sendTransaction...");
        txHash = await walletClient.sendTransaction({
          to: targetAddress,
          data,
          gas,
          ...(maxFeePerGas ? { maxFeePerGas } : {}),
          ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas } : {}),
          ...(nonce !== undefined ? { nonce } : {}),
          chain: sepolia,
          account: activeAccount,
        });
        console.log("[Bundle] TX sent:", txHash);

        updateBundleItem(item.id, { status: "broadcasted", txHash });

        if (txHash && publicClient) {
          let confirmed = false;
          const startedAt = Date.now();
          const timeout = 90_000;

          while (Date.now() - startedAt <= timeout) {
            try {
              const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
              if (receipt) {
                const marketId = toMarketCreatedId(receipt as any) ?? expectedMarketId;
                updateBundleItem(item.id, {
                  status: "confirmed",
                  txHash,
                  marketId,
                  error: undefined,
                });
                if (!showBundle && items.length === 1 && marketId) {
                  router.push(`/market/${marketId}${isV3 ? "?v=3" : ""}`);
                }
                confirmed = true;
                break;
              }
            } catch {
              // still pending
            }
            await sleep(2500);
          }

          if (!confirmed) {
            updateBundleItem(item.id, {
              status: "failed",
              txHash,
              error: "Tx no confirmo en el tiempo esperado. Verifica en Etherscan.",
            });
            for (let j = index + 1; j < items.length; j++) {
              updateBundleItem(items[j].id, {
                status: "skipped",
                error: "Ejecucion detenida por error en una poliza previa.",
              });
            }
            break;
          }
        }
      } catch (executionError) {
        console.error("[Bundle] Execution error:", executionError);
        const fullMessage = executionError instanceof Error
          ? executionError.message
          : "Error al crear la poliza.";
        let message = fullMessage.length > 200 ? fullMessage.slice(0, 200) + "..." : fullMessage;
        if (
          /Family Accounts is not connected|EthereumProviderConnectionTimeoutError|Aave Wallet/i.test(
            fullMessage
          )
        ) {
          message =
            "Proveedor Aave/Family Accounts no disponible. Usa MetaMask en Sepolia y vuelve a intentar.";
        } else if (
          /current chain of the wallet|does not match the target chain|Expected Chain ID: 11155111/i.test(
            fullMessage
          )
        ) {
          message =
            "Red incorrecta en wallet. Cambia MetaMask a Sepolia (11155111) y reintenta.";
        }

        const isUserReject = /user rejected|rejected the request|user denied/i.test(fullMessage);

        updateBundleItem(item.id, {
          status: "failed",
          error: isUserReject ? "Firma rechazada por el usuario." : message,
        });

        if (items.length > 1 && index < items.length - 1) {
          for (let j = index + 1; j < items.length; j++) {
            updateBundleItem(items[j].id, {
              status: "skipped",
              error: "Ejecucion detenida por error en poliza anterior. Puedes reintentarla individualmente.",
            });
          }
        }
        break;
      }
    }

    setBundleCreating(false);
  };

  const handleCreatePolicyNow = async () => {
    if (bundleCreating) return;
    setSubmitError(null);
    setBundleError(null);

    if (!isConnected || !address) {
      setBundleError("Conecta tu wallet primero.");
      return;
    }

    const v3InsuranceError = getV3InsuranceConfigError();
    if (v3InsuranceError) {
      setBundleError(v3InsuranceError);
      return;
    }

    let executionItems = showBundle ? bundleItems : [];

    if (executionItems.length === 0) {
      const singleItem = buildCurrentDraftItem();
      if (!singleItem) {
        setBundleError(
          isV3
            ? "Completa los datos de vuelo para crear la poliza V3."
            : "Completa la pregunta antes de crear la poliza."
        );
        return;
      }
      executionItems = [singleItem];
      setBundleItems([singleItem]);
    }

    await createBundleSequentially(executionItems);
  };

  // ── Demo loaders ──
  const loadFlightDemo = () => {
    setPolicyType("flight");
    setSelectedCoverage("flight_delay");
    setFlightCode("AV8520");
    setFlightDelayThresholdMinutes("45");
    setFlightQuestionVariant("standard");
    const suggestedQ = buildFlightQuestion("AV8520", flightDate, 45);
    setQuestion(suggestedQ);
    setEditingItemId(null);
    setBundleError(null);
    setSubmitError(null);
    setBundleItems([]);
  };

  const loadFlightDemoBundle = () => {
    const item1: DraftPolicyItem = {
      id: createDraftId(),
      policyType: "flight",
      coverageKind: "flight_delay",
      question: buildFlightQuestion("AV8520", flightDate, 45),
      params: {
        policyType: "flight",
        coverageKind: "flight_delay",
        flightCode: "AV8520",
        travelDate: flightDate,
        delayThresholdMinutes: 45,
      },
      status: "draft",
    };
    const item2: DraftPolicyItem = {
      id: createDraftId(),
      policyType: "flight",
      coverageKind: "flight_delay",
      question: buildFlightQuestion("LA4112", flightDate, 45),
      params: {
        policyType: "flight",
        coverageKind: "flight_delay",
        flightCode: "LA4112",
        travelDate: flightDate,
        delayThresholdMinutes: 45,
      },
      status: "draft",
    };

    setPolicyType("flight");
    setSelectedCoverage("flight_delay");
    setFlightCode("AV8520");
    setFlightDelayThresholdMinutes("45");
    setFlightQuestionVariant("standard");
    setQuestion(item1.question);
    setEditingItemId(null);
    setBundleError(null);
    setSubmitError(null);
    setBundleItems([item1, item2]);
    setShowBundle(true);
  };

  // ── Render ──
  const v3InsuranceConfigError = getV3InsuranceConfigError();

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          Crear poliza {isV3 ? "(V3 insurance-first)" : "de viaje"}
        </h1>
        <p className="text-gray-400">
          Poliza parametrica verificable por Chainlink CRE + Gemini AI.{" "}
          <span className="text-sky-400">
            {isV3
              ? "createPolicy onchain con tiers (50%/100%)."
              : "Sin formularios. Sin intermediarios."}
          </span>
        </p>
        {v3Enabled && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-900/40 p-1">
            <button
              type="button"
              onClick={() => router.replace("/create?v=3")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                isV3
                  ? "bg-sky-600/30 text-sky-200 border border-sky-500/40"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Modo V3
            </button>
            <button
              type="button"
              onClick={() => router.replace("/create?v=1")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                !isV3
                  ? "bg-purple-600/30 text-purple-200 border border-purple-500/40"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Modo V1 (compat)
            </button>
          </div>
        )}
      </div>

      {!isConnected && !isTestMode ? (
        <Card className="text-center py-12">
          <div className="text-5xl mb-4">🔒</div>
          <p className="text-gray-400 mb-2">Conecta tu wallet para crear polizas</p>
          <p className="text-gray-500 text-sm">Usa el boton en la barra de navegacion.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Form (3 cols) */}
          <div className="lg:col-span-3 space-y-6">
            {/* Policy Type */}
            <Card>
              <h2 className="text-white font-semibold mb-3">Tipo de poliza</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPolicyType("flight")}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    policyType === "flight"
                      ? "border-sky-500 bg-sky-500/20 text-sky-200"
                      : "border-gray-700 bg-gray-900/40 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  ✈️ Vuelo
                </button>
                <button
                  type="button"
                  onClick={() => setPolicyType("property")}
                  disabled={isV3}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    policyType === "property"
                      ? "border-purple-500 bg-purple-500/20 text-purple-200"
                      : "border-gray-700 bg-gray-900/40 text-gray-400 hover:border-gray-500"
                  } ${isV3 ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  🏠 Inmueble
                </button>
              </div>

              {/* Demo loader (single flight — default) */}
              <button
                type="button"
                onClick={loadFlightDemo}
                disabled={bundleCreating}
                className="mt-3 w-full rounded-xl border border-sky-700/50 bg-sky-700/15 hover:bg-sky-700/25 disabled:opacity-50 text-sky-200 px-3 py-2 text-xs text-left transition"
              >
                Cargar demo vuelo AV8520 (retraso esperado)
              </button>
            </Card>

            {/* Coverage template */}
            <Card>
              <h3 className="text-white font-medium mb-3">Cobertura</h3>
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.coverageKind}
                    type="button"
                    onClick={() => setSelectedCoverage(template.coverageKind)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      selectedCoverage === template.coverageKind
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                        : "border-gray-700 bg-gray-900/40 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    <p className="text-sm font-medium">{template.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{template.description}</p>
                  </button>
                ))}
              </div>
            </Card>

            {/* Policy-specific config */}
            <Card>
              {policyType === "flight" ? (
                <>
                  <h3 className="text-white font-medium mb-3">✈️ Configuracion de vuelo</h3>
                  <p className="text-xs text-gray-400 mb-4">
                    Define vuelo, fecha y threshold. CRE usara el oracle de vuelos para liquidar.
                    {isV3 ? " En V3 se crea createPolicy (no createMarket)." : ""}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Codigo de vuelo</label>
                      <input
                        type="text"
                        value={flightCode}
                        onChange={(e) => setFlightCode(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-sky-500 focus:outline-none transition"
                        placeholder="AV8520"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Fecha del vuelo</label>
                      <input
                        type="date"
                        value={flightDate}
                        onChange={(e) => setFlightDate(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-sky-500 focus:outline-none transition"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-gray-400 mb-1">
                        Threshold de retraso (minutos)
                      </label>
                      <input
                        type="number"
                        value={flightDelayThresholdMinutes}
                        onChange={(e) => setFlightDelayThresholdMinutes(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-sky-500 focus:outline-none transition"
                        min="15"
                        max="240"
                        step="1"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-gray-400 mb-2">
                        Plantilla de pregunta (4 ejemplos)
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {flightQuestionExamples.map((example) => (
                          <button
                            key={example.id}
                            type="button"
                            onClick={() => {
                              setFlightQuestionVariant(example.id);
                              setQuestion(example.question);
                            }}
                            className={`rounded-xl border px-3 py-2 text-left transition ${
                              flightQuestionVariant === example.id
                                ? "border-sky-500 bg-sky-500/15 text-sky-200"
                                : "border-gray-700 bg-gray-900/40 text-gray-300 hover:border-gray-500"
                            }`}
                          >
                            <p className="text-xs font-semibold">{example.label}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{example.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuestion(buildSuggestedQuestion())}
                    className="mt-4 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
                  >
                    Usar plantilla seleccionada
                  </button>
                  <p className="mt-2 text-xs text-gray-500">
                    Plantilla activa:{" "}
                    <span className="text-sky-300">
                      {FLIGHT_QUESTION_VARIANTS.find((v) => v.id === flightQuestionVariant)?.label ??
                        "Estándar"}
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-white font-medium mb-3">🏠 Configuracion de inmueble</h3>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Property ID</label>
                    <input
                      type="text"
                      value={propertyId}
                      onChange={(e) => setPropertyId(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 focus:outline-none transition"
                      placeholder="110"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuestion(buildSuggestedQuestion())}
                    className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
                  >
                    Usar pregunta sugerida
                  </button>
                </>
              )}
            </Card>

            {/* Insurance fields — offchain, optional */}
            {policyType === "flight" && (
              <Card className="!bg-sky-950/20 border-sky-800/40">
                <h3 className="text-white font-medium mb-1 flex items-center gap-2">
                  <span>💡</span> Datos financieros
                  <span className="text-xs bg-sky-800/40 text-sky-300 px-2 py-0.5 rounded-full ml-1">
                    {isV3 ? "Usados onchain + offchain" : "Opcional · Solo offchain"}
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mb-4">
                  Usados para modelar prima del viajero y capital de cobertura del asegurador.
                  {isV3
                    ? "En V3, cobertura Tier 2 alimenta maxPayoutWei onchain."
                    : "No se registran onchain en V1."}
                </p>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Precio del ticket (USD)</label>
                      <input
                        type="number"
                        value={ticketPriceUsd}
                        onChange={(e) => setTicketPriceUsd(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-sky-500 focus:outline-none transition"
                        placeholder="125"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Capital cobertura Tier 2 (ETH)
                      </label>
                      <input
                        type="number"
                        value={coverageCapEth}
                        onChange={(e) => setCoverageCapEth(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-sky-500 focus:outline-none transition"
                        placeholder="0.01"
                        min="0"
                        step="0.0001"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Prima (% sobre cobertura)
                    </label>
                    <input
                      type="number"
                      value={premiumRatePct}
                      onChange={(e) => setPremiumRatePct(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-sky-500 focus:outline-none transition"
                      placeholder="15"
                      min="1"
                      max="100"
                      step="0.1"
                    />
                  </div>

                  {(payoutCapUsd || suggestedPremiumEth || tier1CoverageEth) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-1">Tier 1 payout</p>
                        <p className="text-white font-semibold">
                          {payoutCapUsd ? `USD ${payoutCapUsd}` : "—"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {tier1CoverageEth ? `${tier1CoverageEth} ETH` : "50% del ticket"}
                        </p>
                      </div>
                      <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-1">Prima viajero sugerida</p>
                        <p className="text-white font-semibold">
                          {premiumEstimateUsd ? `USD ${premiumEstimateUsd}` : "—"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {suggestedPremiumEth ? `${suggestedPremiumEth} ETH (${premiumRatePct}%)` : "Sin cobertura ETH definida"}
                        </p>
                      </div>
                    </div>
                  )}

                  {isV3 && (
                    <div className="rounded-xl border border-indigo-700/40 bg-indigo-950/20 p-3">
                      <p className="text-xs font-semibold text-indigo-200 mb-1">
                        Reglas onchain V3 (evita payout cap inesperado)
                      </p>
                      <p className="text-[11px] text-gray-300">
                        `maxPayoutWei` se define igual al campo <strong>Capital cobertura Tier 2 (ETH)</strong>.
                        Si este valor es bajo, el viajero no cobrará 50%/100% del ticket aunque haya breach.
                      </p>
                      <div className="mt-2 space-y-1 text-[11px] text-gray-300">
                        <p>
                          Ticket estimado:{" "}
                          <span className="text-white font-medium">
                            {ticketEthEstimate !== null ? `${ticketEthEstimate.toFixed(6)} ETH` : "—"}
                          </span>
                          {" "}({DEFAULT_ETH_PRICE_USD.toLocaleString()} USD/ETH)
                        </p>
                        <p>
                          Tier 1 objetivo (50% ticket):{" "}
                          <span className="text-white font-medium">
                            {tier1TicketEthEstimate !== null ? `${tier1TicketEthEstimate.toFixed(6)} ETH` : "—"}
                          </span>
                        </p>
                        <p>
                          Tier 2 objetivo (100% ticket):{" "}
                          <span className="text-white font-medium">
                            {ticketEthEstimate !== null ? `${ticketEthEstimate.toFixed(6)} ETH` : "—"}
                          </span>
                        </p>
                      </div>
                      {coverageAdequacy.hasCoverage && coverageAdequacy.isEnoughForTicket && (
                        <p className="mt-2 text-[11px] text-emerald-300">
                          Cobertura suficiente para cubrir 100% del ticket en Tier 2.
                        </p>
                      )}
                      {coverageAdequacy.hasCoverage && !coverageAdequacy.isEnoughForTicket && (
                        <p className="mt-2 text-[11px] text-amber-300">
                          Cobertura insuficiente: faltan{" "}
                          {coverageAdequacy.gapEth !== null ? coverageAdequacy.gapEth.toFixed(6) : "—"} ETH para cubrir
                          100% del ticket.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Question */}
            <Card>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Pregunta binaria (SI/NO)
              </label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={
                  policyType === "flight"
                    ? "Ej: Se activo el payout por retraso del vuelo AV8520 (>=45 min) el 13-02-2026?"
                    : "Ej: Se incumplio la calidad de vida en la propiedad ID 110?"
                }
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none transition"
                rows={3}
              />
              <p className="text-gray-500 text-sm mt-2">
                Condicion binaria verificable por CRE (oracle + IA).
              </p>
            </Card>

            {/* Onchain vs Offchain transparency block */}
            <Card className="!bg-gray-900/30">
              <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <span>📋</span> Lo que se registra hoy
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-3">
                  <p className="text-emerald-300 font-medium mb-2">Onchain (publico)</p>
                  <ul className="text-gray-300 space-y-1">
                    {isV3 ? (
                      <>
                        <li>• Config de policy (oracleRef, thresholds, payout tiers)</li>
                        <li>• Creador de la poliza</li>
                        <li>• Prima (pool SI) / Cobertura (pool NO)</li>
                        <li>• Resultado de liquidacion (tier + payoutBps)</li>
                      </>
                    ) : (
                      <>
                        <li>• Pregunta binaria</li>
                        <li>• Creador de la poliza</li>
                        <li>• Prima (pool SI) / Cobertura (pool NO)</li>
                        <li>• Resultado de liquidacion</li>
                      </>
                    )}
                  </ul>
                </div>
                <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-3">
                  <p className="text-gray-300 font-medium mb-2">Offchain (underwriting)</p>
                  <ul className="text-gray-400 space-y-1">
                    <li>• Precio del ticket (USD)</li>
                    <li>• Capital cobertura Tier 2 (ETH)</li>
                    <li>• Prima % sobre cobertura</li>
                    <li>• Wallet del draft (referencia local)</li>
                    <li>• PNR hash opcional (si no se captura: undefined)</li>
                    <li>• Prima sugerida (USD/ETH)</li>
                  </ul>
                </div>
              </div>
            </Card>

            {policyType === "flight" && isV3 && (
              <Card className="!bg-gray-900/30 border-indigo-700/30">
                <h3 className="text-white font-medium mb-3">🧭 Orden recomendado de wallets (demo)</h3>
                <div className="space-y-2 text-xs text-gray-300">
                  <p>
                    1. <span className="text-emerald-300 font-medium">Viajero</span>: compra póliza y aporta al pool <strong>SI</strong> (prima).
                  </p>
                  <p>
                    2. <span className="text-amber-300 font-medium">Asegurador</span>: aporta al pool <strong>NO</strong> (cobertura).
                  </p>
                  <p className="text-gray-400">
                    Si inviertes wallets (viajero en NO, asegurador en SI), los claims se verán “al revés” y parecerá un bug.
                  </p>
                </div>
              </Card>
            )}

            {/* Errors */}
            {(submitError || bundleError) && (
              <div className="bg-amber-900/20 border border-amber-700 rounded-xl p-4">
                <p className="text-amber-300 text-sm">{submitError || bundleError}</p>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              {/* Primary: create single policy */}
              {!showBundle && (
                <Button
                  variant="primary"
                  className="w-full py-4 text-base"
                  onClick={handleCreatePolicyNow}
                  disabled={bundleCreating || (!isV3 && !question.trim()) || !!v3InsuranceConfigError}
                  loading={bundleCreating}
                >
                  {bundleCreating ? "Creando poliza..." : "✈️ Crear poliza ahora"}
                </Button>
              )}

              {/* Advanced bundle mode toggle */}
              <button
                type="button"
                onClick={() => setShowBundle((v) => !v)}
                className="w-full text-xs text-gray-500 hover:text-gray-300 transition py-2 border border-dashed border-gray-700 rounded-xl"
              >
                {showBundle
                  ? "▲ Ocultar modo paquete"
                  : "▼ Avanzado: Modo paquete (multi-poliza)"}
              </button>

              {/* Bundle-specific actions (only when showBundle) */}
              {showBundle && (
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleAddToBundle}
                    disabled={bundleCreating}
                  >
                    {editingItemId ? "Guardar edicion" : "Agregar al paquete"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleCreatePolicyNow}
                    disabled={bundleCreating || bundleItems.length === 0 || !!v3InsuranceConfigError}
                    loading={bundleCreating}
                  >
                    {bundleCreating ? "Creando..." : "Crear paquete ahora"}
                  </Button>
                  <button
                    type="button"
                    onClick={loadFlightDemoBundle}
                    disabled={bundleCreating}
                    className="rounded-xl border border-sky-700/50 bg-sky-700/15 hover:bg-sky-700/25 disabled:opacity-50 text-sky-200 px-3 py-2 text-xs transition"
                  >
                    Demo AV8520 + LA4112
                  </button>
                </div>
              )}

              {!!v3InsuranceConfigError && (
                <p className="text-xs text-amber-300">
                  {v3InsuranceConfigError}
                </p>
              )}
            </div>
          </div>

          {/* Right panel (2 cols) */}
          <div className="lg:col-span-2">
            {showBundle ? (
              /* Bundle panel */
              <Card className="sticky top-20">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold">Paquete de polizas</h2>
                  <span className="text-xs bg-gray-700/40 text-gray-200 px-2 py-1 rounded-lg">
                    {packageSummary.total} item(s)
                  </span>
                </div>

                <p className="text-xs text-gray-400 mb-4">
                  Cada poliza crea 1 mercado onchain. Se ejecutan en secuencia.
                </p>

                {bundleItems.length === 0 ? (
                  <div className="border border-dashed border-gray-700 rounded-xl p-6 text-center text-sm text-gray-400">
                    Agrega polizas al paquete con el formulario.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bundleItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-gray-700 bg-black/20 p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={item.policyType === "flight" ? "flight" : "property"}>
                              {item.policyType === "flight" ? "✈️ Vuelo" : "🏠 Inmueble"}
                            </Badge>
                            <Badge variant={statusBadgeVariant(item.status)}>
                              {statusLabel(item.status)}
                            </Badge>
                          </div>
                          {(item.status === "draft" || item.status === "failed" || item.status === "skipped") && (
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditItem(item)}
                                className="text-xs text-blue-300 hover:text-blue-200"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.id)}
                                className="text-xs text-red-300 hover:text-red-200"
                              >
                                Eliminar
                              </button>
                            </div>
                          )}
                        </div>

                        <p className="text-xs text-gray-300 leading-relaxed">{item.question}</p>

                        {item.marketId && (
                          <p className="text-xs text-emerald-300">Market #{item.marketId}</p>
                        )}
                        {item.txHash && (
                          <div className="flex gap-2">
                            <a
                              href={`https://sepolia.etherscan.io/tx/${item.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
                            >
                              Etherscan ↗
                            </a>
                          </div>
                        )}
                        {item.error && (
                          <p className="text-xs text-red-300">{item.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Bundle summary */}
                <div className="grid grid-cols-3 gap-2 text-xs text-center mt-4">
                  <div className="bg-gray-900/50 rounded-xl p-2 border border-gray-700">
                    <p className="text-gray-400">Total</p>
                    <p className="text-white font-semibold">{packageSummary.total}</p>
                  </div>
                  <div className="bg-green-900/20 rounded-xl p-2 border border-green-700/40">
                    <p className="text-green-300">OK</p>
                    <p className="text-white font-semibold">{packageSummary.confirmed}</p>
                  </div>
                  <div className="bg-red-900/20 rounded-xl p-2 border border-red-700/40">
                    <p className="text-red-300">Error</p>
                    <p className="text-white font-semibold">{packageSummary.failed}</p>
                  </div>
                </div>
              </Card>
            ) : (
              /* Coverage model card (default view) */
              <div className="space-y-4 sticky top-20">
                <Card className="!bg-sky-950/20 border-sky-800/40">
                  <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                    <span>🛡️</span> Modelo de cobertura {isV3 ? "(V3)" : "(V1)"}
                  </h2>
                  <ol className="space-y-4 text-sm">
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold">
                        1
                      </span>
                      <div>
                        <p className="text-white font-medium">Crear poliza</p>
                        <p className="text-gray-400 text-xs mt-0.5">
                          {isV3
                            ? "Registras createPolicy con thresholds y tiers onchain"
                            : "Registras la pregunta binaria onchain (esto)"}
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center font-bold">
                        2
                      </span>
                      <div>
                        <p className="text-white font-medium">Comprar y fondear cobertura</p>
                        <p className="text-gray-400 text-xs mt-0.5">
                          Viajero paga la{" "}
                          <span className="text-green-400 font-medium">prima</span> en pool SI
                          <br />
                          Asegurador bloquea{" "}
                          <span className="text-red-400 font-medium">capital de cobertura</span> en pool NO
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">
                        3
                      </span>
                      <div>
                        <p className="text-white font-medium">Liquidacion automatica</p>
                        <p className="text-gray-400 text-xs mt-0.5">
                          CRE: oracle de vuelos + Gemini AI
                        </p>
                      </div>
                    </li>
                  </ol>
                  <div className="mt-5 pt-4 border-t border-sky-800/40">
                    <p className="text-xs text-amber-300/80 mb-3">
                      {isV3
                        ? "V3 ejecuta settlement insurance-first con tier + payoutBps onchain."
                        : "V1 mantiene settlement pool-based. Para demo insurance-first: prima del viajero (SI) + capital asegurador (NO) con payout por tiers."}
                    </p>
                    <Link
                      href="/simulator"
                      className="block text-center text-xs bg-sky-800/30 hover:bg-sky-800/50 text-sky-200 px-3 py-2 rounded-xl transition"
                    >
                      Ver simulador de reservas →
                    </Link>
                  </div>
                </Card>

                {/* Oracle info card */}
                <Card className="!bg-gray-900/30">
                  <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                    <span>🤖</span> Oracle + AI
                  </h3>
                  <ul className="text-gray-400 text-xs space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-purple-400 mt-0.5">•</span>
                      Oracle de vuelos (AviationStack / FlightAware)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-400 mt-0.5">•</span>
                      Gemini AI analiza evidencia y redacta veredicto
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-400 mt-0.5">•</span>
                      Resultado escrito onchain por CRE forwarder
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-400 mt-0.5">•</span>
                      Sin intervencion manual del creador
                    </li>
                  </ul>
                </Card>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
