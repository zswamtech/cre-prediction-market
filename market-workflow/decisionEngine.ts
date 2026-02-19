export const DECISION_THRESHOLDS = {
  noiseLevelDb: 70,
  safetyIndex: 5,
  precipitationMm: 5,
  windSpeedKmh: 30,
  flightDelayMinutes: 45,
} as const;

/**
 * Graduated payout tiers for flight delay insurance.
 *
 * Tier 0: No breach → 0% payout
 * Tier 1: delay >= threshold (e.g. 45 min) → 50% payout
 * Tier 2: delay >= 2x threshold (e.g. 90 min) OR cancelled → 100% payout
 */
export const GRADUATED_PAYOUT = {
  tier1Percent: 50,
  tier2Percent: 100,
  tier2Multiplier: 2,
} as const;

export type PayoutTier = 0 | 1 | 2;

export type DecisionThresholdId =
  | "noiseLevelDb"
  | "safetyIndex"
  | "nearbyConstruction"
  | "precipitationMm"
  | "windSpeedKmh"
  | "flightDelayMinutes"
  | "flightCancelled";

export type DecisionThresholdStatus = "breach" | "clear" | "unknown";

export interface DecisionThresholdCheck {
  id: DecisionThresholdId;
  label: string;
  status: DecisionThresholdStatus;
  value: number | boolean | string;
  threshold: string;
}

export interface OracleMetricsInput {
  noiseLevelDb?: number;
  safetyIndex?: number;
  nearbyConstruction?: boolean;
  publicTransportStatus?: string;
}

export interface WeatherMetricsInput {
  precipitationMm?: number;
  windSpeedKmh?: number;
  temperatureC?: number;
  time?: string;
}

export interface FlightDelayInput {
  flightId?: string;
  status?: string;
  delayMinutes?: number | null;
  thresholdMinutes?: number;
  departureAirport?: string;
  arrivalAirport?: string;
  date?: string;
  officialSourceUrl?: string;
  // Graduated payout fields (from oracle v2)
  payoutPercent?: number;
  payoutTier?: PayoutTier;
  payoutReason?: string;
  tier2ThresholdMinutes?: number;
}

export interface DecisionTrace {
  oracleId?: string;
  policyType?: "quality_of_life" | "flight_delay";
  sourceUrl?: string;
  deterministicVerdict: "YES" | "NO";
  breachDetected: boolean;
  reason: string;
  checks: DecisionThresholdCheck[];
  // Graduated payout (flight delay only)
  payoutTier?: PayoutTier;
  payoutPercent?: number;
  payoutReason?: string;
  privacy?: {
    privatePayoutEnabled: boolean;
    privatePayoutRequested: boolean;
    mode?: string;
    payoutCommitment?: string;
    relayAttempted?: boolean;
    relaySent?: boolean;
    relayReference?: string;
    note?: string;
  };
}

type EvaluateInput = {
  oracle?: OracleMetricsInput;
  weather?: WeatherMetricsInput;
  oracleId?: string;
};

type EvaluateFlightInput = {
  flight?: FlightDelayInput;
  flightId?: string;
  sourceUrl?: string;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function evaluateQualityOfLifeBreach(input: EvaluateInput): DecisionTrace {
  const checks: DecisionThresholdCheck[] = [];

  const noise = input.oracle?.noiseLevelDb;
  checks.push({
    id: "noiseLevelDb",
    label: "Ruido > 70 dB",
    status: isFiniteNumber(noise)
      ? noise > DECISION_THRESHOLDS.noiseLevelDb
        ? "breach"
        : "clear"
      : "unknown",
    value: isFiniteNumber(noise) ? noise : "N/A",
    threshold: `>${DECISION_THRESHOLDS.noiseLevelDb} dB`,
  });

  const safety = input.oracle?.safetyIndex;
  checks.push({
    id: "safetyIndex",
    label: "Seguridad < 5.0",
    status: isFiniteNumber(safety)
      ? safety < DECISION_THRESHOLDS.safetyIndex
        ? "breach"
        : "clear"
      : "unknown",
    value: isFiniteNumber(safety) ? safety : "N/A",
    threshold: `<${DECISION_THRESHOLDS.safetyIndex}`,
  });

  const construction = input.oracle?.nearbyConstruction;
  checks.push({
    id: "nearbyConstruction",
    label: "Obras cercanas = true",
    status:
      typeof construction === "boolean"
        ? construction
          ? "breach"
          : "clear"
        : "unknown",
    value: typeof construction === "boolean" ? construction : "N/A",
    threshold: "== true",
  });

  const precipitation = input.weather?.precipitationMm;
  checks.push({
    id: "precipitationMm",
    label: "Precipitación >= 5 mm",
    status: isFiniteNumber(precipitation)
      ? precipitation >= DECISION_THRESHOLDS.precipitationMm
        ? "breach"
        : "clear"
      : "unknown",
    value: isFiniteNumber(precipitation) ? precipitation : "N/A",
    threshold: `>=${DECISION_THRESHOLDS.precipitationMm} mm`,
  });

  const wind = input.weather?.windSpeedKmh;
  checks.push({
    id: "windSpeedKmh",
    label: "Viento >= 30 km/h",
    status: isFiniteNumber(wind)
      ? wind >= DECISION_THRESHOLDS.windSpeedKmh
        ? "breach"
        : "clear"
      : "unknown",
    value: isFiniteNumber(wind) ? wind : "N/A",
    threshold: `>=${DECISION_THRESHOLDS.windSpeedKmh} km/h`,
  });

  const breachedChecks = checks.filter((check) => check.status === "breach");
  const knownChecks = checks.filter((check) => check.status !== "unknown");
  const breachDetected = breachedChecks.length > 0;

  let reason = "No breach detected in available oracle/weather signals.";
  if (breachDetected) {
    reason = `Threshold breach detected: ${breachedChecks
      .map((check) => check.label)
      .join(", ")}.`;
  } else if (knownChecks.length === 0) {
    reason = "No trusted oracle/weather values available to evaluate thresholds.";
  }

  return {
    oracleId: input.oracleId,
    policyType: "quality_of_life",
    deterministicVerdict: breachDetected ? "YES" : "NO",
    breachDetected,
    reason,
    checks,
  };
}

export function evaluateFlightDelayBreach(input: EvaluateFlightInput): DecisionTrace {
  const checks: DecisionThresholdCheck[] = [];
  const threshold = isFiniteNumber(input.flight?.thresholdMinutes)
    ? input.flight?.thresholdMinutes
    : DECISION_THRESHOLDS.flightDelayMinutes;
  const tier2Threshold = threshold * GRADUATED_PAYOUT.tier2Multiplier;
  const delayMinutes = input.flight?.delayMinutes;
  const normalizedStatus =
    typeof input.flight?.status === "string" ? input.flight.status.toUpperCase() : undefined;

  checks.push({
    id: "flightDelayMinutes",
    label: `Retraso >= ${threshold} min`,
    status: isFiniteNumber(delayMinutes)
      ? delayMinutes >= threshold
        ? "breach"
        : "clear"
      : "unknown",
    value: isFiniteNumber(delayMinutes) ? delayMinutes : "N/A",
    threshold: `>=${threshold} min`,
  });

  const cancelled = normalizedStatus === "CANCELLED";
  checks.push({
    id: "flightCancelled",
    label: "Vuelo cancelado",
    status: normalizedStatus ? (cancelled ? "breach" : "clear") : "unknown",
    value: normalizedStatus || "N/A",
    threshold: "== CANCELLED",
  });

  const breachedChecks = checks.filter((check) => check.status === "breach");
  const knownChecks = checks.filter((check) => check.status !== "unknown");
  const breachDetected = breachedChecks.length > 0;

  // ── Graduated Payout Evaluation ──
  // If the oracle already computed payout tiers, trust those values.
  // Otherwise, compute locally using the same logic.
  let payoutTier: PayoutTier = 0;
  let payoutPercent = 0;
  let payoutReason = "No breach - no payout";

  if (isFiniteNumber(input.flight?.payoutTier) && isFiniteNumber(input.flight?.payoutPercent)) {
    // Oracle v2 already computed graduated payout
    payoutTier = input.flight.payoutTier as PayoutTier;
    payoutPercent = input.flight.payoutPercent;
    payoutReason = input.flight.payoutReason || `Oracle-computed tier ${payoutTier}`;
  } else if (breachDetected) {
    // Compute locally
    if (cancelled) {
      payoutTier = 2;
      payoutPercent = GRADUATED_PAYOUT.tier2Percent;
      payoutReason = `Flight cancelled - full payout (${payoutPercent}%)`;
    } else if (isFiniteNumber(delayMinutes) && delayMinutes >= tier2Threshold) {
      payoutTier = 2;
      payoutPercent = GRADUATED_PAYOUT.tier2Percent;
      payoutReason = `Delay ${delayMinutes} min >= ${tier2Threshold} min (2x threshold) - full payout (${payoutPercent}%)`;
    } else {
      payoutTier = 1;
      payoutPercent = GRADUATED_PAYOUT.tier1Percent;
      payoutReason = `Delay ${delayMinutes} min >= ${threshold} min - partial payout (${payoutPercent}%)`;
    }
  }

  let reason = "No delay/cancellation breach detected in available flight signals.";
  if (breachDetected) {
    reason = `Threshold breach detected: ${breachedChecks
      .map((check) => check.label)
      .join(", ")}. Payout tier ${payoutTier} (${payoutPercent}%).`;
  } else if (knownChecks.length === 0) {
    reason = "No trusted flight values available to evaluate thresholds.";
  }

  return {
    oracleId: input.flightId || input.flight?.flightId,
    policyType: "flight_delay",
    sourceUrl: input.sourceUrl || input.flight?.officialSourceUrl,
    deterministicVerdict: breachDetected ? "YES" : "NO",
    breachDetected,
    reason,
    checks,
    payoutTier,
    payoutPercent,
    payoutReason,
  };
}
