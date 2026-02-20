#!/usr/bin/env node

/**
 * FairLease Flight Oracle Server — v3.0
 *
 * Endpoints (unchanged from v2):
 *   GET /health
 *   GET /api/flights
 *   GET /api/flight-delay/:flightId?date=YYYY-MM-DD&threshold=45
 *
 * Environment variables:
 *   PORT                    Server port (default: 3101)
 *   ALLOW_ORIGIN            CORS origin (default: *)
 *   FLIGHT_ORACLE_MODE      demo | live | hybrid  (default: demo)
 *   FLIGHT_PROVIDER         aviationstack | flightaware (default: aviationstack)
 *   FLIGHT_API_KEY          Live provider API key
 *   FLIGHT_API_BASE_URL     Override provider base URL (optional)
 *   FLIGHT_LIVE_TIMEOUT_MS  Per-request timeout for live calls (default: 8000)
 *   FLIGHT_LIVE_CACHE_TTL_SEC Cache TTL for live responses (default: 300 = 5 min)
 *   FLIGHT_DELAY_THRESHOLD_MINUTES  Default delay threshold (default: 45)
 *   PAYOUT_TIER1_PERCENT    Tier 1 payout % (default: 50)
 *   PAYOUT_TIER2_PERCENT    Tier 2 payout % (default: 100)
 *   TIER2_MULTIPLIER        Tier 2 multiplier vs threshold (default: 2)
 *
 * Fallback: live failure → fixture demo with source/fallbackReason in response.
 */

const http = require("http");
const url = require("url");

// ── Config ──
const PORT                         = Number(process.env.PORT || 3101);
const ALLOW_ORIGIN                 = process.env.ALLOW_ORIGIN || "*";
const FLIGHT_ORACLE_MODE           = (process.env.FLIGHT_ORACLE_MODE || "demo").toLowerCase();
const FLIGHT_PROVIDER              = (process.env.FLIGHT_PROVIDER || "aviationstack").toLowerCase();
const FLIGHT_API_KEY               = (process.env.FLIGHT_API_KEY || "").trim();
const FLIGHT_API_BASE_URL          = (process.env.FLIGHT_API_BASE_URL || "").trim();
const FLIGHT_LIVE_TIMEOUT_MS       = Math.max(1000, Number(process.env.FLIGHT_LIVE_TIMEOUT_MS || 8000));
const FLIGHT_LIVE_CACHE_TTL_SEC    = Math.max(0, Number(process.env.FLIGHT_LIVE_CACHE_TTL_SEC || 300));
const FLIGHT_DELAY_THRESHOLD_MINUTES = Number(process.env.FLIGHT_DELAY_THRESHOLD_MINUTES || 45);
const PAYOUT_TIER1_PERCENT         = Number(process.env.PAYOUT_TIER1_PERCENT || 50);
const PAYOUT_TIER2_PERCENT         = Number(process.env.PAYOUT_TIER2_PERCENT || 100);
const TIER2_MULTIPLIER             = Number(process.env.TIER2_MULTIPLIER || 2);

// ── In-memory cache ──
// Key: `${flightId}:${date}` → { data, expiresAt }
const liveCache = new Map();

function cacheGet(flightId, date) {
  const key = `${flightId}:${date}`;
  const entry = liveCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    liveCache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(flightId, date, data) {
  if (FLIGHT_LIVE_CACHE_TTL_SEC <= 0) return;
  const key = `${flightId}:${date}`;
  liveCache.set(key, {
    data,
    expiresAt: Date.now() + FLIGHT_LIVE_CACHE_TTL_SEC * 1000,
  });
}

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

// ── Utility ──
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

// ── Breach Evaluation ──
function evaluateFlightBreach(data, thresholdMinutes) {
  const threshold = thresholdMinutes || FLIGHT_DELAY_THRESHOLD_MINUTES;
  const tier2Threshold = threshold * TIER2_MULTIPLIER;

  if (!data) {
    return { breachDetected: false, payoutPercent: 0, payoutTier: 0, reason: "No flight data" };
  }

  const status = String(data.status || "").toUpperCase();

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
      reason: typeof delay === "number"
        ? `Delay ${delay} min < threshold ${threshold} min`
        : "No delay data",
    };
  }

  if (delay >= tier2Threshold) {
    return {
      breachDetected: true,
      payoutPercent: PAYOUT_TIER2_PERCENT,
      payoutTier: 2,
      reason: `Delay ${delay} min >= ${tier2Threshold} min (2x threshold) - full payout (${PAYOUT_TIER2_PERCENT}%)`,
    };
  }

  return {
    breachDetected: true,
    payoutPercent: PAYOUT_TIER1_PERCENT,
    payoutTier: 1,
    reason: `Delay ${delay} min >= ${threshold} min - partial payout (${PAYOUT_TIER1_PERCENT}%)`,
  };
}

// ── Provider Adapters ──

/**
 * AviationStack adapter.
 * Docs: https://aviationstack.com/documentation
 * Response shape: { data: [{ flight_date, flight_status, departure, arrival, flight }] }
 */
async function fetchAviationStack(flightId, date, timeoutMs) {
  const base = FLIGHT_API_BASE_URL || "http://api.aviationstack.com/v1";
  const endpoint = new URL("/flights", base);
  endpoint.searchParams.set("access_key", FLIGHT_API_KEY);
  endpoint.searchParams.set("flight_iata", flightId);
  if (date) endpoint.searchParams.set("flight_date", date);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(endpoint.toString(), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) throw new Error(`AviationStack HTTP ${resp.status}`);
  const json = await resp.json();

  if (!json || !Array.isArray(json.data) || json.data.length === 0) {
    throw new Error("AviationStack returned no flights");
  }

  const f = json.data[0];
  const depDelay = f.departure?.delay ? Number(f.departure.delay) : null;

  return {
    flightId,
    airline: f.airline?.name || "Unknown",
    flightNumber: f.flight?.iata || flightId,
    departureAirport: f.departure?.iata || "N/A",
    arrivalAirport: f.arrival?.iata || "N/A",
    scheduledDepartureUtc: f.departure?.scheduled || null,
    actualDepartureUtc: f.departure?.actual || null,
    scheduledArrivalUtc: f.arrival?.scheduled || null,
    actualArrivalUtc: f.arrival?.actual || null,
    status: (f.flight_status || "UNKNOWN").toUpperCase(),
    delayMinutes: depDelay,
    officialSourceUrl: "https://aviationstack.com/",
    source: "live-aviationstack-v1",
  };
}

/**
 * FlightAware AeroAPI adapter.
 * Docs: https://www.flightaware.com/aeroapi/portal/documentation
 * Response shape: { flights: [{ ident, status, scheduled_out, actual_out, ... }] }
 */
async function fetchFlightAware(flightId, date, timeoutMs) {
  const base = FLIGHT_API_BASE_URL || "https://aeroapi.flightaware.com/aeroapi";
  const endpoint = new URL(`/flights/${encodeURIComponent(flightId)}`, base);
  if (date) endpoint.searchParams.set("start", `${date}T00:00:00Z`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(endpoint.toString(), {
      headers: {
        "x-apikey": FLIGHT_API_KEY,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) throw new Error(`FlightAware HTTP ${resp.status}`);
  const json = await resp.json();

  if (!json || !Array.isArray(json.flights) || json.flights.length === 0) {
    throw new Error("FlightAware returned no flights");
  }

  const f = json.flights[0];
  const sched = f.scheduled_out ? new Date(f.scheduled_out) : null;
  const actual = f.actual_out ? new Date(f.actual_out) : null;
  let delayMinutes = null;
  if (sched && actual) {
    delayMinutes = Math.round((actual.getTime() - sched.getTime()) / 60000);
    if (delayMinutes < 0) delayMinutes = 0;
  }

  const rawStatus = String(f.status || "").toUpperCase();
  let status = "UNKNOWN";
  if (rawStatus.includes("CANCEL")) status = "CANCELLED";
  else if (delayMinutes !== null && delayMinutes >= FLIGHT_DELAY_THRESHOLD_MINUTES) status = "DELAYED";
  else if (f.actual_out) status = "ON_TIME";

  return {
    flightId,
    airline: f.operator || "Unknown",
    flightNumber: f.ident || flightId,
    departureAirport: f.origin?.code_iata || "N/A",
    arrivalAirport: f.destination?.code_iata || "N/A",
    scheduledDepartureUtc: f.scheduled_out || null,
    actualDepartureUtc: f.actual_out || null,
    scheduledArrivalUtc: f.scheduled_in || null,
    actualArrivalUtc: f.actual_in || null,
    status,
    delayMinutes,
    officialSourceUrl: "https://flightaware.com/",
    source: "live-flightaware-v1",
  };
}

/**
 * Generic adapter for FLIGHT_API_BASE_URL without a specific provider.
 * Expects response: { data: { ...flightFields } }
 */
async function fetchGeneric(flightId, date, timeoutMs) {
  const base = FLIGHT_API_BASE_URL;
  if (!base) throw new Error("FLIGHT_API_BASE_URL is not configured");

  const endpoint = new URL("/flight-delay", base);
  endpoint.searchParams.set("flightId", flightId);
  if (date) endpoint.searchParams.set("date", date);

  const headers = { Accept: "application/json" };
  if (FLIGHT_API_KEY) {
    headers.Authorization = `Bearer ${FLIGHT_API_KEY}`;
    headers["X-API-Key"] = FLIGHT_API_KEY;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(endpoint.toString(), { method: "GET", headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) throw new Error(`Generic provider HTTP ${resp.status}`);
  const json = await resp.json();
  if (!json?.data) throw new Error("Generic provider returned invalid payload");

  const d = json.data;
  return {
    flightId,
    airline: d.airline || "Unknown",
    flightNumber: d.flightNumber || flightId,
    departureAirport: d.departureAirport || "N/A",
    arrivalAirport: d.arrivalAirport || "N/A",
    scheduledDepartureUtc: d.scheduledDepartureUtc || null,
    actualDepartureUtc: d.actualDepartureUtc || null,
    scheduledArrivalUtc: d.scheduledArrivalUtc || null,
    actualArrivalUtc: d.actualArrivalUtc || null,
    status: d.status || "UNKNOWN",
    delayMinutes: typeof d.delayMinutes === "number" ? d.delayMinutes : null,
    officialSourceUrl: d.officialSourceUrl || endpoint.origin,
    source: "live-provider-v1",
  };
}

async function fetchLiveFlightStatus(flightId, date) {
  // Check cache first
  const cached = cacheGet(flightId, date);
  if (cached) {
    return { ...cached, source: `${cached.source || "live"}+cached` };
  }

  let data;
  if (FLIGHT_API_BASE_URL && FLIGHT_PROVIDER !== "aviationstack" && FLIGHT_PROVIDER !== "flightaware") {
    data = await fetchGeneric(flightId, date, FLIGHT_LIVE_TIMEOUT_MS);
  } else if (FLIGHT_PROVIDER === "flightaware") {
    data = await fetchFlightAware(flightId, date, FLIGHT_LIVE_TIMEOUT_MS);
  } else {
    // Default: aviationstack
    data = await fetchAviationStack(flightId, date, FLIGHT_LIVE_TIMEOUT_MS);
  }

  cacheSet(flightId, date, data);
  return data;
}

// ── Resolution Logic ──
async function resolveFlightData(flightId, date) {
  const normalized = normalizeFlightId(flightId);
  if (!normalized) {
    return {
      ok: false,
      statusCode: 400,
      payload: { success: false, error: "Missing flightId. Use /api/flight-delay/:flightId" },
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
    if (!FLIGHT_API_KEY && !FLIGHT_API_BASE_URL) {
      return {
        ok: false,
        statusCode: 502,
        payload: {
          success: false,
          error: "Live mode requires FLIGHT_API_KEY or FLIGHT_API_BASE_URL",
          fallbackReason: "missing-credentials",
        },
      };
    }
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
          fallbackReason: error.name === "AbortError" ? "live-timeout" : "live-error",
        },
      };
    }
  }

  // hybrid: live first, fallback to fixture
  try {
    if (!FLIGHT_API_KEY && !FLIGHT_API_BASE_URL) throw new Error("no credentials configured");
    const live = await fetchLiveFlightStatus(normalized, date);
    return { ok: true, payload: { success: true, data: live } };
  } catch (error) {
    const fallbackReason = error.name === "AbortError"
      ? "live-timeout"
      : `live-unavailable: ${error.message}`;
    return {
      ok: true,
      payload: {
        success: true,
        data: {
          ...fallback(),
          fallbackReason,
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

// ── HTTP Handler ──
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
    res.end(JSON.stringify({
      ok: true,
      service: "fairlease-flight-oracle",
      version: "3.0.0",
      mode: FLIGHT_ORACLE_MODE,
      provider: FLIGHT_ORACLE_MODE === "demo" ? "fixture" : FLIGHT_PROVIDER,
      thresholdMinutes: FLIGHT_DELAY_THRESHOLD_MINUTES,
      graduatedPayout: {
        tier1: `${PAYOUT_TIER1_PERCENT}% at >= ${FLIGHT_DELAY_THRESHOLD_MINUTES} min`,
        tier2: `${PAYOUT_TIER2_PERCENT}% at >= ${FLIGHT_DELAY_THRESHOLD_MINUTES * TIER2_MULTIPLIER} min`,
        cancelled: `${PAYOUT_TIER2_PERCENT}% always`,
      },
      liveConfigured: Boolean(FLIGHT_API_KEY || FLIGHT_API_BASE_URL),
      cacheTtlSec: FLIGHT_LIVE_CACHE_TTL_SEC,
      liveTimeoutMs: FLIGHT_LIVE_TIMEOUT_MS,
      port: PORT,
      availableFixtures: Object.keys(FLIGHT_FIXTURES).filter((k) => k !== "DEFAULT"),
    }));
    return;
  }

  // List fixtures
  if (pathname === "/api/flights") {
    const flights = Object.entries(FLIGHT_FIXTURES)
      .filter(([key]) => key !== "DEFAULT")
      .map(([key, data]) => ({
        flightId: key,
        airline: data.airline,
        route: `${data.departureAirport} -> ${data.arrivalAirport}`,
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
    const queryThreshold = query.threshold ? Number(query.threshold) : undefined;

    const resolution = await resolveFlightData(flightId, date);
    if (!resolution.ok) {
      res.statusCode = resolution.statusCode || 500;
      res.end(JSON.stringify(resolution.payload));
      return;
    }

    const envelope = buildEnvelope(resolution.payload.data, date, queryThreshold);
    const d = envelope.data;

    const fallbackTag = d.fallbackReason ? ` [FALLBACK: ${d.fallbackReason}]` : "";
    console.log(`[Oracle] ${d.flightId} | ${d.status} | Delay: ${d.delayMinutes ?? "N/A"} min | src: ${d.source || "?"}${fallbackTag}`);
    console.log(`  -> Tier: ${d.payoutTier} | ${d.payoutPercent}% | ${d.payoutReason}`);

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
    res.end(JSON.stringify({ success: false, error: error.message || "Internal error" }));
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`
FairLease Flight Oracle v3.0
-----------------------------------------
Port:        ${PORT}
CORS:        ${ALLOW_ORIGIN}
Mode:        ${FLIGHT_ORACLE_MODE}
Provider:    ${FLIGHT_ORACLE_MODE === "demo" ? "fixture" : FLIGHT_PROVIDER}
Threshold:   ${FLIGHT_DELAY_THRESHOLD_MINUTES} min (tier 1 = ${PAYOUT_TIER1_PERCENT}%)
Tier 2:      ${FLIGHT_DELAY_THRESHOLD_MINUTES * TIER2_MULTIPLIER} min (= ${PAYOUT_TIER2_PERCENT}%)
Cancelled:   ${PAYOUT_TIER2_PERCENT}% always
Cache TTL:   ${FLIGHT_LIVE_CACHE_TTL_SEC}s
Live timeout: ${FLIGHT_LIVE_TIMEOUT_MS}ms
Live API:    ${FLIGHT_API_KEY ? "*** configured ***" : "(not configured - demo fallback)"}
Fixtures:    ${Object.keys(FLIGHT_FIXTURES).filter((k) => k !== "DEFAULT").join(", ")}
-----------------------------------------
Ready. Endpoints: /health  /api/flights  /api/flight-delay/:flightId
`);
});
