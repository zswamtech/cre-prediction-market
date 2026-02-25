"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

type StrategyStatus = "GO" | "WATCH" | "NO_GO";

interface LineStrategy {
  status: StrategyStatus;
  expectedOutflowPerPolicy: number;
  lossRatio: number;
  pricingGap: number;
}

interface ScenarioPreset {
  id: "conservative" | "base" | "growth";
  label: string;
  description: string;
  property: Partial<ProductConfig>;
  flight: Partial<ProductConfig>;
  targetNet: number;
}

const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "conservative",
    label: "Conservador",
    description: "Mayor prima y supuestos de breach más altos",
    property: { buyerPremium: 24, breachProbability: 0.3, payoutIfYes: 50, autoLockPerPolicy: 10 },
    flight: { buyerPremium: 30, breachProbability: 0.3, payoutIfYes: 100, autoLockPerPolicy: 100 },
    targetNet: 6,
  },
  {
    id: "base",
    label: "Base",
    description: "Parámetros equilibrados para demo/pitch",
    property: { ...DEFAULT_PROPERTY },
    flight: { ...DEFAULT_FLIGHT },
    targetNet: 5,
  },
  {
    id: "growth",
    label: "Crecimiento",
    description: "Mayor adopción con prima más agresiva",
    property: { buyerPremium: 18, breachProbability: 0.22, payoutIfYes: 50, autoLockPerPolicy: 5 },
    flight: { buyerPremium: 19, breachProbability: 0.17, payoutIfYes: 100, autoLockPerPolicy: 80 },
    targetNet: 4,
  },
];

function evaluateLineStrategy(
  config: ProductConfig,
  result: SimulationResult,
  recommendedPremium: number
): LineStrategy {
  const expectedOutflowPerPolicy =
    config.breachProbability * config.payoutIfYes +
    (1 - config.breachProbability) * config.hostRefundIfNo +
    config.operationalCost;

  const lossRatio =
    config.buyerPremium > 0 ? expectedOutflowPerPolicy / config.buyerPremium : Infinity;
  const pricingGap = config.buyerPremium - recommendedPremium;

  let status: StrategyStatus = "NO_GO";
  if (pricingGap >= 0 && result.deficitProbability <= 0.02) {
    status = "GO";
  } else if (pricingGap >= -2 && result.deficitProbability <= 0.05) {
    status = "WATCH";
  }

  return {
    status,
    expectedOutflowPerPolicy,
    lossRatio,
    pricingGap,
  };
}

function statusUi(status: StrategyStatus): {
  label: string;
  className: string;
} {
  if (status === "GO") {
    return {
      label: "GO",
      className: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    };
  }
  if (status === "WATCH") {
    return {
      label: "WATCH",
      className: "bg-amber-500/15 border-amber-500/40 text-amber-300",
    };
  }
  return {
    label: "NO-GO",
    className: "bg-red-500/15 border-red-500/40 text-red-300",
  };
}

type FlightRiskRow = {
  route: string;
  samples: number;
  insufficientSample: boolean;
  pAnyHat: number;
  pAnyCi95Upper: number;
  pTier1: number;
  pTier2: number;
  breakEvenPremium: number;
  recommendedPremium: number;
  ticketPrice: number;
  sampleFlightIds: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildSlideReadyContent(params: {
  lang: "es" | "en";
  preset: ScenarioPreset["id"];
  reserveCapital: number;
  result: DualResult;
  strategic: {
    portfolioStatus: StrategyStatus;
    propertyLine: LineStrategy;
    flightLine: LineStrategy;
    reserveCoverage99: number;
    capitalGap99: number;
  };
  observedRoute?: FlightRiskRow | null;
  observedMode?: "hat" | "upper95";
}): string {
  const {
    lang,
    preset,
    reserveCapital,
    result,
    strategic,
    observedRoute,
    observedMode = "hat",
  } = params;
  const now = new Date().toISOString();

  if (lang === "en") {
    return `# FairLease — Slide-ready Executive Summary

Generated: ${now}
Scenario preset: ${preset}

## Portfolio decision
- Combined status: **${statusUi(strategic.portfolioStatus).label}**
- Reserve capital available: ${fmtMoney(reserveCapital)}
- Reserve coverage @99%: ${pct(strategic.reserveCoverage99)}
- Capital gap vs reserve@99: ${fmtMoney(strategic.capitalGap99)}

## Unit economics
- Property expected net / policy: ${fmtMoney(result.property.expectedNetPerPolicy)}
- Flight expected net / policy: ${fmtMoney(result.flight.expectedNetPerPolicy)}
- Combined expected net: ${fmtMoney(result.combined.totalExpectedNet)}
- Recommended premium (Property): ${fmtMoney(result.premiumForTargetProperty)}
- Recommended premium (Flight): ${fmtMoney(result.premiumForTargetFlight)}

## Solvency logic
- Flight auto-lock capital / policy: ${fmtMoney(result.flight.autoLockPerPolicy)}
- Flight total auto-lock capital: ${fmtMoney(result.flight.autoLockTotal)}
- Flight reserve@99 without auto-lock: ${fmtMoney(result.flight.reserveAt99NoLock)}
- Flight reserve@99 after auto-lock: ${fmtMoney(result.flight.reserveAt99)}

## Market data anchor
${observedRoute ? `- Route: **${observedRoute.route}** (n=${observedRoute.samples})
- Observed breach p (${observedMode === "hat" ? "point estimate" : "upper95"}): ${pct(
      observedMode === "hat" ? observedRoute.pAnyHat : observedRoute.pAnyCi95Upper
    )}
- Observed recommended premium: ${fmtMoney(observedRoute.recommendedPremium)}
- Data quality flag: ${observedRoute.insufficientSample ? "insufficient sample" : "ok"}` : "- No observed route selected in this export."}
`;
  }

  return `# FairLease — Resumen Ejecutivo para Slides

Generado: ${now}
Preset estratégico: ${preset}

## Decisión de cartera
- Estatus combinado: **${statusUi(strategic.portfolioStatus).label}**
- Capital de reserva disponible: ${fmtMoney(reserveCapital)}
- Cobertura de reserva @99%: ${pct(strategic.reserveCoverage99)}
- Gap de capital vs reserva@99: ${fmtMoney(strategic.capitalGap99)}

## Economía unitaria
- Net esperado / póliza Inmueble: ${fmtMoney(result.property.expectedNetPerPolicy)}
- Net esperado / póliza Vuelo: ${fmtMoney(result.flight.expectedNetPerPolicy)}
- Net esperado combinado: ${fmtMoney(result.combined.totalExpectedNet)}
- Prima recomendada (Inmueble): ${fmtMoney(result.premiumForTargetProperty)}
- Prima recomendada (Vuelo): ${fmtMoney(result.premiumForTargetFlight)}

## Lógica de solvencia
- Auto-lock de capital vuelo / póliza: ${fmtMoney(result.flight.autoLockPerPolicy)}
- Auto-lock total vuelo: ${fmtMoney(result.flight.autoLockTotal)}
- Reserva@99 vuelo sin auto-lock: ${fmtMoney(result.flight.reserveAt99NoLock)}
- Reserva@99 vuelo con auto-lock: ${fmtMoney(result.flight.reserveAt99)}

## Ancla con datos observados
${observedRoute ? `- Ruta: **${observedRoute.route}** (n=${observedRoute.samples})
- p de breach observada (${observedMode === "hat" ? "estimador puntual" : "límite superior 95%"}): ${pct(
      observedMode === "hat" ? observedRoute.pAnyHat : observedRoute.pAnyCi95Upper
    )}
- Prima recomendada observada: ${fmtMoney(observedRoute.recommendedPremium)}
- Calidad de muestra: ${observedRoute.insufficientSample ? "insuficiente" : "ok"}` : "- No se seleccionó ruta observada en esta exportación."}
`;
}

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
/*  Net distribution chart (profit/loss)                               */
/* ================================================================== */

function NetChart({
  histogram,
  expectedNet,
  label,
  color,
}: {
  histogram: { bucket: number; count: number }[];
  expectedNet: number;
  label: string;
  color: "purple" | "blue";
}) {
  if (histogram.length === 0) return null;
  const maxCount = Math.max(...histogram.map((h) => h.count));
  const minBucket = histogram[0]?.bucket ?? 0;
  const maxBucket = histogram[histogram.length - 1]?.bucket ?? 0;
  const accentBar = color === "blue" ? "bg-blue-500/60" : "bg-purple-500/60";
  const accentBarHigh = color === "blue" ? "bg-blue-400/80" : "bg-purple-400/80";

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">
        {label} — Distribución de ganancia neta del portafolio
      </p>
      <div className="flex items-end gap-[1px] h-28 relative">
        {histogram.map((h, i) => {
          const pct = maxCount > 0 ? (h.count / maxCount) * 100 : 0;
          const isNegative = h.bucket < 0;
          const isNearExpected =
            Math.abs(h.bucket - expectedNet) <
            (maxBucket - minBucket) / histogram.length;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t transition-all ${
                isNegative
                  ? "bg-red-500/60"
                  : isNearExpected
                    ? accentBarHigh
                    : accentBar
              }`}
              style={{ height: `${Math.max(pct, 1)}%` }}
              title={`Net: $${h.bucket.toFixed(0)} — ${h.count} trials (${((h.count / histogram.reduce((s, x) => s + x.count, 0)) * 100).toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-1">
        <span className={minBucket < 0 ? "text-red-400" : ""}>
          ${minBucket.toFixed(0)}
        </span>
        <span className={color === "blue" ? "text-blue-400" : "text-purple-400"}>
          ↑ E[net]: ${expectedNet.toFixed(0)}
        </span>
        <span>${maxBucket.toFixed(0)}</span>
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
        <Slider
          label="Auto-lock capital / póliza"
          value={config.autoLockPerPolicy}
          min={0}
          max={200}
          step={5}
          unit="$"
          onChange={(v) => set("autoLockPerPolicy", v)}
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
            sub={`sin auto-lock: ${fmtPct(result.deficitProbabilityNoLock)}`}
          />
          <Stat label="Reserva @95%" value={fmtMoney(result.reserveAt95, currency)} />
          <Stat
            label="Reserva @99%"
            value={fmtMoney(result.reserveAt99, currency)}
            accent
            sub={`sin auto-lock: ${fmtMoney(result.reserveAt99NoLock, currency)}`}
          />
          <Stat
            label="Peor caso"
            value={fmtMoney(result.worstCaseReserve, currency)}
            warn={result.worstCaseReserve > 0}
            sub={`sin auto-lock: ${fmtMoney(result.worstCaseReserveNoLock, currency)}`}
          />
          <Stat
            label="Pólizas"
            value={result.nPolicies.toLocaleString("en-US")}
          />
          <Stat
            label="Auto-lock total"
            value={fmtMoney(result.autoLockTotal, currency)}
            accent={result.autoLockTotal > 0}
          />
          <Stat
            label="Cobertura lock vs reserva@99"
            value={
              Number.isFinite(result.reserveCoverageAt99)
                ? `${(result.reserveCoverageAt99 * 100).toFixed(1)}%`
                : "N/A"
            }
            warn={Number.isFinite(result.reserveCoverageAt99) && result.reserveCoverageAt99 < 1}
            accent={Number.isFinite(result.reserveCoverageAt99) && result.reserveCoverageAt99 >= 1}
          />
        </div>

        <NetChart
          histogram={result.netHistogram}
          expectedNet={result.expectedNetPortfolio}
          label={config.label}
          color={color}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main page                                                          */
/* ================================================================== */

export default function SimulatorPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [property, setProperty] = useState<ProductConfig>(DEFAULT_PROPERTY);
  const [flight, setFlight] = useState<ProductConfig>(DEFAULT_FLIGHT);
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [currency] = useState("USD");
  const [targetNet, setTargetNet] = useState(5);
  const [reserveCapital, setReserveCapital] = useState(15000);
  const [activePreset, setActivePreset] = useState<ScenarioPreset["id"]>("base");
  const [riskSource, setRiskSource] = useState<"manual" | "observed">("manual");
  const [observedMode, setObservedMode] = useState<"hat" | "upper95">("hat");
  const [observedRows, setObservedRows] = useState<FlightRiskRow[]>([]);
  const [selectedObservedRoute, setSelectedObservedRoute] = useState<string>("");
  const [observedGeneratedAt, setObservedGeneratedAt] = useState<string | null>(null);
  const [observedLoading, setObservedLoading] = useState(false);
  const [observedError, setObservedError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const initializedFromUrlRef = useRef(false);

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
    setReserveCapital(15000);
    setActivePreset("base");
    setRiskSource("manual");
    setObservedMode("hat");
  }, []);

  const applyPreset = useCallback((preset: ScenarioPreset) => {
    setProperty((prev) => ({ ...prev, ...preset.property }));
    setFlight((prev) => ({ ...prev, ...preset.flight }));
    setTargetNet(preset.targetNet);
    setActivePreset(preset.id);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadObservedRows() {
      setObservedLoading(true);
      setObservedError(null);
      try {
        const response = await fetch("/api/simulator/flight-risk", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload?.success || !Array.isArray(payload.routes)) {
          throw new Error(payload?.error || "No se pudieron cargar rutas observadas");
        }
        if (ignore) return;

        const rows: FlightRiskRow[] = payload.routes;
        setObservedRows(rows);
        setObservedGeneratedAt(payload.generatedAt || null);
        setSelectedObservedRoute((current) => current || rows[0]?.route || "");
      } catch (error) {
        if (ignore) return;
        setObservedError(error instanceof Error ? error.message : "Error de carga");
      } finally {
        if (!ignore) setObservedLoading(false);
      }
    }

    loadObservedRows();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (initializedFromUrlRef.current) return;
    initializedFromUrlRef.current = true;

    const presetFromUrl = searchParams.get("preset");
    const riskFromUrl = searchParams.get("risk");
    const routeFromUrl = searchParams.get("route");
    const modeFromUrl = searchParams.get("mode");

    const preset = SCENARIO_PRESETS.find((item) => item.id === presetFromUrl);
    if (preset) {
      applyPreset(preset);
    }

    if (riskFromUrl === "observed" || riskFromUrl === "manual") {
      setRiskSource(riskFromUrl);
    }
    if (modeFromUrl === "hat" || modeFromUrl === "upper95") {
      setObservedMode(modeFromUrl);
    }
    if (routeFromUrl) {
      setSelectedObservedRoute(routeFromUrl);
    }
  }, [applyPreset, searchParams]);

  useEffect(() => {
    if (!initializedFromUrlRef.current) return;
    const params = new URLSearchParams();
    params.set("preset", activePreset);
    params.set("risk", riskSource);
    params.set("mode", observedMode);
    if (selectedObservedRoute) {
      params.set("route", selectedObservedRoute);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [activePreset, pathname, riskSource, observedMode, selectedObservedRoute, router]);

  const selectedObserved = useMemo(
    () => observedRows.find((row) => row.route === selectedObservedRoute) || null,
    [observedRows, selectedObservedRoute]
  );

  useEffect(() => {
    if (riskSource !== "observed" || !selectedObserved) return;
    const prob =
      observedMode === "upper95" ? selectedObserved.pAnyCi95Upper : selectedObserved.pAnyHat;
    const normalizedProb = clamp(prob, 0.01, 0.95);
    setFlight((prev) => ({ ...prev, breachProbability: normalizedProb }));
  }, [observedMode, riskSource, selectedObserved]);

  const applyObservedPremium = useCallback(() => {
    if (!selectedObserved) return;
    setFlight((prev) => ({
      ...prev,
      buyerPremium: Math.max(1, Math.round(selectedObserved.recommendedPremium)),
      payoutIfYes: selectedObserved.ticketPrice > 0 ? selectedObserved.ticketPrice : prev.payoutIfYes,
      autoLockPerPolicy:
        selectedObserved.ticketPrice > 0 ? selectedObserved.ticketPrice : prev.autoLockPerPolicy,
    }));
  }, [selectedObserved]);

  const strategic = useMemo(() => {
    if (!result) return null;
    const propertyLine = evaluateLineStrategy(
      property,
      result.property,
      result.premiumForTargetProperty
    );
    const flightLine = evaluateLineStrategy(
      flight,
      result.flight,
      result.premiumForTargetFlight
    );
    const reserveCoverage99 =
      result.combined.totalReserveAt99 > 0
        ? reserveCapital / result.combined.totalReserveAt99
        : Infinity;
    const reserveCoverageConf =
      result.combined.totalReserveAtConfidence > 0
        ? reserveCapital / result.combined.totalReserveAtConfidence
        : Infinity;

    let portfolioStatus: StrategyStatus = "NO_GO";
    const bothSolid =
      propertyLine.status !== "NO_GO" &&
      flightLine.status !== "NO_GO" &&
      reserveCoverage99 >= 1;

    if (bothSolid && propertyLine.status === "GO" && flightLine.status === "GO") {
      portfolioStatus = "GO";
    } else if (
      propertyLine.status !== "NO_GO" &&
      flightLine.status !== "NO_GO" &&
      reserveCoverage99 >= 0.8
    ) {
      portfolioStatus = "WATCH";
    }

    return {
      propertyLine,
      flightLine,
      reserveCoverage99,
      reserveCoverageConf,
      portfolioStatus,
      capitalGap99: reserveCapital - result.combined.totalReserveAt99,
    };
  }, [result, property, flight, reserveCapital]);

  const exportSlideReady = useCallback(
    (lang: "es" | "en") => {
      if (!result || !strategic) return;
      const content = buildSlideReadyContent({
        lang,
        preset: activePreset,
        reserveCapital,
        result,
        strategic,
        observedRoute: selectedObserved,
        observedMode,
      });
      const suffix = lang === "es" ? "es" : "en";
      const dateTag = new Date().toISOString().slice(0, 10);
      downloadText(`fairlease-slide-ready-${suffix}-${dateTag}.md`, content);
    },
    [
      result,
      strategic,
      activePreset,
      reserveCapital,
      selectedObserved,
      observedMode,
    ]
  );

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
            <Slider
              label="Capital de reserva disponible"
              value={reserveCapital}
              min={0}
              max={200000}
              step={1000}
              unit="$"
              onChange={setReserveCapital}
              color="amber"
            />
          </div>
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">Escenario estratégico / Strategic preset</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SCENARIO_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className={`text-left rounded-lg border px-3 py-2 transition ${
                    activePreset === preset.id
                      ? "border-purple-500/60 bg-purple-500/10"
                      : "border-gray-700/60 bg-gray-800/30 hover:border-gray-600"
                  }`}
                >
                  <p className="text-xs text-white font-semibold">{preset.label}</p>
                  <p className="text-[11px] text-gray-400">{preset.description}</p>
                </button>
              ))}
            </div>
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

        {/* Observed flight risk data */}
        <div className="glass rounded-2xl border border-gray-700/50 p-5 mb-8 animate-fade-in-up-delay-1">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">📡 Riesgo observado de vuelos</h2>
              <p className="text-xs text-gray-400">
                Conecta el simulador al dataset `flight-risk-routes.csv` para usar probabilidades observadas.
              </p>
            </div>
            <div className="text-[11px] text-gray-500">
              {observedGeneratedAt
                ? `Última actualización: ${new Date(observedGeneratedAt).toLocaleString()}`
                : "Sin timestamp de generación"}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 px-3 py-2">
              <p className="text-[11px] text-gray-400 mb-1">Fuente de riesgo (Vuelo)</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setRiskSource("manual")}
                  className={`px-2.5 py-1 text-xs rounded border ${
                    riskSource === "manual"
                      ? "border-gray-500 bg-gray-700/50 text-white"
                      : "border-gray-700 text-gray-400"
                  }`}
                >
                  Manual
                </button>
                <button
                  onClick={() => setRiskSource("observed")}
                  className={`px-2.5 py-1 text-xs rounded border ${
                    riskSource === "observed"
                      ? "border-blue-500/60 bg-blue-500/10 text-blue-200"
                      : "border-gray-700 text-gray-400"
                  }`}
                >
                  Observado
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 px-3 py-2">
              <p className="text-[11px] text-gray-400 mb-1">Ruta observada</p>
              <select
                value={selectedObservedRoute}
                onChange={(e) => setSelectedObservedRoute(e.target.value)}
                className="w-full rounded bg-gray-900 border border-gray-700 text-xs text-gray-200 px-2 py-1"
                disabled={observedLoading || observedRows.length === 0}
              >
                {observedRows.map((row) => (
                  <option key={row.route} value={row.route}>
                    {row.route} (n={row.samples})
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 px-3 py-2">
              <p className="text-[11px] text-gray-400 mb-1">Modo de probabilidad</p>
              <select
                value={observedMode}
                onChange={(e) => setObservedMode(e.target.value as "hat" | "upper95")}
                className="w-full rounded bg-gray-900 border border-gray-700 text-xs text-gray-200 px-2 py-1"
                disabled={observedLoading || !selectedObserved}
              >
                <option value="hat">Estimador puntual (p_hat)</option>
                <option value="upper95">Conservador (upper 95%)</option>
              </select>
            </div>

            <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 px-3 py-2">
              <p className="text-[11px] text-gray-400 mb-1">Acción rápida</p>
              <button
                onClick={applyObservedPremium}
                disabled={!selectedObserved}
                className="w-full rounded border border-blue-500/40 bg-blue-500/10 text-xs text-blue-200 px-2 py-1 disabled:opacity-50"
              >
                Aplicar prima observada
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs">
            {observedLoading && <p className="text-gray-400">Cargando rutas observadas…</p>}
            {observedError && <p className="text-red-400">Error: {observedError}</p>}
            {!observedLoading && !observedError && selectedObserved && (
              <p className="text-gray-300">
                Ruta <span className="font-mono text-blue-300">{selectedObserved.route}</span> ·
                p_any ({observedMode === "hat" ? "p_hat" : "upper95"}) ={" "}
                <span className="font-mono">
                  {pct(observedMode === "hat" ? selectedObserved.pAnyHat : selectedObserved.pAnyCi95Upper)}
                </span>{" "}
                · prima recomendada ={" "}
                <span className="font-mono">{fmtMoney(selectedObserved.recommendedPremium, currency)}</span>{" "}
                {selectedObserved.insufficientSample && (
                  <span className="text-amber-300">· ⚠️ muestra insuficiente</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Strategic decision panel */}
        {result && strategic && (
          <div className="glass rounded-2xl border border-gray-700/50 p-6 mb-8 animate-fade-in-up-delay-2">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>🧭</span> Lectura estratégica / Strategic decision layer
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 px-4 py-3">
                <p className="text-xs text-gray-400 mb-1">Estatus cartera combinada</p>
                <span
                  className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${
                    statusUi(strategic.portfolioStatus).className
                  }`}
                >
                  {statusUi(strategic.portfolioStatus).label}
                </span>
              </div>
              <Stat
                label="Cobertura de reserva @99%"
                value={
                  Number.isFinite(strategic.reserveCoverage99)
                    ? `${(strategic.reserveCoverage99 * 100).toFixed(1)}%`
                    : "N/A"
                }
                warn={strategic.reserveCoverage99 < 1}
              />
              <Stat
                label="Gap capital vs reserva @99%"
                value={fmtMoney(strategic.capitalGap99, currency)}
                warn={strategic.capitalGap99 < 0}
                accent={strategic.capitalGap99 >= 0}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-purple-300 font-semibold">🏠 Inmueble</p>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold ${
                      statusUi(strategic.propertyLine.status).className
                    }`}
                  >
                    {statusUi(strategic.propertyLine.status).label}
                  </span>
                </div>
                <p className="text-xs text-gray-300">
                  Loss ratio esperado:{" "}
                  <span className="font-mono">{(strategic.propertyLine.lossRatio * 100).toFixed(1)}%</span>
                </p>
                <p className="text-xs text-gray-300">
                  Gap prima actual vs recomendada:{" "}
                  <span className="font-mono">
                    {fmtMoney(strategic.propertyLine.pricingGap, currency)}
                  </span>
                </p>
              </div>

              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-blue-300 font-semibold">✈️ Vuelo</p>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold ${
                      statusUi(strategic.flightLine.status).className
                    }`}
                  >
                    {statusUi(strategic.flightLine.status).label}
                  </span>
                </div>
                <p className="text-xs text-gray-300">
                  Loss ratio esperado:{" "}
                  <span className="font-mono">{(strategic.flightLine.lossRatio * 100).toFixed(1)}%</span>
                </p>
                <p className="text-xs text-gray-300">
                  Gap prima actual vs recomendada:{" "}
                  <span className="font-mono">{fmtMoney(strategic.flightLine.pricingGap, currency)}</span>
                </p>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-3">
              Regla usada: <code>GO</code> si pricing gap {">="} 0, prob. déficit {"<="} 2% y reserva@99 cubierta.
              <code> WATCH</code> si gap {">="} -2 y déficit {"<="} 5%. En otro caso: <code>NO-GO</code>.
            </p>
          </div>
        )}

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
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span>🔗</span> Visión Combinada del Portafolio
                {running && (
                  <span className="text-xs text-gray-500 animate-pulse-subtle">
                    calculando…
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportSlideReady("es")}
                  className="rounded border border-purple-500/40 bg-purple-500/10 text-purple-200 text-xs px-3 py-1.5"
                >
                  Export Slide-ready ES
                </button>
                <button
                  onClick={() => exportSlideReady("en")}
                  className="rounded border border-blue-500/40 bg-blue-500/10 text-blue-200 text-xs px-3 py-1.5"
                >
                  Export Slide-ready EN
                </button>
              </div>
            </div>

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
                    <strong className="text-gray-400">Auto-lock de cobertura:</strong> Al vender una
                    póliza, la aseguradora puede bloquear capital por póliza (por ejemplo, el valor
                    total del ticket en vuelo). Ese capital reduce el riesgo de déficit y modela
                    un pago garantizado ante incumplimiento.
                  </p>
                  <p>
                    <strong className="text-gray-400">Monte Carlo:</strong> Se ejecutan miles de
                    simulaciones aleatorias del portafolio completo. En cada trial, cada póliza se
                    resuelve aleatoriamente según la probabilidad de breach. Se registra la pérdida
                    neta descubierta del protocolo (después de usar el auto-lock).
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
