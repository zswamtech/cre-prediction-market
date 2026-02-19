#!/usr/bin/env node

/**
 * FairLease Flight Oracle Server
 *
 * Independent flight delay oracle for Chainlink CRE integration.
 * Serves flight delay data at /api/flight-delay/:flightId
 *
 * Supports graduated payout tiers:
 *   - Tier 1: delay >= threshold (default 45 min) → 50% payout
 *   - Tier 2: delay >= 2x threshold (default 90 min) → 100% payout
 *   - Cancelled flights → 100% payout always
 *
 * Modes: demo (fixtures) | live (external API) | hybrid (live with fixture fallback)
 *
 * Default port: 3101 (avoids conflict with property oracle on 3001 and frontend on 3000)
 *
 * Usage:
 *   node scripts/server-flight-oracle.js
 *   PORT=3101 FLIGHT_ORACLE_MODE=demo node scripts/server-flight-oracle.js
 */

const http = require("http");
const url = require("url");

const PORT = Number(process.env.PORT || 3101);
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const FLIGHT_ORACLE_MODE = (process.env.FLIGHT_ORACLE_MODE || "demo").toLowerCase();
const FLIGHT_DELAY_THRESHOLD_MINUTES = Number(
  process.env.FLIGHT_DELAY_THRESHOLD_MINUTES || 45
);
const FLIGHT_API_BASE_URL = (process.env.FLIGHT_API_BASE_URL || "").trim();
const FLIGHT_API_KEY = (process.env.FLIGHT_API_KEY || "").trim();

// ── Graduated Payout Configuration ──
// Tier 1: delay >= threshold → 50% payout
// Tier 2: delay >= threshold * TIER2_MULTIPLIER → 100% payout
// Cancelled → always 100%
const PAYOUT_TIER1_PERCENT = Number(process.env.PAYOUT_TIER1_PERCENT || 50);
const PAYOUT_TIER2_PERCENT = Number(process.env.PAYOUT_TIER2_PERCENT || 100);
const TIER2_MULTIPLIER = Number(process.env.TIER2_MULTIPLIER || 2);

// ── Flight Fixtures (Demo Data) ──
const FLIGHT_FIXTURES = {
  AV8520: {
    airline: "Avianca",
    flightNumber: "AV8520",
    departureAirport: "MDE",
    arrivalAirport: "BOG",
    scheduledDepartureUtc: "2026-02-13T15:40:00Z",
    actualDepartureUtc: "2026-02-13T16:55:00Z",
    scheduledArrivalUtc: "2026-02-13T16:40:00Z",
    actualArrivalUtc: "2026-02-13T17:58:00Z",
    status: "DELAYED",
    delayMinutes: 78,
    officialSourceUrl: "https://www.flightaware.com/",
  },
  LA4112: {
    airline: "LATAM",
    flightNumber: "LA4112",
    departureAirport: "MDE",
    arrivalAirport: "CTG",
    scheduledDepartureUtc: "2026-02-13T14:25:00Z",
    actualDepartureUtc: "2026-02-13T14:32:00Z",
    scheduledArrivalUtc: "2026-02-13T15:28:00Z",
    actualArrivalUtc: "2026-02-13T15:36:00Z",
    status: "ON_TIME",
    delayMinutes: 8,
    officialSourceUrl: "https://www.flightaware.com/",
  },
  CM0178: {
    airline: "Copa",
    flightNumber: "CM0178",
    departureAirport: "MDE",
    arrivalAirport: "PTY",
    scheduledDepartureUtc: "2026-02-13T18:05:00Z",
    actualDepartureUtc: null,
    scheduledArrivalUtc: "2026-02-13T19:26:00Z",
    actualArrivalUtc: null,
    status: "CANCELLED",
    delayMinutes: null,
    officialSourceUrl: "https://www.flightaware.com/",
  },
  // Additional demo: moderate delay (exactly at threshold boundary)
  AA1234: {
    airline: "American Airlines",
    flightNumber: "AA1234",
    departureAirport: "MDE",
    arrivalAirport: "MIA",
    scheduledDepartureUtc: "2026-02-15T08:00:00Z",
    actualDepartureUtc: "2026-02-15T08:47:00Z",
    scheduledArrivalUtc: "2026-02-15T12:30:00Z",
    actualArrivalUtc: "2026-02-15T13:15:00Z",
    status: "DELAYED",
    delayMinutes: 45,
    officialSourceUrl: "https://www.flightaware.com/",
  },
  // Additional demo: severe delay (>= 2x threshold → 100% payout)
  UA5678: {
    airline: "United",
    flightNumber: "UA5678",
    departureAirport: "BOG",
    arrivalAirport: "EWR",
    scheduledDepartureUtc: "2026-02-15T22:00:00Z",
    actualDepartureUtc: "2026-02-16T00:10:00Z",
    scheduledArrivalUtc: "2026-02-16T05:30:00Z",
    actualArrivalUtc: "2026-02-16T07:40:00Z",
    status: "DELAYED",
    delayMinutes: 130,
    officialSourceUrl: "https://www.flightaware.com/",
  },
  DEFAULT: {
    airline: "Unknown",
    flightNumber: "UNKNOWN",
    departureAirport: "N/A",
    arrivalAirport: "N/A",
    scheduledDepartureUtc: null,
    actualDepartureUtc: null,
    scheduledArrivalUtc: null,
    actualArrivalUtc: null,
    status: "UNKNOWN",
    delayMinutes: 0,
    officialSourceUrl: "https://www.flightaware.com/",
  },
};

// ── Utility Functions ──

function normalizeFlightId(rawFlightId) {
  return String(rawFlightId || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
}

function getFixture(flightId) {
  const normalized = normalizeFlightId(flightId);
  return {
    flightId: normalized || "UNKNOWN",
    ...(FLIGHT_FIXTURES[normalized] || FLIGHT_FIXTURES.DEFAULT),
  };
}

/**
 * Evaluate flight breach with graduated payout tiers.
 *
 * Returns:
 *   { breachDetected, payoutPercent, payoutTier, reason }
 *
 * - No breach: { breachDetected: false, payoutPercent: 0, payoutTier: 0 }
 * - Cancelled: { breachDetected: true, payoutPercent: 100, payoutTier: 2, reason: "CANCELLED" }
 * - Tier 1 (delay >= threshold): { breachDetected: true, payoutPercent: 50, payoutTier: 1 }
 * - Tier 2 (delay >= 2x threshold): { breachDetected: true, payoutPercent: 100, payoutTier: 2 }
 */
function evaluateFlightBreach(data, thresholdMinutes) {
  const threshold = thresholdMinutes || FLIGHT_DELAY_THRESHOLD_MINUTES;
  const tier2Threshold = threshold * TIER2_MULTIPLIER;

  if (!data) {
    return {
      breachDetected: false,
      payoutPercent: 0,
      payoutTier: 0,
      reason: "No flight data available",
    };
  }

  const status = String(data.status || "").toUpperCase();

  // Cancelled flights → always 100% payout
  if (status === "CANCELLED") {
    return {
      breachDetected: true,
      payoutPercent: PAYOUT_TIER2_PERCENT,
      payoutTier: 2,
      reason: `Flight cancelled - full payout (${PAYOUT_TIER2_PERCENT}%)`,
    };
  }

  const delay = data.delayMinutes;

  if (typeof delay !== "number" || delay < threshold) {
    return {
      breachDetected: false,
      payoutPercent: 0,
      payoutTier: 0,
      reason:
        typeof delay === "number"
          ? `Delay ${delay} min < threshold ${threshold} min`
          : "No delay data",
    };
  }

  // Tier 2: severe delay (>= 2x threshold)
  if (delay >= tier2Threshold) {
    return {
      breachDetected: true,
      payoutPercent: PAYOUT_TIER2_PERCENT,
      payoutTier: 2,
      reason: `Delay ${delay} min >= ${tier2Threshold} min (2x threshold) - full payout (${PAYOUT_TIER2_PERCENT}%)`,
    };
  }

  // Tier 1: moderate delay (>= threshold but < 2x threshold)
  return {
    breachDetected: true,
    payoutPercent: PAYOUT_TIER1_PERCENT,
    payoutTier: 1,
    reason: `Delay ${delay} min >= ${threshold} min - partial payout (${PAYOUT_TIER1_PERCENT}%)`,
  };
}

// ── Live Flight API ──

async function fetchLiveFlightStatus(flightId, date) {
  if (!FLIGHT_API_BASE_URL) {
    throw new Error("FLIGHT_API_BASE_URL is not configured");
  }

  const endpoint = new URL("/flight-delay", FLIGHT_API_BASE_URL);
  endpoint.searchParams.set("flightId", flightId);
  endpoint.searchParams.set("date", date);

  const headers = { Accept: "application/json" };
  if (FLIGHT_API_KEY) {
    headers.Authorization = `Bearer ${FLIGHT_API_KEY}`;
    headers["X-API-Key"] = FLIGHT_API_KEY;
  }

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Live provider HTTP ${response.status}`);
  }

  const json = await response.json();
  if (!json || !json.data) {
    throw new Error("Live provider returned invalid payload");
  }

  const data = json.data;
  return {
    flightId,
    airline: data.airline || "Unknown",
    flightNumber: data.flightNumber || flightId,
    departureAirport: data.departureAirport || "N/A",
    arrivalAirport: data.arrivalAirport || "N/A",
    scheduledDepartureUtc: data.scheduledDepartureUtc || null,
    actualDepartureUtc: data.actualDepartureUtc || null,
    scheduledArrivalUtc: data.scheduledArrivalUtc || null,
    actualArrivalUtc: data.actualArrivalUtc || null,
    status: data.status || "UNKNOWN",
    delayMinutes: typeof data.delayMinutes === "number" ? data.delayMinutes : null,
    officialSourceUrl: data.officialSourceUrl || endpoint.origin,
    source: "live-provider-v1",
  };
}

// ── Resolution Logic (demo/live/hybrid) ──

async function resolveFlightData(flightId, date) {
  const normalized = normalizeFlightId(flightId);
  if (!normalized) {
    return {
      ok: false,
      statusCode: 400,
      payload: {
        success: false,
        error: "Missing flightId. Use /api/flight-delay/:flightId",
      },
    };
  }

  const fallback = () => ({
    ...getFixture(normalized),
    source: "flight-fixture-v1",
  });

  if (FLIGHT_ORACLE_MODE === "demo") {
    return { ok: true, payload: { success: true, data: fallback() } };
  }

  if (FLIGHT_ORACLE_MODE === "live") {
    try {
      const live = await fetchLiveFlightStatus(normalized, date);
      return { ok: true, payload: { success: true, data: live } };
    } catch (error) {
      return {
        ok: false,
        statusCode: 502,
        payload: {
          success: false,
          error: `Live mode failed: ${error.message}`,
        },
      };
    }
  }

  // hybrid: live first, fallback to fixture
  try {
    const live = await fetchLiveFlightStatus(normalized, date);
    return { ok: true, payload: { success: true, data: live } };
  } catch (error) {
    return {
      ok: true,
      payload: {
        success: true,
        data: {
          ...fallback(),
          warning: `Live source unavailable, fallback applied: ${error.message}`,
        },
      },
    };
  }
}

// ── Response Envelope ──

function buildEnvelope(data, date, queryThreshold) {
  const threshold = queryThreshold || FLIGHT_DELAY_THRESHOLD_MINUTES;
  const breach = evaluateFlightBreach(data, threshold);

  return {
    success: true,
    data: {
      ...data,
      date,
      thresholdMinutes: threshold,
      tier2ThresholdMinutes: threshold * TIER2_MULTIPLIER,
      breachDetected: breach.breachDetected,
      expectedVerdict: breach.breachDetected ? "YES" : "NO",
      payoutPercent: breach.payoutPercent,
      payoutTier: breach.payoutTier,
      payoutReason: breach.reason,
      evaluatedAt: new Date().toISOString(),
      delay: typeof data.delayMinutes === "number" ? data.delayMinutes : null,
    },
  };
}

// ── HTTP Server ──

async function handler(req, res) {
  const parsedUrl = url.parse(req.url || "/", true);
  const pathname = parsedUrl.pathname || "/";
  const query = parsedUrl.query || {};

  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Health check
  if (pathname === "/" || pathname === "/health") {
    res.end(
      JSON.stringify({
        ok: true,
        service: "fairlease-flight-oracle",
        version: "2.0.0",
        mode: FLIGHT_ORACLE_MODE,
        thresholdMinutes: FLIGHT_DELAY_THRESHOLD_MINUTES,
        graduatedPayout: {
          tier1: `${PAYOUT_TIER1_PERCENT}% at >= ${FLIGHT_DELAY_THRESHOLD_MINUTES} min`,
          tier2: `${PAYOUT_TIER2_PERCENT}% at >= ${FLIGHT_DELAY_THRESHOLD_MINUTES * TIER2_MULTIPLIER} min`,
          cancelled: `${PAYOUT_TIER2_PERCENT}% always`,
        },
        liveConfigured: Boolean(FLIGHT_API_BASE_URL),
        port: PORT,
        availableFixtures: Object.keys(FLIGHT_FIXTURES).filter(
          (k) => k !== "DEFAULT"
        ),
      })
    );
    return;
  }

  // List all available demo flights
  if (pathname === "/api/flights") {
    const flights = Object.entries(FLIGHT_FIXTURES)
      .filter(([key]) => key !== "DEFAULT")
      .map(([key, data]) => ({
        flightId: key,
        airline: data.airline,
        route: `${data.departureAirport} → ${data.arrivalAirport}`,
        status: data.status,
        delayMinutes: data.delayMinutes,
      }));
    res.end(JSON.stringify({ success: true, flights }));
    return;
  }

  // Flight delay API
  if (pathname === "/api/flight-delay" || pathname.startsWith("/api/flight-delay/")) {
    const pathFlightId = pathname.startsWith("/api/flight-delay/")
      ? pathname.split("/").pop()
      : "";
    const flightId = query.flightId || pathFlightId;
    const date = String(query.date || new Date().toISOString().slice(0, 10));
    const queryThreshold = query.threshold
      ? Number(query.threshold)
      : undefined;

    const resolution = await resolveFlightData(flightId, date);
    if (!resolution.ok) {
      res.statusCode = resolution.statusCode || 500;
      res.end(JSON.stringify(resolution.payload));
      return;
    }

    const envelope = buildEnvelope(
      resolution.payload.data,
      date,
      queryThreshold
    );

    const d = envelope.data;
    console.log(`[Flight Oracle] ${d.flightId} | ${d.status} | Delay: ${d.delayMinutes ?? "N/A"} min`);
    console.log(
      `  → Breach: ${d.breachDetected} | Tier: ${d.payoutTier} | Payout: ${d.payoutPercent}% | ${d.payoutReason}`
    );

    res.end(JSON.stringify(envelope));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ success: false, error: "Not Found" }));
}

const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        error: error.message || "Internal error",
      })
    );
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`
✈️  FAIRLEASE FLIGHT ORACLE v2.0
───────────────────────────────────────
Port:       ${PORT}
CORS:       ${ALLOW_ORIGIN}
Mode:       ${FLIGHT_ORACLE_MODE}
Threshold:  ${FLIGHT_DELAY_THRESHOLD_MINUTES} min (tier 1 = ${PAYOUT_TIER1_PERCENT}%)
Severe:     ${FLIGHT_DELAY_THRESHOLD_MINUTES * TIER2_MULTIPLIER} min (tier 2 = ${PAYOUT_TIER2_PERCENT}%)
Cancelled:  ${PAYOUT_TIER2_PERCENT}% always
Live API:   ${FLIGHT_API_BASE_URL || "(not configured)"}
Fixtures:   ${Object.keys(FLIGHT_FIXTURES).filter((k) => k !== "DEFAULT").join(", ")}
───────────────────────────────────────
Ready to serve flight delay signals to Chainlink CRE
`);
});
