import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

type FlightRiskRoute = {
  route: string;
  samples: number;
  insufficientSample: boolean;
  pAnyHat: number;
  pAnyCi95Lower: number;
  pAnyCi95Upper: number;
  pTier1: number;
  pTier1Ci95Lower: number;
  pTier1Ci95Upper: number;
  pTier2: number;
  pTier2Ci95Lower: number;
  pTier2Ci95Upper: number;
  breakEvenPremium: number;
  recommendedPremium: number;
  ticketPrice: number;
  sampleFlightIds: string;
};

function toNumber(value: string | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  const csvPath = path.join(process.cwd(), "artifacts", "flight-risk-routes.csv");

  try {
    const [raw, stat] = await Promise.all([
      fs.readFile(csvPath, "utf8"),
      fs.stat(csvPath),
    ]);
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      return NextResponse.json({
        success: false,
        error: "No route data found in CSV",
      }, { status: 404 });
    }

    const headers = lines[0].split(",");
    const rows: FlightRiskRoute[] = lines.slice(1).map((line) => {
      const cols = line.split(",");
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = cols[i] ?? "";
      });
      return {
        route: row.route || "N/A",
        samples: toNumber(row.samples),
        insufficientSample: (row.insufficient_sample || "").toLowerCase() === "yes",
        pAnyHat: toNumber(row.p_any_hat),
        pAnyCi95Lower: toNumber(row.p_any_ci95_lower),
        pAnyCi95Upper: toNumber(row.p_any_ci95_upper),
        pTier1: toNumber(row.p_tier1),
        pTier1Ci95Lower: toNumber(row.p_tier1_ci95_lower),
        pTier1Ci95Upper: toNumber(row.p_tier1_ci95_upper),
        pTier2: toNumber(row.p_tier2),
        pTier2Ci95Lower: toNumber(row.p_tier2_ci95_lower),
        pTier2Ci95Upper: toNumber(row.p_tier2_ci95_upper),
        breakEvenPremium: toNumber(row.break_even_premium),
        recommendedPremium: toNumber(row.recommended_premium),
        ticketPrice: toNumber(row.ticket_price),
        sampleFlightIds: row.sample_flight_ids || "",
      };
    });

    rows.sort((a, b) => b.samples - a.samples);

    return NextResponse.json({
      success: true,
      sourcePath: "artifacts/flight-risk-routes.csv",
      generatedAt: stat.mtime.toISOString(),
      count: rows.length,
      routes: rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read artifacts/flight-risk-routes.csv",
      },
      { status: 500 }
    );
  }
}
