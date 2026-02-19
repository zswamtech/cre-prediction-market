"use client";

import { useState, useMemo, useCallback } from "react";
import {
  simulateDual,
  DEFAULT_PROPERTY,
  DEFAULT_FLIGHT,
  DEFAULT_PARAMS,
  fmtMoney,
  fmtPct,
  type ProductConfig,
  type SimulationParams,
  type DualResult,
  type SimulationResult,
} from "@/lib/simulator";

/* ================================================================== */
/*  Slider                                                             */
/* ================================================================== */

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  color = "purple",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  color?: "purple" | "blue" | "amber";
}) {
  const accent =
    color === "blue"
      ? "accent-blue-500"
      : color === "amber"
        ? "accent-amber-500"
        : "accent-purple-500";

  const display =
    unit === "%"
      ? `${(value * 100).toFixed(1)}%`
      : unit === "$"
        ? `$${value}`
        : `${value}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer ${accent}`}
      />
    </div>
  );
}

/* ================================================================== */
/*  Stat pill                                                          */
/* ================================================================== */

function Stat({
  label,
  value,
  sub,
  accent = false,
  warn = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-4 py-3 border ${
        warn
          ? "border-red-500/30 bg-red-500/5"
          : accent
            ? "border-purple-500/30 bg-purple-500/5"
            : "border-gray-700/50 bg-gray-800/30"
      }`}
    >
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p
        className={`text-lg font-bold font-mono ${
          warn ? "text-red-400" : accent ? "text-purple-300" : "text-white"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ================================================================== */
/*  Mini bar chart (loss distribution)                                 */
/* ================================================================== */

function LossChart({
  histogram,
  reserveAt99,
  label,
}: {
  histogram: { bucket: number; count: number }[];
  reserveAt99: number;
  label: string;
}) {
  if (histogram.length === 0) return null;
  const maxCount = Math.max(...histogram.map((h) => h.count));

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">{label} — Distribución de pérdidas</p>
      <div className="flex items-end gap-[1px] h-24">
        {histogram.map((h, i) => {
          const pct = maxCount > 0 ? (h.count / maxCount) * 100 : 0;
          const isReserve = h.bucket >= reserveAt99;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t transition-all ${
                isReserve ? "bg-red-500/70" : "bg-purple-500/50"
              }`}
              style={{ height: `${Math.max(pct, 1)}%` }}
              title={`Pérdida: $${h.bucket.toFixed(0)} — ${h.count} trials`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-1">
        <span>$0</span>
        <span className="text-red-400">← Reserve @99%: ${reserveAt99.toFixed(0)}</span>
        <span>${histogram[histogram.length - 1]?.bucket.toFixed(0) ?? "0"}</span>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Product panel (one column per product line)                        */
/* ================================================================== */

function ProductPanel({
  config,
  result,
  color,
  icon,
  onChange,
  currency,
}: {
  config: ProductConfig;
  result: SimulationResult;
  color: "purple" | "blue";
  icon: string;
  onChange: (c: ProductConfig) => void;
  currency: string;
}) {
  const set = useCallback(
    <K extends keyof ProductConfig>(key: K, value: ProductConfig[K]) => {
      onChange({ ...config, [key]: value });
    },
    [config, onChange]
  );

  const borderColor = color === "blue" ? "border-blue-500/20" : "border-purple-500/20";
  const headerBg = color === "blue" ? "bg-blue-500/10" : "bg-purple-500/10";
  const headerText = color === "blue" ? "text-blue-300" : "text-purple-300";

  return (
    <div className={`rounded-2xl border ${borderColor} overflow-hidden`}>
      {/* Header */}
      <div className={`px-5 py-3 ${headerBg} flex items-center gap-2`}>
        <span className="text-xl">{icon}</span>
        <h3 className={`font-semibold ${headerText}`}>{config.label}</h3>
      </div>

      {/* Sliders */}
      <div className="p-5 space-y-4">
        <Slider
          label="Pólizas"
          value={config.count}
          min={50}
          max={5000}
          step={50}
          onChange={(v) => set("count", v)}
          color={color}
        />
        <Slider
          label="Prima del comprador"
          value={config.buyerPremium}
          min={1}
          max={100}
          step={1}
          unit="$"
          onChange={(v) => set("buyerPremium", v)}
          color={color}
        />
        <Slider
          label="Stake del host"
          value={config.hostStake}
          min={0}
          max={100}
          step={1}
          unit="$"
          onChange={(v) => set("hostStake", v)}
          color={color}
        />
        <Slider
          label="Payout si breach (SÍ)"
          value={config.payoutIfYes}
          min={10}
          max={200}
          step={5}
          unit="$"
          onChange={(v) => set("payoutIfYes", v)}
          color={color}
        />
        <Slider
          label="Reembolso si NO breach"
          value={config.hostRefundIfNo}
          min={0}
          max={100}
          step={1}
          unit="$"
          onChange={(v) => set("hostRefundIfNo", v)}
          color={color}
        />
        <Slider
          label="Probabilidad de breach"
          value={config.breachProbability}
          min={0.01}
          max={0.80}
          step={0.01}
          unit="%"
          onChange={(v) => set("breachProbability", v)}
          color={color}
        />
      </div>

      {/* Results */}
      <div className="px-5 pb-5 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Net esperado / póliza"
            value={fmtMoney(result.expectedNetPerPolicy, currency)}
            accent={result.expectedNetPerPolicy > 0}
            warn={result.expectedNetPerPolicy < 0}
          />
          <Stat
            label="Net esperado total"
            value={fmtMoney(result.expectedNetPortfolio, currency)}
            accent={result.expectedNetPortfolio > 0}
            warn={result.expectedNetPortfolio < 0}
          />
          <Stat
            label="Break-even breach p*"
            value={
              Number.isFinite(result.breakEvenBreachProb)
                ? fmtPct(result.breakEvenBreachProb)
                : "N/A"
            }
            sub="Punto de equilibrio"
          />
          <Stat
            label="Prob. de déficit"
            value={fmtPct(result.deficitProbability)}
            warn={result.deficitProbability > 0.05}
          />
          <Stat label="Reserva @95%" value={fmtMoney(result.reserveAt95, currency)} />
          <Stat
            label="Reserva @99%"
            value={fmtMoney(result.reserveAt99, currency)}
            accent
          />
          <Stat
            label="Peor caso"
            value={fmtMoney(result.worstCaseReserve, currency)}
            warn={result.worstCaseReserve > 0}
          />
          <Stat
            label="Pólizas"
            value={result.nPolicies.toLocaleString("en-US")}
          />
        </div>

        <LossChart
          histogram={result.histogram}
          reserveAt99={result.reserveAt99}
          label={config.label}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main page                                                          */
/* ================================================================== */

export default function SimulatorPage() {
  const [property, setProperty] = useState<ProductConfig>(DEFAULT_PROPERTY);
  const [flight, setFlight] = useState<ProductConfig>(DEFAULT_FLIGHT);
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [currency] = useState("USD");
  const [targetNet, setTargetNet] = useState(5);
  const [running, setRunning] = useState(false);

  // Run simulation (deferred to avoid blocking UI on heavy trials)
  const result: DualResult | null = useMemo(() => {
    setRunning(true);
    try {
      const r = simulateDual(property, flight, params, targetNet);
      return r;
    } finally {
      setRunning(false);
    }
  }, [property, flight, params, targetNet]);

  const reset = useCallback(() => {
    setProperty(DEFAULT_PROPERTY);
    setFlight(DEFAULT_FLIGHT);
    setParams(DEFAULT_PARAMS);
    setTargetNet(5);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 pt-20 pb-16">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-10 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 mb-4">
            <span>📊</span>
            <span className="text-sm text-purple-300">Simulador de Portafolio</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Viabilidad Financiera
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Simulación Monte Carlo del portafolio de pólizas paramétricas.
            Ajusta los parámetros para explorar escenarios de riesgo, reserva y rentabilidad.
          </p>
        </div>

        {/* Global controls */}
        <div className="glass rounded-2xl border border-gray-700/50 p-5 mb-8 animate-fade-in-up-delay-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Slider
              label="Trials Monte Carlo"
              value={params.trials}
              min={1000}
              max={50000}
              step={1000}
              onChange={(v) => setParams({ ...params, trials: v })}
              color="amber"
            />
            <Slider
              label="Confianza reserva"
              value={params.confidence}
              min={0.9}
              max={0.999}
              step={0.001}
              unit="%"
              onChange={(v) => setParams({ ...params, confidence: v })}
              color="amber"
            />
            <Slider
              label="Target net / póliza"
              value={targetNet}
              min={0}
              max={20}
              step={1}
              unit="$"
              onChange={setTargetNet}
              color="amber"
            />
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={reset}
              className="text-xs text-gray-500 hover:text-gray-300 transition px-3 py-1 rounded border border-gray-700/50 hover:border-gray-600"
            >
              Restaurar valores por defecto
            </button>
          </div>
        </div>

        {/* Two product panels side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 animate-fade-in-up-delay-2">
          {result && (
            <>
              <ProductPanel
                config={property}
                result={result.property}
                color="purple"
                icon="🏠"
                onChange={setProperty}
                currency={currency}
              />
              <ProductPanel
                config={flight}
                result={result.flight}
                color="blue"
                icon="✈️"
                onChange={setFlight}
                currency={currency}
              />
            </>
          )}
        </div>

        {/* Combined view */}
        {result && (
          <div className="glass rounded-2xl border border-gray-700/50 p-6 animate-fade-in-up-delay-3">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>🔗</span> Visión Combinada del Portafolio
              {running && (
                <span className="text-xs text-gray-500 animate-pulse-subtle">
                  calculando…
                </span>
              )}
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Stat
                label="Net esperado total"
                value={fmtMoney(result.combined.totalExpectedNet, currency)}
                accent={result.combined.totalExpectedNet > 0}
                warn={result.combined.totalExpectedNet < 0}
              />
              <Stat
                label="Reserva @99%"
                value={fmtMoney(result.combined.totalReserveAt99, currency)}
                accent
              />
              <Stat
                label={`Reserva @${(params.confidence * 100).toFixed(1)}%`}
                value={fmtMoney(result.combined.totalReserveAtConfidence, currency)}
              />
              <Stat
                label="Peor caso"
                value={fmtMoney(result.combined.totalWorstCaseReserve, currency)}
                warn={result.combined.totalWorstCaseReserve > 0}
              />
            </div>

            {/* Premium pricing guidance */}
            <div className="border-t border-gray-700/50 pt-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                💡 Prima necesaria para obtener{" "}
                <span className="text-purple-300 font-mono">{fmtMoney(targetNet, currency)}</span>{" "}
                de ganancia neta por póliza:
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 bg-purple-500/5 border border-purple-500/20 rounded-xl px-4 py-3">
                  <span className="text-xl">🏠</span>
                  <div>
                    <p className="text-xs text-gray-400">Inmueble — Prima recomendada</p>
                    <p className="text-lg font-bold font-mono text-purple-300">
                      {fmtMoney(result.premiumForTargetProperty, currency)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
                  <span className="text-xl">✈️</span>
                  <div>
                    <p className="text-xs text-gray-400">Vuelo — Prima recomendada</p>
                    <p className="text-lg font-bold font-mono text-blue-300">
                      {fmtMoney(result.premiumForTargetFlight, currency)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Explanation */}
            <div className="border-t border-gray-700/50 pt-4 mt-4">
              <details className="group">
                <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-200 transition">
                  ℹ️ ¿Cómo funciona esta simulación?
                </summary>
                <div className="mt-3 text-xs text-gray-500 space-y-2 pl-5">
                  <p>
                    <strong className="text-gray-400">Modelo tripartito:</strong> Cada póliza
                    recibe inflow (prima del comprador + stake del host). Si hay breach (SÍ),
                    se paga el payout al comprador. Si no hay breach (NO), se reembolsa al host.
                  </p>
                  <p>
                    <strong className="text-gray-400">Monte Carlo:</strong> Se ejecutan miles de
                    simulaciones aleatorias del portafolio completo. En cada trial, cada póliza se
                    resuelve aleatoriamente según la probabilidad de breach. Se registra la pérdida
                    neta del protocolo.
                  </p>
                  <p>
                    <strong className="text-gray-400">Reserva @99%:</strong> El percentil 99 de las
                    pérdidas simuladas. Significa que en el 99% de los escenarios, la pérdida no
                    excederá este monto — es la reserva práctica recomendada.
                  </p>
                  <p>
                    <strong className="text-gray-400">Break-even p*:</strong> La probabilidad de
                    breach a la cual el protocolo no gana ni pierde. Si la probabilidad real está
                    por debajo, el portafolio es rentable.
                  </p>
                  <p>
                    <strong className="text-gray-400">Barras rojas:</strong> En el histograma, las
                    barras rojas representan los escenarios que superan la reserva @99%.
                  </p>
                </div>
              </details>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
