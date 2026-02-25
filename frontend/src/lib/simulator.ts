/**
 * Portfolio simulator for parametric insurance — ported from scripts/simulate-portfolio.js
 * Pure functions, no side effects. Runs client-side in the browser.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ProductConfig {
  label: string;
  count: number;
  buyerPremium: number;
  hostStake: number;
  payoutIfYes: number;
  hostRefundIfNo: number;
  breachProbability: number;
  operationalCost: number;
  /**
   * Capital reserved by insurer/underwriter when each policy is sold.
   * This models "automatic pool funding" so claims can be honored.
   */
  autoLockPerPolicy: number;
}

export interface SimulationParams {
  trials: number;
  confidence: number;
  seed: number;
}

export interface SimulationResult {
  nPolicies: number;
  inflowPerPolicy: number;
  netYes: number;
  netNo: number;
  expectedNetPerPolicy: number;
  expectedNetPortfolio: number;
  breakEvenBreachProb: number;
  worstCaseReserve: number;
  worstCaseReserveNoLock: number;
  reserveAtConfidence: number;
  reserveAt95: number;
  reserveAt99: number;
  reserveAt95NoLock: number;
  reserveAt99NoLock: number;
  deficitProbability: number;
  deficitProbabilityNoLock: number;
  autoLockPerPolicy: number;
  autoLockTotal: number;
  reserveCoverageAt99: number;
  /** Histogram of net profit/loss distribution (negative = deficit) */
  netHistogram: { bucket: number; count: number }[];
  /** Histogram of loss-only distribution */
  lossHistogram: { bucket: number; count: number }[];
}

export interface DualResult {
  property: SimulationResult;
  flight: SimulationResult;
  combined: {
    totalExpectedNet: number;
    totalReserveAt99: number;
    totalReserveAtConfidence: number;
    totalWorstCaseReserve: number;
  };
  premiumForTargetProperty: number;
  premiumForTargetFlight: number;
}

/* ------------------------------------------------------------------ */
/*  PRNG (Mulberry32) — deterministic, seedable                        */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/*  Quantile                                                           */
/* ------------------------------------------------------------------ */

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (q <= 0) return sorted[0];
  if (q >= 1) return sorted[sorted.length - 1];
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

/* ------------------------------------------------------------------ */
/*  Build histogram from sorted losses                                 */
/* ------------------------------------------------------------------ */

function buildHistogram(
  sorted: number[],
  buckets: number = 40
): { bucket: number; count: number }[] {
  if (sorted.length === 0) return [];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (max === min) return [{ bucket: min, count: sorted.length }];

  const step = (max - min) / buckets;
  const hist: { bucket: number; count: number }[] = [];
  for (let i = 0; i < buckets; i++) {
    hist.push({ bucket: min + step * (i + 0.5), count: 0 });
  }

  for (const v of sorted) {
    let idx = Math.floor((v - min) / step);
    if (idx >= buckets) idx = buckets - 1;
    hist[idx].count++;
  }

  return hist;
}

/* ------------------------------------------------------------------ */
/*  Core Monte Carlo simulation                                        */
/* ------------------------------------------------------------------ */

export function simulatePortfolio(
  config: ProductConfig,
  params: SimulationParams
): SimulationResult {
  const {
    buyerPremium,
    hostStake,
    payoutIfYes,
    hostRefundIfNo,
    breachProbability,
    operationalCost,
    count,
    autoLockPerPolicy,
  } = config;
  const { trials, confidence, seed } = params;

  const inflowPerPolicy = buyerPremium + hostStake;
  const netYes = inflowPerPolicy - payoutIfYes - operationalCost;
  const netNo = inflowPerPolicy - hostRefundIfNo - operationalCost;

  const expectedNetPerPolicy = breachProbability * netYes + (1 - breachProbability) * netNo;
  const expectedNetPortfolio = expectedNetPerPolicy * count;

  const denom = payoutIfYes - hostRefundIfNo;
  const breakEvenBreachProb = denom > 0 ? netNo / denom : Infinity;

  const lockTotal = autoLockPerPolicy * count;

  const deficitYes = Math.max(0, payoutIfYes - inflowPerPolicy - autoLockPerPolicy);
  const deficitNo = Math.max(0, hostRefundIfNo - inflowPerPolicy - autoLockPerPolicy);
  const worstCaseReserve = Math.max(deficitYes, deficitNo) * count;

  const deficitYesNoLock = Math.max(0, payoutIfYes - inflowPerPolicy);
  const deficitNoNoLock = Math.max(0, hostRefundIfNo - inflowPerPolicy);
  const worstCaseReserveNoLock = Math.max(deficitYesNoLock, deficitNoNoLock) * count;

  const rng = mulberry32(seed + count);
  const losses: number[] = [];
  const lossesNoLock: number[] = [];
  const nets: number[] = [];
  let deficitEvents = 0;
  let deficitEventsNoLock = 0;

  for (let t = 0; t < trials; t++) {
    let yesCount = 0;
    for (let i = 0; i < count; i++) {
      if (rng() < breachProbability) yesCount++;
    }
    const noCount = count - yesCount;
    const net = yesCount * netYes + noCount * netNo;
    const lossNoLock = Math.max(0, -net);
    const loss = Math.max(0, -net - lockTotal);
    losses.push(loss);
    lossesNoLock.push(lossNoLock);
    nets.push(net);
    if (loss > 0) deficitEvents++;
    if (lossNoLock > 0) deficitEventsNoLock++;
  }

  losses.sort((a, b) => a - b);
  lossesNoLock.sort((a, b) => a - b);
  nets.sort((a, b) => a - b);

  const reserveAt99 = quantile(losses, 0.99);
  const reserveAt99NoLock = quantile(lossesNoLock, 0.99);

  return {
    nPolicies: count,
    inflowPerPolicy,
    netYes,
    netNo,
    expectedNetPerPolicy,
    expectedNetPortfolio,
    breakEvenBreachProb,
    worstCaseReserve,
    worstCaseReserveNoLock,
    reserveAtConfidence: quantile(losses, confidence),
    reserveAt95: quantile(losses, 0.95),
    reserveAt99,
    reserveAt95NoLock: quantile(lossesNoLock, 0.95),
    reserveAt99NoLock,
    deficitProbability: deficitEvents / trials,
    deficitProbabilityNoLock: deficitEventsNoLock / trials,
    autoLockPerPolicy,
    autoLockTotal: lockTotal,
    reserveCoverageAt99: reserveAt99NoLock > 0 ? lockTotal / reserveAt99NoLock : Infinity,
    netHistogram: buildHistogram(nets),
    lossHistogram: buildHistogram(losses),
  };
}

/* ------------------------------------------------------------------ */
/*  Required premium for target net per policy                         */
/* ------------------------------------------------------------------ */

export function requiredPremiumForTarget(
  config: Omit<ProductConfig, "buyerPremium" | "label" | "count">,
  targetNetPerPolicy: number
): number {
  const expectedOutflow =
    config.breachProbability * config.payoutIfYes +
    (1 - config.breachProbability) * config.hostRefundIfNo;
  return targetNetPerPolicy + config.operationalCost + expectedOutflow - config.hostStake;
}

/* ------------------------------------------------------------------ */
/*  Dual simulation (Property + Flight)                                */
/* ------------------------------------------------------------------ */

export function simulateDual(
  property: ProductConfig,
  flight: ProductConfig,
  params: SimulationParams,
  targetNetPerPolicy: number = 5
): DualResult {
  const propResult = simulatePortfolio(property, params);
  const flightResult = simulatePortfolio(flight, { ...params, seed: params.seed + 7 });

  return {
    property: propResult,
    flight: flightResult,
    combined: {
      totalExpectedNet: propResult.expectedNetPortfolio + flightResult.expectedNetPortfolio,
      totalReserveAt99: propResult.reserveAt99 + flightResult.reserveAt99,
      totalReserveAtConfidence: propResult.reserveAtConfidence + flightResult.reserveAtConfidence,
      totalWorstCaseReserve: propResult.worstCaseReserve + flightResult.worstCaseReserve,
    },
    premiumForTargetProperty: requiredPremiumForTarget(property, targetNetPerPolicy),
    premiumForTargetFlight: requiredPremiumForTarget(flight, targetNetPerPolicy),
  };
}

/* ------------------------------------------------------------------ */
/*  Default configs                                                    */
/* ------------------------------------------------------------------ */

export const DEFAULT_PROPERTY: ProductConfig = {
  label: "Inmueble (QoL)",
  count: 1000,
  buyerPremium: 20,
  hostStake: 20,
  payoutIfYes: 50,
  hostRefundIfNo: 20,
  breachProbability: 0.25,
  operationalCost: 0,
  autoLockPerPolicy: 0,
};

export const DEFAULT_FLIGHT: ProductConfig = {
  label: "Vuelo (Flight Delay)",
  count: 1000,
  buyerPremium: 20,
  hostStake: 20,
  payoutIfYes: 100,
  hostRefundIfNo: 20,
  breachProbability: 0.20,
  operationalCost: 0,
  autoLockPerPolicy: 100,
};

export const DEFAULT_PARAMS: SimulationParams = {
  trials: 10000,
  confidence: 0.99,
  seed: 42,
};

/* ------------------------------------------------------------------ */
/*  Format helpers                                                     */
/* ------------------------------------------------------------------ */

export function fmtMoney(value: number, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function fmtPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
