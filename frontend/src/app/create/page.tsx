"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import Link from "next/link";
import { decodeEventLog, parseAbiItem } from "viem";
import { PREDICTION_MARKET_ADDRESS, PREDICTION_MARKET_ABI } from "@/lib/contract";
import { useReliableWrite } from "@/hooks/useReliableWrite";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getCoverageTemplates } from "@/lib/policyTemplates";
import {
  buildFlightQuestion,
  buildPropertyQuestion,
  normalizeDelayThreshold,
  normalizeFlightCode,
  normalizePropertyId,
  toCoverageLabel,
  validateDelayThreshold,
  validateFlightCode,
  validatePropertyId,
  type CoverageKind,
  type DraftPolicyItem,
  type DraftPolicyParams,
  type FlightCoverageKind,
  type PolicyType,
  type PropertyCoverageKind,
} from "@/lib/questionBuilders";

const MARKET_CREATED_EVENT_ABI = [
  parseAbiItem("event MarketCreated(uint256 indexed marketId, string question, address creator)"),
] as const;

function createDraftId(): string {
  return `draft_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toMarketCreatedId(receipt: {
  logs: Array<{ data: `0x${string}`; topics: `0x${string}`[] }>;
}): string | undefined {
  for (const log of receipt.logs) {
    if (log.topics.length === 0) continue;
    try {
      const decoded = decodeEventLog({
        abi: MARKET_CREATED_EVENT_ABI,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === "MarketCreated" && decoded.args.marketId !== undefined) {
        return decoded.args.marketId.toString();
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
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContract: reliableWrite } = useReliableWrite();

  const [policyType, setPolicyType] = useState<PolicyType>("flight");
  const [selectedCoverage, setSelectedCoverage] = useState<CoverageKind>("flight_delay");
  const [question, setQuestion] = useState("");

  // Flight fields
  const [flightCode, setFlightCode] = useState("AV8520");
  const [flightDate, setFlightDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [flightDelayThresholdMinutes, setFlightDelayThresholdMinutes] = useState("45");

  // Property fields
  const [propertyId, setPropertyId] = useState("110");

  // Bundle
  const [bundleItems, setBundleItems] = useState<DraftPolicyItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [bundleCreating, setBundleCreating] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const templates = useMemo(() => getCoverageTemplates(policyType), [policyType]);

  useEffect(() => {
    const validKinds = new Set(templates.map((t) => t.coverageKind));
    if (!validKinds.has(selectedCoverage)) {
      setSelectedCoverage(templates[0]?.coverageKind ?? "flight_delay");
    }
  }, [policyType, selectedCoverage, templates]);

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
      return buildFlightQuestion(flightCode, flightDate, threshold);
    }
    return buildPropertyQuestion(
      selectedCoverage as PropertyCoverageKind,
      normalizePropertyId(propertyId)
    );
  };

  const validateCurrentDraft = (): string | null => {
    if (policyType === "property") {
      if (!validatePropertyId(propertyId)) return "Property ID invalido.";
    }
    if (policyType === "flight") {
      if (!validateFlightCode(flightCode)) return "Flight Code invalido (ej: AV8520).";
      if (!flightDate.trim()) return "Fecha de viaje obligatoria.";
      const threshold = normalizeDelayThreshold(Number(flightDelayThresholdMinutes));
      if (!validateDelayThreshold(threshold)) return "Threshold entre 15 y 240 minutos.";
    }
    if (!question.trim()) return "La pregunta es obligatoria.";
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
      question: question.trim(),
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
        // Use our reliable write which bypasses MetaMask RPC for gas estimation
        let txHash: `0x${string}` | undefined;

        // We need to use writeContractAsync pattern here for sequential execution
        // Since useReliableWrite uses sendTransaction, we'll do manual encoding
        const { encodeFunctionData } = await import("viem");
        const data = encodeFunctionData({
          abi: PREDICTION_MARKET_ABI,
          functionName: "createMarket",
          args: [item.question],
        });

        // Estimate gas using our reliable RPCs
        let gas = 300_000n;
        try {
          if (publicClient) {
            const estimated = await publicClient.estimateGas({
              to: PREDICTION_MARKET_ADDRESS,
              data,
              account: address,
            });
            gas = (estimated * 120n) / 100n;
          }
        } catch {
          // use default
        }

        // Send via wallet
        const { sendTransaction } = await import("wagmi/actions");
        const { config } = await import("@/lib/wagmi");

        txHash = await sendTransaction(config, {
          to: PREDICTION_MARKET_ADDRESS,
          data,
          gas,
        });

        updateBundleItem(item.id, { status: "broadcasted", txHash });

        // Wait for confirmation
        if (txHash && publicClient) {
          let confirmed = false;
          const startedAt = Date.now();
          const timeout = 90_000;

          while (Date.now() - startedAt <= timeout) {
            try {
              const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
              if (receipt) {
                const marketId = toMarketCreatedId(receipt as any);
                updateBundleItem(item.id, {
                  status: "confirmed",
                  txHash,
                  marketId,
                  error: undefined,
                });
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
            // Skip remaining
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
        const message = executionError instanceof Error
          ? executionError.message.split("\n")[0]
          : "Error al crear la poliza.";

        const isUserReject = /user rejected|rejected the request|user denied/i.test(message);

        updateBundleItem(item.id, {
          status: "failed",
          error: isUserReject ? "Firma rechazada por el usuario." : message,
        });

        // Skip remaining
        for (let j = index + 1; j < items.length; j++) {
          updateBundleItem(items[j].id, {
            status: "skipped",
            error: "Ejecucion detenida por error en una poliza previa.",
          });
        }
        break;
      }
    }

    setBundleCreating(false);
  };

  const handleCreateBundleNow = async () => {
    if (bundleCreating) return;
    setSubmitError(null);
    setBundleError(null);

    let executionItems = bundleItems;

    if (executionItems.length === 0) {
      const singleItem = buildCurrentDraftItem();
      if (!singleItem) {
        setBundleError("Agrega una poliza al paquete o completa una pregunta valida.");
        return;
      }
      executionItems = [singleItem];
      setBundleItems([singleItem]);
    }

    await createBundleSequentially(executionItems);
  };

  // ── Demo loaders ──
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
    setQuestion(item1.question);
    setEditingItemId(null);
    setBundleError(null);
    setSubmitError(null);
    setBundleItems([item1, item2]);
  };

  // ── Render ──
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Crear poliza</h1>
        <p className="text-gray-400">
          Configura una poliza parametrica verificable por Chainlink CRE + Gemini AI.
        </p>
      </div>

      {!isConnected ? (
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
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    policyType === "property"
                      ? "border-purple-500 bg-purple-500/20 text-purple-200"
                      : "border-gray-700 bg-gray-900/40 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  🏠 Inmueble
                </button>
              </div>

              {/* Demo loader */}
              <button
                type="button"
                onClick={loadFlightDemoBundle}
                disabled={bundleCreating}
                className="mt-3 w-full rounded-xl border border-sky-700/50 bg-sky-700/15 hover:bg-sky-700/25 disabled:bg-gray-700/40 text-sky-200 px-3 py-2 text-xs text-left transition"
              >
                Cargar demo vuelo (AV8520 + LA4112)
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
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuestion(buildSuggestedQuestion())}
                    className="mt-4 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
                  >
                    Usar pregunta sugerida
                  </button>
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
                Condicion binaria verificable por CRE (oracle + clima + IA).
              </p>
            </Card>

            {/* Errors */}
            {submitError && (
              <div className="bg-amber-900/20 border border-amber-700 rounded-xl p-4">
                <p className="text-amber-300 text-sm">{submitError}</p>
              </div>
            )}

            {/* Actions */}
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
                onClick={handleCreateBundleNow}
                disabled={bundleCreating || (bundleItems.length === 0 && !question.trim())}
                loading={bundleCreating}
              >
                {bundleCreating ? "Creando..." : "Crear paquete ahora"}
              </Button>
            </div>

            {/* How it works */}
            <Card className="!bg-gray-900/30">
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
                  Cualquiera solicita liquidacion cuando este listo
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">3.</span>
                  CRE orquesta:{" "}
                  {policyType === "flight" ? "Oracle de vuelos + Gemini" : "Oracle IoT + Open-Meteo + Gemini"}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">4.</span>
                  El workflow escribe el reporte onchain y habilita reclamos
                </li>
              </ul>
            </Card>
          </div>

          {/* Right: Bundle panel (2 cols) */}
          <div className="lg:col-span-2">
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

              {bundleError && (
                <div className="bg-red-900/20 border border-red-700 rounded-xl p-3 mb-4">
                  <p className="text-red-300 text-sm">{bundleError}</p>
                </div>
              )}

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
                              onClick={() => handleEditItem(item)}
                              className="text-xs text-blue-300 hover:text-blue-200"
                            >
                              Editar
                            </button>
                            <button
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

              {/* Summary */}
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
          </div>
        </div>
      )}
    </div>
  );
}
