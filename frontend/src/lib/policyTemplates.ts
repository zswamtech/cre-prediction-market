import type {
  CoverageKind,
  FlightCoverageKind,
  PolicyType,
  PropertyCoverageKind,
} from "./questionBuilders";

export type CoverageTemplate = {
  policyType: PolicyType;
  coverageKind: CoverageKind;
  label: string;
  description: string;
};

export const PROPERTY_COVERAGE_TEMPLATES: Array<
  CoverageTemplate & { coverageKind: PropertyCoverageKind }
> = [
  {
    policyType: "property",
    coverageKind: "qol_combined",
    label: "Calidad de vida (combinada)",
    description:
      "Evalúa ruido, seguridad, obras y clima con una sola condición binaria.",
  },
  {
    policyType: "property",
    coverageKind: "noise",
    label: "Ruido",
    description: "Incumplimiento por ruido > 70 dB.",
  },
  {
    policyType: "property",
    coverageKind: "safety",
    label: "Seguridad",
    description: "Incumplimiento por seguridad < 5.0.",
  },
  {
    policyType: "property",
    coverageKind: "construction",
    label: "Obras",
    description: "Incumplimiento por obras cercanas activas.",
  },
  {
    policyType: "property",
    coverageKind: "weather",
    label: "Clima severo",
    description: "Incumplimiento por precipitación/viento severo.",
  },
];

export const FLIGHT_COVERAGE_TEMPLATES: Array<
  CoverageTemplate & { coverageKind: FlightCoverageKind }
> = [
  {
    policyType: "flight",
    coverageKind: "flight_delay",
    label: "Retraso o cancelación",
    description: "Incumplimiento por retraso >= threshold o vuelo cancelado.",
  },
];

export function getCoverageTemplates(policyType: PolicyType): CoverageTemplate[] {
  if (policyType === "flight") {
    return FLIGHT_COVERAGE_TEMPLATES;
  }
  return PROPERTY_COVERAGE_TEMPLATES;
}

