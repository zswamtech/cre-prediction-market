"use client";

import { useEffect, useMemo, useState } from "react";
import { parseEther } from "viem";
import { ConnectKitButton } from "connectkit";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

function toFixedTrim(value: number, decimals = 6): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

export function PredictForm({
  isConnected,
  isTest,
  isFlightPolicy,
  isV3,
  suggestedCoverageEth,
  suggestedPremiumPct,
  totalYesPool,
  totalNoPool,
  onPredict,
  onRequestSettlement,
  isProcessing,
  isConfirming,
  isSuccess,
  writeError,
  txHash,
}: {
  isConnected: boolean;
  isTest: boolean;
  isFlightPolicy?: boolean;
  isV3?: boolean;
  suggestedCoverageEth?: string | null;
  suggestedPremiumPct?: string | null;
  totalYesPool?: bigint;
  totalNoPool?: bigint;
  onPredict: (outcome: 0 | 1, value: bigint) => void;
  onRequestSettlement: () => void;
  isProcessing: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  writeError: Error | null;
  txHash: string | null;
}) {
  const [amount, setAmount] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState<0 | 1 | null>(null);
  const [roleHint, setRoleHint] = useState<"buyer" | "insurer" | null>(null);
  const [coverageCapEth, setCoverageCapEth] = useState(
    suggestedCoverageEth && Number(suggestedCoverageEth) > 0 ? suggestedCoverageEth : "0.01"
  );
  const [premiumRatePct, setPremiumRatePct] = useState(
    suggestedPremiumPct && Number(suggestedPremiumPct) > 0 ? suggestedPremiumPct : "15"
  );

  useEffect(() => {
    if (suggestedCoverageEth && Number(suggestedCoverageEth) > 0) {
      setCoverageCapEth(suggestedCoverageEth);
    }
  }, [suggestedCoverageEth]);

  useEffect(() => {
    if (suggestedPremiumPct && Number(suggestedPremiumPct) > 0) {
      setPremiumRatePct(suggestedPremiumPct);
    }
  }, [suggestedPremiumPct]);

  const coverageEthValue = useMemo(() => {
    const value = Number(coverageCapEth);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [coverageCapEth]);

  const premiumPctValue = useMemo(() => {
    const value = Number(premiumRatePct);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [premiumRatePct]);

  const tier1PayoutEth = useMemo(() => coverageEthValue * 0.5, [coverageEthValue]);
  const suggestedPremiumEth = useMemo(
    () => coverageEthValue * (premiumPctValue / 100),
    [coverageEthValue, premiumPctValue]
  );
  const hasTravelerFunding = (totalYesPool ?? 0n) > 0n;
  const hasInsurerFunding = (totalNoPool ?? 0n) > 0n;
  const isFundingReadyForSettlement = !isFlightPolicy || (hasTravelerFunding && hasInsurerFunding);
  const nextActionHint = useMemo(() => {
    if (!isFlightPolicy) return "Aporta al pool y luego solicita liquidación.";
    if (!hasTravelerFunding) return "Siguiente acción: fondear prima del viajero (pool SI).";
    if (!hasInsurerFunding) return "Siguiente acción: fondear cobertura del asegurador (pool NO).";
    return "Siguiente acción: solicitar liquidación automática (CRE + oracle + IA).";
  }, [hasInsurerFunding, hasTravelerFunding, isFlightPolicy]);

  const handlePredict = () => {
    if (!amount || selectedOutcome === null) return;
    onPredict(selectedOutcome, parseEther(amount));
    if (isSuccess) {
      setAmount("");
      setSelectedOutcome(null);
    }
  };

  const handleSelectRole = (role: "buyer" | "insurer") => {
    setRoleHint(role);
    if (role === "buyer") {
      setSelectedOutcome(0);
      if (suggestedPremiumEth > 0) setAmount(toFixedTrim(suggestedPremiumEth));
      return;
    }
    setSelectedOutcome(1);
    if (coverageEthValue > 0) setAmount(toFixedTrim(coverageEthValue));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-700 text-white flex items-center justify-center font-bold text-[10px]">
          2
        </span>
        <span>Comprar póliza y fondear cobertura</span>
      </div>

      <Card className="h-fit">
        {isFlightPolicy && (
          <div className="mb-5 pb-5 border-b border-gray-700">
            <p className="text-xs text-gray-400 mb-2">Estado de fondeo de la póliza</p>
            <div className="grid grid-cols-2 gap-3 text-[11px] mb-2">
              <div
                className={`rounded-lg border px-2.5 py-2 ${
                  hasTravelerFunding
                    ? "border-green-500/40 bg-green-500/10 text-green-200"
                    : "border-gray-700 bg-gray-900/40 text-gray-400"
                }`}
              >
                Prima viajero (SI): {hasTravelerFunding ? "lista" : "pendiente"}
              </div>
              <div
                className={`rounded-lg border px-2.5 py-2 ${
                  hasInsurerFunding
                    ? "border-red-500/40 bg-red-500/10 text-red-200"
                    : "border-gray-700 bg-gray-900/40 text-gray-400"
                }`}
              >
                Cobertura asegurador (NO): {hasInsurerFunding ? "lista" : "pendiente"}
              </div>
            </div>
            <p className="text-xs text-gray-500">{nextActionHint}</p>
          </div>
        )}

        {isFlightPolicy && (
          <div className="mb-5 pb-5 border-b border-gray-700 space-y-4">
            <p className="text-xs text-gray-400">
              Selecciona tu rol en esta póliza (modelo insurance-first):
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSelectRole("buyer")}
                className={`rounded-xl border px-3 py-2.5 text-left transition text-xs ${
                  roleHint === "buyer"
                    ? "border-green-500 bg-green-500/15 text-green-200"
                    : "border-gray-700 bg-gray-900/40 text-gray-400 hover:border-green-500/50"
                }`}
              >
                <p className="font-medium mb-0.5">Soy el viajero</p>
                <p className="text-[11px] opacity-75">
                  Pago prima única y cobro si hay retraso/cancelación
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleSelectRole("insurer")}
                className={`rounded-xl border px-3 py-2.5 text-left transition text-xs ${
                  roleHint === "insurer"
                    ? "border-red-500 bg-red-500/15 text-red-200"
                    : "border-gray-700 bg-gray-900/40 text-gray-400 hover:border-red-500/50"
                }`}
              >
                <p className="font-medium mb-0.5">Soy el asegurador</p>
                <p className="text-[11px] opacity-75">
                  Bloqueo cobertura y cobro si no hay siniestro
                </p>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">
                  Cobertura Tier 2 (ETH)
                </label>
                <input
                  type="number"
                  value={coverageCapEth}
                  onChange={(e) => setCoverageCapEth(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-purple-500 transition"
                  min="0"
                  step="0.0001"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">
                  Prima (%)
                </label>
                <input
                  type="number"
                  value={premiumRatePct}
                  onChange={(e) => setPremiumRatePct(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-purple-500 transition"
                  min="1"
                  max="100"
                  step="0.1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div className="rounded-lg border border-gray-700 bg-black/30 p-2.5">
                <p className="text-gray-500">Prima sugerida (viajero)</p>
                <p className="text-white font-semibold">
                  {suggestedPremiumEth > 0 ? `${toFixedTrim(suggestedPremiumEth)} ETH` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-gray-700 bg-black/30 p-2.5">
                <p className="text-gray-500">Payout Tier 1 (50%)</p>
                <p className="text-white font-semibold">
                  {tier1PayoutEth > 0 ? `${toFixedTrim(tier1PayoutEth)} ETH` : "—"}
                </p>
              </div>
            </div>
          </div>
        )}

        <h2 className="text-lg font-semibold text-white mb-2">Aportar al pool</h2>
        <p className="text-xs text-gray-500 mb-6">
          {isFlightPolicy
            ? isV3
              ? "Modelo V3 onchain: viajero aporta prima (SI) y asegurador aporta cobertura (NO)."
              : "Mapeo V1 (onchain): prima viajero en SI y capital asegurador en NO."
            : "Aporta liquidez al pool SI/NO del mercado."}
        </p>

        {!isConnected && !isTest ? (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-4">Conecta tu wallet para aportar</p>
            <ConnectKitButton />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSelectedOutcome(0)}
                className={`p-4 rounded-xl border-2 transition text-sm font-bold ${
                  selectedOutcome === 0
                    ? "border-green-500 bg-green-500/20 text-green-400"
                    : "border-gray-700 hover:border-green-500/50 text-gray-400"
                }`}
              >
                {isFlightPolicy ? "SI (prima viajero)" : "SI (payout)"}
              </button>
              <button
                type="button"
                onClick={() => setSelectedOutcome(1)}
                className={`p-4 rounded-xl border-2 transition text-sm font-bold ${
                  selectedOutcome === 1
                    ? "border-red-500 bg-red-500/20 text-red-400"
                    : "border-gray-700 hover:border-red-500/50 text-gray-400"
                }`}
              >
                {isFlightPolicy ? "NO (cobertura asegurador)" : "NO (sin reclamo)"}
              </button>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Cantidad (ETH)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.01"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition"
                min="0"
                step="0.0001"
              />
            </div>

            {writeError && (
              <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg">
                {writeError.message.split("\n")[0]}
              </div>
            )}

            {isSuccess && !isConfirming && (
              <div className="text-green-400 text-sm bg-green-900/20 p-3 rounded-lg">
                Transaccion confirmada!
              </div>
            )}

            <Button
              variant="primary"
              className="w-full py-4"
              onClick={handlePredict}
              disabled={!amount || selectedOutcome === null || isProcessing || isConfirming}
              loading={isProcessing || isConfirming}
            >
              Confirmar aporte
            </Button>

            <div className="pt-6 border-t border-gray-700 mt-6">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-[10px]">
                  3
                </span>
                <span className="font-medium text-gray-300">Liquidacion</span>
              </div>
              <Button
                variant="secondary"
                className="w-full"
                onClick={onRequestSettlement}
                disabled={isProcessing || isConfirming || !isFundingReadyForSettlement}
                data-testid="ai-settlement-button"
              >
                <span className="flex items-center justify-center gap-2">
                  <span>🤖</span> Solicitar liquidacion de IA
                </span>
              </Button>
              {txHash && (
                <div className="mt-2 text-xs bg-black/40 p-2 rounded border border-blue-500/30 text-blue-200 break-all">
                  <p className="font-bold text-blue-400 mb-1">TX Hash:</p>
                  {txHash}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2 text-center">
                Activa el workflow CRE + Gemini para resolver la poliza.
              </p>
              {!isFundingReadyForSettlement && (
                <p className="text-xs text-amber-300 mt-1 text-center">
                  Faltan fondos en SI/NO para liquidar esta póliza de vuelo.
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="bg-gray-900/40 border border-gray-700/50 rounded-xl p-4">
        <h4 className="text-xs font-medium text-gray-300 mb-2 flex items-center gap-1.5">
          <span>ℹ️</span> Modelo de financiacion
        </h4>
        <p className="text-xs text-gray-400 leading-relaxed">
          {isV3
            ? "V3 insurance-first: settlement onchain por tier + payoutBps. SI=prima viajero, NO=cobertura asegurador."
            : "V1 mantiene settlement pool-based. Para demo insurance-first usamos este mapeo: viajero compra póliza (prima en SI) y asegurador bloquea cobertura (NO)."}
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Para modelar reservas y pricing por rutas con datos oficiales →{" "}
          <Link href="/simulator" className="text-sky-400 hover:text-sky-300 underline">
            Simulador de cartera
          </Link>
        </p>
      </div>
    </div>
  );
}
