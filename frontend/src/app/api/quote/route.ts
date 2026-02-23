import { NextResponse } from "next/server";

type PlanType = "conservative" | "balanced" | "aggressive";

type QuoteRequestBody = {
  propertyId?: string | number;
  planType?: PlanType;
  basePremiumUsd?: number;
  breachProbability?: number;
  reserveCoverageRatio?: number;
  projectedPortfolioSize?: number;
  ethPriceUsd?: number;
};

type OracleMetrics = {
  noiseLevelDb?: number;
  safetyIndex?: number;
  nearbyConstruction?: boolean;
  publicTransportStatus?: string;
};

type OracleSnapshot = {
  riskScore?: number;
  occupancy?: number;
  avgPrice?: number;
  adr?: number;
  revpar?: number;
  bookings?: number;
  nights?: number;
  region?: string;
};

type OracleResponse = {
  success?: boolean;
  data?: {
    address?: string;
    metrics?: OracleMetrics;
    marketSnapshot?: OracleSnapshot;
  };
};

type PlanConfig = {
  coverageFactor: number;
  hostRefundFactor: number;
  minReserveCoverageRatio: number;
  maxRiskScore?: number;
  label: string;
};

const PLAN_CONFIG: Record<PlanType, PlanConfig> = {
  conservative: {
    coverageFactor: 2.5,
    hostRefundFactor: 0.5,
    minReserveCoverageRatio: 1.0,
    label: "Conservador",
  },
  balanced: {
    coverageFactor: 2.5,
    hostRefundFactor: 1.0,
    minReserveCoverageRatio: 1.0,
    label: "Balanceado",
  },
  aggressive: {
    coverageFactor: 5.0,
    hostRefundFactor: 1.0,
    minReserveCoverageRatio: 1.5,
    maxRiskScore: 70,
    label: "Agresivo",
  },
};

const DEFAULTS = {
  basePremiumUsd: 20,
  breachProbability: 0.25,
  reserveCoverageRatio: 1.2,
  projectedPortfolioSize: 100,
  ethPriceUsd: 3000,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parsePlanType(raw: unknown): PlanType {
  if (raw === "conservative" || raw === "balanced" || raw === "aggressive") {
    return raw;
  }
  return "balanced";
}

function normalizeRegion(raw: string | undefined): string {
  if (!raw) return "unknown";
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function toNumber(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeRiskScore(metrics?: OracleMetrics, snapshot?: OracleSnapshot): {
  score: number;
  contributors: string[];
} {
  let score = 15;
  const contributors: string[] = [];

  const noise = metrics?.noiseLevelDb;
  if (typeof noise === "number") {
    if (noise > 75) {
      score += 30;
      contributors.push(`Ruido alto (${noise} dB)`);
    } else if (noise > 65) {
      score += 18;
      contributors.push(`Ruido medio-alto (${noise} dB)`);
    } else if (noise <= 45) {
      score -= 6;
      contributors.push(`Ruido bajo (${noise} dB)`);
    }
  }

  const safety = metrics?.safetyIndex;
  if (typeof safety === "number") {
    if (safety < 5) {
      score += 26;
      contributors.push(`Seguridad baja (${safety})`);
    } else if (safety < 7) {
      score += 12;
      contributors.push(`Seguridad media (${safety})`);
    } else if (safety >= 8.5) {
      score -= 6;
      contributors.push(`Seguridad alta (${safety})`);
    }
  }

  if (metrics?.nearbyConstruction === true) {
    score += 22;
    contributors.push("Obras cercanas activas");
  } else if (metrics?.nearbyConstruction === false) {
    score -= 2;
  }

  const oracleRisk = snapshot?.riskScore;
  if (typeof oracleRisk === "number") {
    const normalized = clamp(oracleRisk, 0, 100);
    score += (normalized - 50) * 0.12;
    contributors.push(`RiskScore oracle (${normalized})`);
  }

  const finalScore = clamp(Math.round(score), 0, 100);
  return { score: finalScore, contributors };
}

function computeZoneMultiplier(regionRaw?: string): {
  multiplier: number;
  label: string;
  contributors: string[];
} {
  const normalizedRegion = normalizeRegion(regionRaw);
  const table: Record<string, { multiplier: number; label: string }> = {
    "el poblado": { multiplier: 1.12, label: "El Poblado" },
    laureles: { multiplier: 1.04, label: "Laureles" },
    bello: { multiplier: 1.08, label: "Bello" },
    "la estrella": { multiplier: 1.06, label: "La Estrella" },
    medellin: { multiplier: 1.0, label: "Medellin" },
  };

  const region = table[normalizedRegion] ?? {
    multiplier: 1.0,
    label: regionRaw || "N/A",
  };

  const contributors: string[] = [];
  if (region.multiplier > 1) {
    contributors.push(`Ajuste zona (${region.label}) x${region.multiplier.toFixed(2)}`);
  } else if (region.multiplier < 1) {
    contributors.push(`Ajuste zona (${region.label}) x${region.multiplier.toFixed(2)}`);
  }

  return {
    multiplier: region.multiplier,
    label: region.label,
    contributors,
  };
}

function computeDemandMultiplier(snapshot?: OracleSnapshot): {
  multiplier: number;
  contributors: string[];
} {
  let multiplier = 1;
  const contributors: string[] = [];

  const occupancy = snapshot?.occupancy;
  if (typeof occupancy === "number") {
    if (occupancy >= 80) {
      multiplier += 0.08;
      contributors.push(`Ocupación alta (${occupancy}%)`);
    } else if (occupancy < 50) {
      multiplier -= 0.05;
      contributors.push(`Ocupación baja (${occupancy}%)`);
    }
  }

  const bookings = snapshot?.bookings;
  if (typeof bookings === "number") {
    if (bookings >= 6) {
      multiplier += 0.03;
      contributors.push(`Volumen de reservas alto (${bookings})`);
    } else if (bookings === 0) {
      multiplier -= 0.02;
      contributors.push("Sin reservas activas");
    }
  }

  const avgPrice =
    typeof snapshot?.avgPrice === "number"
      ? snapshot.avgPrice
      : typeof snapshot?.adr === "number"
        ? snapshot.adr
        : undefined;
  if (typeof avgPrice === "number") {
    if (avgPrice >= 120000) {
      multiplier += 0.04;
      contributors.push("Ticket promedio alto");
    } else if (avgPrice < 9000) {
      multiplier -= 0.02;
      contributors.push("Ticket promedio moderado");
    }
  }

  return {
    multiplier: clamp(multiplier, 0.9, 1.2),
    contributors,
  };
}

function riskBand(score: number): "low" | "medium" | "high" {
  if (score < 35) return "low";
  if (score < 70) return "medium";
  return "high";
}

function riskMultiplier(score: number): number {
  if (score < 25) return 0.8;
  if (score < 45) return 1.0;
  if (score < 70) return 1.25;
  if (score < 85) return 1.45;
  return 1.6;
}

function toEth(usdAmount: number, ethPriceUsd: number): number {
  if (ethPriceUsd <= 0) return 0;
  return usdAmount / ethPriceUsd;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function resolveOracleBaseUrl(): string {
  const fromEnv =
    process.env.ORACLE_BASE_URL ||
    process.env.NEXT_PUBLIC_ORACLE_BASE_URL ||
    "http://127.0.0.1:3001";
  return fromEnv.replace(/\/+$/, "");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as QuoteRequestBody;
    const propertyId = String(body.propertyId ?? "").trim();

    if (!propertyId || !/^\d+$/.test(propertyId)) {
      return NextResponse.json(
        { success: false, error: "propertyId must be a numeric value." },
        { status: 400 }
      );
    }

    const planType = parsePlanType(body.planType);
    const plan = PLAN_CONFIG[planType];

    const basePremiumUsd = clamp(
      toNumber(body.basePremiumUsd, DEFAULTS.basePremiumUsd),
      1,
      5000
    );
    const breachProbability = clamp(
      toNumber(body.breachProbability, DEFAULTS.breachProbability),
      0.01,
      0.99
    );
    const reserveCoverageRatio = clamp(
      toNumber(body.reserveCoverageRatio, DEFAULTS.reserveCoverageRatio),
      0.1,
      10
    );
    const projectedPortfolioSize = Math.max(
      1,
      Math.round(toNumber(body.projectedPortfolioSize, DEFAULTS.projectedPortfolioSize))
    );
    const ethPriceUsd = clamp(
      toNumber(body.ethPriceUsd, DEFAULTS.ethPriceUsd),
      100,
      20_000
    );

    const oracleBaseUrl = resolveOracleBaseUrl();
    const oracleUrl = `${oracleBaseUrl}/api/market/${propertyId}`;

    let oracleAddress = "N/A";
    let oracleMetrics: OracleMetrics | undefined;
    let snapshot: OracleSnapshot | undefined;
    let oracleWarning: string | undefined;

    try {
      const oracleResp = await fetch(oracleUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!oracleResp.ok) {
        oracleWarning = `Oracle HTTP ${oracleResp.status}`;
      } else {
        const oracleJson = (await oracleResp.json()) as OracleResponse;
        if (oracleJson.success && oracleJson.data) {
          oracleAddress = oracleJson.data.address || "N/A";
          oracleMetrics = oracleJson.data.metrics;
          snapshot = oracleJson.data.marketSnapshot;
        } else {
          oracleWarning = "Oracle payload did not include success=true";
        }
      }
    } catch (error) {
      oracleWarning =
        error instanceof Error ? error.message : "Oracle request failed";
    }

    const risk = computeRiskScore(oracleMetrics, snapshot);
    const baseRiskMultiplier = riskMultiplier(risk.score);
    const zone = computeZoneMultiplier(snapshot?.region);
    const demand = computeDemandMultiplier(snapshot);
    const multiplier = clamp(
      round2(baseRiskMultiplier * zone.multiplier * demand.multiplier),
      0.7,
      2.5
    );
    const band = riskBand(risk.score);

    const premiumBuyerUsd = round2(basePremiumUsd * multiplier);
    const hostStakeUsd = round2(premiumBuyerUsd);
    const payoutIfYesUsd = round2(premiumBuyerUsd * plan.coverageFactor);
    const hostRefundIfNoUsd = round2(hostStakeUsd * plan.hostRefundFactor);

    const inflow = premiumBuyerUsd + hostStakeUsd;
    const netYes = round2(inflow - payoutIfYesUsd);
    const netNo = round2(inflow - hostRefundIfNoUsd);
    const expectedNetPerPolicy = round2(
      breachProbability * netYes + (1 - breachProbability) * netNo
    );
    const expectedNetPortfolio = round2(expectedNetPerPolicy * projectedPortfolioSize);

    const denominator = payoutIfYesUsd - hostRefundIfNoUsd;
    const breakEvenBreachProb =
      denominator > 0 ? round2((netNo / denominator) * 100) : null;

    const reserveWorstPerPolicy = Math.max(0, payoutIfYesUsd - inflow, hostRefundIfNoUsd - inflow);
    const reserveWorstPortfolio = round2(reserveWorstPerPolicy * projectedPortfolioSize);

    const modeReasons: string[] = [];
    if (reserveCoverageRatio < plan.minReserveCoverageRatio) {
      modeReasons.push(
        `requires reserveCoverageRatio >= ${plan.minReserveCoverageRatio.toFixed(2)}`
      );
    }
    if (plan.maxRiskScore !== undefined && risk.score > plan.maxRiskScore) {
      modeReasons.push(`risk score ${risk.score} exceeds max ${plan.maxRiskScore}`);
    }
    if (expectedNetPerPolicy < 0) {
      modeReasons.push("expected net per policy is negative");
    }
    const modeAllowed = modeReasons.length === 0;
    const modeStatus = modeAllowed ? "enabled" : `blocked: ${modeReasons.join(" · ")}`;

    const suggestedQuestion = `¿Se incumplió la calidad de vida (obras, ruido, seguridad o clima) en la propiedad ID ${propertyId} durante la vigencia de la póliza?`;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      propertyId,
      plan: {
        type: planType,
        label: plan.label,
        modeAllowed,
        modeStatus,
        modeReasons,
        guardrails: {
          minReserveCoverageRatio: plan.minReserveCoverageRatio,
          maxRiskScore: plan.maxRiskScore ?? null,
        },
      },
      oracle: {
        baseUrl: oracleBaseUrl,
        sourceUrl: oracleUrl,
        address: oracleAddress,
        warning: oracleWarning,
        metrics: oracleMetrics ?? null,
      },
      risk: {
        score: risk.score,
        band,
        multiplier: round2(multiplier),
        baseMultiplier: round2(baseRiskMultiplier),
        zoneMultiplier: round2(zone.multiplier),
        demandMultiplier: round2(demand.multiplier),
        region: zone.label,
        contributors: [...risk.contributors, ...zone.contributors, ...demand.contributors],
      },
      pricing: {
        currency: "USD",
        premiumBuyerUsd,
        hostStakeUsd,
        payoutIfYesUsd,
        hostRefundIfNoUsd,
      },
      pricingEthApprox: {
        ethPriceUsd,
        premiumBuyerEth: round6(toEth(premiumBuyerUsd, ethPriceUsd)),
        hostStakeEth: round6(toEth(hostStakeUsd, ethPriceUsd)),
        payoutIfYesEth: round6(toEth(payoutIfYesUsd, ethPriceUsd)),
        hostRefundIfNoEth: round6(toEth(hostRefundIfNoUsd, ethPriceUsd)),
      },
      unitEconomics: {
        breachProbabilityPct: round2(breachProbability * 100),
        netIfYesUsd: netYes,
        netIfNoUsd: netNo,
        expectedNetPerPolicyUsd: expectedNetPerPolicy,
        expectedNetPortfolioUsd: expectedNetPortfolio,
        breakEvenBreachProbabilityPct: breakEvenBreachProb,
      },
      reserve: {
        projectedPortfolioSize,
        reserveCoverageRatio,
        reserveWorstPerPolicyUsd: round2(reserveWorstPerPolicy),
        reserveWorstPortfolioUsd: reserveWorstPortfolio,
      },
      suggestedQuestion,
      trace: {
        planCoverageFactor: plan.coverageFactor,
        hostRefundFactor: plan.hostRefundFactor,
        minReserveCoverageRatio: plan.minReserveCoverageRatio,
        maxRiskScore: plan.maxRiskScore ?? null,
        zoneMultiplier: round2(zone.multiplier),
        demandMultiplier: round2(demand.multiplier),
        baseRiskMultiplier: round2(baseRiskMultiplier),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown quote error",
      },
      { status: 500 }
    );
  }
}
