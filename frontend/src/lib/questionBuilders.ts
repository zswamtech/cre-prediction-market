export type PolicyType = "property" | "flight";

export type PropertyCoverageKind =
  | "qol_combined"
  | "noise"
  | "safety"
  | "construction"
  | "weather";

export type FlightCoverageKind = "flight_delay";

export type CoverageKind = PropertyCoverageKind | FlightCoverageKind;

export type PlanType = "conservative" | "balanced" | "aggressive";

export type DraftPolicyStatus =
  | "draft"
  | "queued"
  | "awaiting_signature"
  | "broadcasted"
  | "confirmed"
  | "failed"
  | "skipped";

export type DraftPolicyParams =
  | {
      policyType: "property";
      propertyId: string;
      planType: PlanType;
      coverageKind: PropertyCoverageKind;
    }
  | {
      policyType: "flight";
      flightCode: string;
      travelDate: string;
      delayThresholdMinutes: number;
      coverageKind: FlightCoverageKind;
    };

export type DraftPolicyItem = {
  id: string;
  policyType: PolicyType;
  coverageKind: CoverageKind;
  question: string;
  params: DraftPolicyParams;
  status: DraftPolicyStatus;
  txHash?: `0x${string}`;
  marketId?: string;
  error?: string;
};

export type BundleExecutionItemResult = {
  id: string;
  status: DraftPolicyStatus;
  txHash?: `0x${string}`;
  marketId?: string;
  error?: string;
};

export const FLIGHT_CODE_REGEX = /^[A-Za-z]{2,3}\d{2,4}$/;

export function normalizePropertyId(propertyId: string): string {
  return propertyId.trim();
}

export function validatePropertyId(propertyId: string): boolean {
  return /^\d+$/.test(normalizePropertyId(propertyId));
}

export function normalizeFlightCode(flightCode: string): string {
  return flightCode.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function validateFlightCode(flightCode: string): boolean {
  return FLIGHT_CODE_REGEX.test(normalizeFlightCode(flightCode));
}

export function normalizeDelayThreshold(threshold: number): number {
  if (!Number.isFinite(threshold)) return 45;
  return Math.round(threshold);
}

export function validateDelayThreshold(threshold: number): boolean {
  return Number.isInteger(threshold) && threshold >= 15 && threshold <= 240;
}

export function formatDateToDdMmYyyy(value: string): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  const [yyyy, mm, dd] = normalized.split("-");
  return `${dd}-${mm}-${yyyy}`;
}

export function toCoverageLabel(coverageKind: CoverageKind): string {
  switch (coverageKind) {
    case "qol_combined":
      return "Calidad de vida (combinada)";
    case "noise":
      return "Ruido";
    case "safety":
      return "Seguridad";
    case "construction":
      return "Obras";
    case "weather":
      return "Clima severo";
    case "flight_delay":
      return "Retraso/cancelación de vuelo";
    default:
      return "Cobertura";
  }
}

export function inferPolicyTypeFromQuestion(question: string): PolicyType {
  if (/\b(vuelo|flight|delay|retras[oa]s?|cancelad[oa]|cancelled)\b/i.test(question)) {
    return "flight";
  }
  return "property";
}

export function inferCoverageKindFromQuestion(question: string): CoverageKind {
  if (inferPolicyTypeFromQuestion(question) === "flight") {
    return "flight_delay";
  }
  if (/calidad de vida|obras,\s*ruido,\s*seguridad\s*o\s*clima/i.test(question)) {
    return "qol_combined";
  }
  if (/ruido|noise/i.test(question)) return "noise";
  if (/seguridad|safety/i.test(question)) return "safety";
  if (/obras|construction/i.test(question)) return "construction";
  if (/clima|weather|precipitaci[oó]n|viento/i.test(question)) return "weather";
  return "qol_combined";
}

export function buildPropertyQuestion(
  coverageKind: PropertyCoverageKind,
  propertyId: string
): string {
  const normalized = normalizePropertyId(propertyId);
  switch (coverageKind) {
    case "noise":
      return `¿Se activó el payout por ruido > 70 dB en la propiedad ID ${normalized} durante la vigencia de la póliza?`;
    case "safety":
      return `¿Se activó el payout por índice de seguridad < 5.0 en la propiedad ID ${normalized} durante la vigencia de la póliza?`;
    case "construction":
      return `¿Se activó el payout por obras cercanas activas en la propiedad ID ${normalized} durante la vigencia de la póliza?`;
    case "weather":
      return `¿Se activó el payout por clima severo (precipitación >= 5 mm o viento >= 30 km/h) asociado a la propiedad ID ${normalized} durante la vigencia de la póliza?`;
    case "qol_combined":
    default:
      return `¿Se incumplió la calidad de vida (obras, ruido, seguridad o clima) en la propiedad ID ${normalized} durante la vigencia de la póliza?`;
  }
}

export function buildFlightQuestion(
  flightCode: string,
  travelDate: string,
  delayThresholdMinutes: number
): string {
  const normalizedFlightCode = normalizeFlightCode(flightCode);
  const normalizedThreshold = normalizeDelayThreshold(delayThresholdMinutes);
  const readableDate = formatDateToDdMmYyyy(travelDate);
  return `¿Se activó el payout por retraso del vuelo ${normalizedFlightCode} (>=${normalizedThreshold} min) o cancelación el ${readableDate}?`;
}

