import {
  cre,
  consensusIdenticalAggregation,
  ok,
  type HTTPSendRequester,
  type NodeRuntime,
  type Runtime,
} from "@chainlink/cre-sdk";
import {
  evaluateFlightDelayBreach,
  evaluateQualityOfLifeBreach,
  type DecisionTrace,
  type FlightDelayInput,
  type OracleMetricsInput,
  type WeatherMetricsInput,
} from "./decisionEngine";

type WeatherConfig = {
  latitude?: number;
  longitude?: number;
  timezone?: string;
};

type FlightApiConfig = {
  useConfidentialHttp?: boolean;
  providerBaseUrl?: string;
  providerPathTemplate?: string;
  providerDateQueryParam?: string;
  secretId?: string;
  secretNamespace?: string;
};

type Config = {
  geminiModel: string;
  oracleBaseUrl?: string;
  weather?: WeatherConfig;
  flightApi?: FlightApiConfig;
  evms: Array<{
    marketAddress: string;
    chainSelectorName: string;
    gasLimit: string;
  }>;
};

interface GeminiData {
  system_instruction: {
    parts: Array<{ text: string }>;
  };
  contents: Array<{
    parts: Array<{ text: string }>;
  }>;
  tools?: Array<{
    google_search?: Record<string, never>;
  }>;
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  responseId?: string;
}

interface OracleApiResponse {
  success?: boolean;
  data?: {
    address?: string;
    metrics?: {
      noiseLevelDb?: number;
      safetyIndex?: number;
      nearbyConstruction?: boolean;
      publicTransportStatus?: string;
    };
  };
}

interface FlightDelayApiResponse {
  success?: boolean;
  data?: {
    flightId?: string;
    airline?: string;
    flightNumber?: string;
    departureAirport?: string;
    arrivalAirport?: string;
    scheduledDepartureUtc?: string | null;
    actualDepartureUtc?: string | null;
    scheduledArrivalUtc?: string | null;
    actualArrivalUtc?: string | null;
    status?: string;
    delayMinutes?: number | null;
    officialSourceUrl?: string;
    source?: string;
    date?: string;
    thresholdMinutes?: number;
    breachDetected?: boolean;
    expectedVerdict?: "YES" | "NO";
    evaluatedAt?: string;
    // Graduated payout (oracle v2)
    payoutPercent?: number;
    payoutTier?: number;
    payoutReason?: string;
    tier2ThresholdMinutes?: number;
  };
}

interface FlightProviderApiResponse {
  success?: boolean;
  data?: {
    flightId?: string;
    airline?: string;
    flightNumber?: string;
    departureAirport?: string;
    arrivalAirport?: string;
    status?: string;
    delayMinutes?: number | null;
    delay?: number | null;
    thresholdMinutes?: number;
    date?: string;
    officialSourceUrl?: string;
    // Graduated payout (oracle v2)
    payoutPercent?: number;
    payoutTier?: number;
    payoutReason?: string;
    tier2ThresholdMinutes?: number;
  };
  flightId?: string;
  airline?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  status?: string;
  delayMinutes?: number | null;
  delay?: number | null;
  thresholdMinutes?: number;
  date?: string;
  officialSourceUrl?: string;
  // Graduated payout (oracle v2) - top level
  payoutPercent?: number;
  payoutTier?: number;
  payoutReason?: string;
  tier2ThresholdMinutes?: number;
}

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    precipitation?: number;
    wind_speed_10m?: number;
  };
}

type OracleFetchResult = {
  oracle?: OracleMetricsInput;
  sourceUrl?: string;
  rawContext: string;
};

type WeatherFetchResult = {
  weather?: WeatherMetricsInput;
  sourceUrl?: string;
};

type FlightFetchResult = {
  flight?: FlightDelayInput;
  sourceUrl?: string;
  rawContext: string;
};

export interface GeminiResponse {
  statusCode: number;
  geminiResponse: string;
  responseId: string;
  rawJsonString: string;
  usedFallback: boolean;
  decisionTrace: DecisionTrace;
}

const DEFAULT_ORACLE_BASE_URL = "http://127.0.0.1:3001";
const DEFAULT_FLIGHT_API_SECRET_ID = "FLIGHT_API_KEY";
const DEFAULT_FLIGHT_API_SECRET_NAMESPACE = "user";
const DEFAULT_WEATHER = {
  latitude: 6.2442,
  longitude: -75.5812,
  timezone: "America/Bogota",
} as const;

const SYSTEM_PROMPT = `You are a parametric insurance auditor. Your job is to analyze trusted policy signals and return a strict YES/NO verdict.

TASK: Analyze trusted policy data and general context to determine if policy breach conditions have been triggered.

CONDITIONS FOR BREACH (Result: "YES"):
1. Quality-of-life policy:
   - Noise Level > 70 dB
   - Safety Index < 5.0
   - nearbyConstruction = true
   - Severe weather:
   - Precipitation >= 5 mm
   - Wind Speed >= 30 km/h
2. Flight-delay policy:
   - Delay minutes >= threshold in payload
   - Flight status = CANCELLED

If ANY of these are true based on trusted data, output "YES".
Otherwise, output "NO".

Output format (ONLY JSON):
{"result":"YES/NO","confidence":0-10000}`;

const USER_PROMPT = `Analyze trusted policy data.
Output ONLY JSON: {"result":"YES/NO","confidence":0-10000}

Question: `;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, "");

const bytesToBase64 = (bytes: Uint8Array): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    output += chars[(triple >> 18) & 0x3f];
    output += chars[(triple >> 12) & 0x3f];
    output += i + 1 < bytes.length ? chars[(triple >> 6) & 0x3f] : "=";
    output += i + 2 < bytes.length ? chars[triple & 0x3f] : "=";
  }
  return output;
};

const safeJsonParse = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const extractOracleId = (question: string, explicitOracleId?: string): string | undefined => {
  const match = question.match(/(?:market|id|propiedad|property)[:\s#]*(\d+)/i);
  if (match?.[1]) {
    return match[1];
  }
  if (explicitOracleId && /^\d+$/.test(explicitOracleId.trim())) {
    return explicitOracleId.trim();
  }
  return undefined;
};

const isFlightDelayQuestion = (question: string): boolean =>
  /\b(vuelo|flight|delay|retras[oa]s?|cancelad[oa]|cancelled)\b/i.test(question);

const extractFlightId = (question: string): string | undefined => {
  const match = question.match(/\b([a-z]{2,3}\d{2,4})\b/i);
  return match?.[1]?.toUpperCase();
};

const extractTravelDate = (question: string): string | undefined => {
  const match = question.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);
  if (!match) return undefined;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
};

const appendDateQuery = (url: string, date?: string): string => {
  if (!date) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}date=${encodeURIComponent(date)}`;
};

const resolveFlightApiSettings = (
  config: Config
): {
  useConfidentialHttp: boolean;
  providerBaseUrl?: string;
  providerPathTemplate: string;
  providerDateQueryParam: string;
  secretId: string;
  secretNamespace: string;
} => {
  const providerBaseUrl =
    config.flightApi?.providerBaseUrl?.trim() ||
    (typeof process !== "undefined" ? process.env.FLIGHT_API_BASE_URL?.trim() : undefined) ||
    undefined;
  const providerPathTemplate =
    config.flightApi?.providerPathTemplate?.trim() || "/status/{flightId}";
  const providerDateQueryParam =
    config.flightApi?.providerDateQueryParam?.trim() || "date";
  const secretId = config.flightApi?.secretId?.trim() || DEFAULT_FLIGHT_API_SECRET_ID;
  const secretNamespace =
    config.flightApi?.secretNamespace?.trim() || DEFAULT_FLIGHT_API_SECRET_NAMESPACE;

  const modeFromConfig = config.flightApi?.useConfidentialHttp;
  const modeFromEnv =
    typeof process !== "undefined"
      ? process.env.FLIGHT_CONFIDENTIAL_HTTP_ENABLED?.trim()
      : undefined;
  const envEnabled =
    modeFromEnv !== undefined ? !/^(0|false|no)$/i.test(modeFromEnv) : undefined;
  const useConfidentialHttp =
    modeFromConfig !== undefined
      ? modeFromConfig
      : envEnabled !== undefined
        ? envEnabled
        : true;

  return {
    useConfidentialHttp,
    providerBaseUrl,
    providerPathTemplate,
    providerDateQueryParam,
    secretId,
    secretNamespace,
  };
};

const buildConfidentialFlightUrl = (
  settings: ReturnType<typeof resolveFlightApiSettings>,
  flightId: string,
  travelDate?: string
): string | undefined => {
  if (!settings.providerBaseUrl) return undefined;

  const base = normalizeBaseUrl(settings.providerBaseUrl);
  const path = settings.providerPathTemplate.replace(
    /\{flightId\}/g,
    encodeURIComponent(flightId)
  );
  const endpoint = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  if (!travelDate) return endpoint;
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}${encodeURIComponent(
    settings.providerDateQueryParam
  )}=${encodeURIComponent(travelDate)}`;
};

const toFlightDelayInput = (
  payload: FlightDelayApiResponse["data"] | FlightProviderApiResponse["data"] | FlightProviderApiResponse | undefined,
  fallbackFlightId: string
): FlightDelayInput | undefined => {
  if (!payload || typeof payload !== "object") return undefined;

  const candidate = payload as FlightProviderApiResponse;
  const nestedCandidate = payload as FlightProviderApiResponse["data"];
  const maybeDelay =
    nestedCandidate?.delayMinutes ??
    nestedCandidate?.delay ??
    candidate.delayMinutes ??
    candidate.delay;

  return {
    flightId:
      typeof nestedCandidate?.flightId === "string" && nestedCandidate.flightId.trim() !== ""
        ? nestedCandidate.flightId.trim().toUpperCase()
        : typeof candidate.flightId === "string" && candidate.flightId.trim() !== ""
          ? candidate.flightId.trim().toUpperCase()
          : fallbackFlightId,
    status:
      typeof nestedCandidate?.status === "string"
        ? nestedCandidate.status
        : typeof candidate.status === "string"
          ? candidate.status
          : undefined,
    delayMinutes:
      maybeDelay === null ? null : isFiniteNumber(maybeDelay) ? maybeDelay : undefined,
    thresholdMinutes: isFiniteNumber(
      nestedCandidate?.thresholdMinutes ?? candidate.thresholdMinutes
    )
      ? (nestedCandidate?.thresholdMinutes ?? candidate.thresholdMinutes)
      : undefined,
    departureAirport:
      typeof nestedCandidate?.departureAirport === "string"
        ? nestedCandidate.departureAirport
        : typeof candidate.departureAirport === "string"
          ? candidate.departureAirport
          : undefined,
    arrivalAirport:
      typeof nestedCandidate?.arrivalAirport === "string"
        ? nestedCandidate.arrivalAirport
        : typeof candidate.arrivalAirport === "string"
          ? candidate.arrivalAirport
          : undefined,
    date:
      typeof nestedCandidate?.date === "string"
        ? nestedCandidate.date
        : typeof candidate.date === "string"
          ? candidate.date
          : undefined,
    officialSourceUrl:
      typeof nestedCandidate?.officialSourceUrl === "string"
        ? nestedCandidate.officialSourceUrl
        : typeof candidate.officialSourceUrl === "string"
          ? candidate.officialSourceUrl
          : undefined,
    // Graduated payout fields (from oracle v2)
    payoutPercent: isFiniteNumber(nestedCandidate?.payoutPercent)
      ? nestedCandidate.payoutPercent
      : isFiniteNumber(candidate.payoutPercent)
        ? candidate.payoutPercent
        : undefined,
    payoutTier: isFiniteNumber(nestedCandidate?.payoutTier)
      ? (nestedCandidate.payoutTier as 0 | 1 | 2)
      : isFiniteNumber(candidate.payoutTier)
        ? (candidate.payoutTier as 0 | 1 | 2)
        : undefined,
    payoutReason:
      typeof nestedCandidate?.payoutReason === "string"
        ? nestedCandidate.payoutReason
        : typeof candidate.payoutReason === "string"
          ? candidate.payoutReason
          : undefined,
    tier2ThresholdMinutes: isFiniteNumber(nestedCandidate?.tier2ThresholdMinutes)
      ? nestedCandidate.tier2ThresholdMinutes
      : isFiniteNumber(candidate.tier2ThresholdMinutes)
        ? candidate.tier2ThresholdMinutes
        : undefined,
  };
};

const resolveOracleUrls = (config: Config, oracleId: string): string[] => {
  const configuredBase = config.oracleBaseUrl?.trim();
  const envBase =
    typeof process !== "undefined" ? process.env.ORACLE_BASE_URL?.trim() : undefined;
  const base = normalizeBaseUrl(configuredBase || envBase || DEFAULT_ORACLE_BASE_URL);

  const candidates = [
    `${base}/api/market/${oracleId}`,
    `http://127.0.0.1:3001/api/market/${oracleId}`,
    `http://host.docker.internal:3001/api/market/${oracleId}`,
    `http://192.168.1.5:3001/api/market/${oracleId}`,
  ];

  return [...new Set(candidates)];
};

const resolveFlightDelayUrls = (config: Config, flightId: string): string[] => {
  const configuredBase = config.oracleBaseUrl?.trim();
  const envBase =
    typeof process !== "undefined" ? process.env.ORACLE_BASE_URL?.trim() : undefined;
  const base = normalizeBaseUrl(configuredBase || envBase || DEFAULT_ORACLE_BASE_URL);

  const candidates = [
    `${base}/api/flight-delay/${flightId}`,
    // Dedicated flight oracle (port 3101)
    `http://127.0.0.1:3101/api/flight-delay/${flightId}`,
    `http://host.docker.internal:3101/api/flight-delay/${flightId}`,
    // Legacy combined oracle (port 3001)
    `http://127.0.0.1:3001/api/flight-delay/${flightId}`,
    `http://host.docker.internal:3001/api/flight-delay/${flightId}`,
    `http://192.168.1.5:3001/api/flight-delay/${flightId}`,
  ];

  return [...new Set(candidates)];
};

const fetchOracleMetrics = (
  sendRequester: HTTPSendRequester,
  config: Config,
  oracleId?: string
): OracleFetchResult => {
  if (!oracleId) {
    return { rawContext: "" };
  }

  const urls = resolveOracleUrls(config, oracleId);
  for (const url of urls) {
    console.log(`[Oracle Debug] Fetching from: ${url}`);
    const response = sendRequester
      .sendRequest({
        url,
        method: "GET" as const,
        headers: { "Content-Type": "application/json" },
        cacheSettings: { store: false, maxAge: "0s" },
      })
      .result();

    if (!ok(response)) {
      console.log(`[Oracle Debug] Failed: ${response.statusCode}`);
      continue;
    }

    const bodyText = new TextDecoder().decode(response.body ?? new Uint8Array());
    console.log(`[Oracle Debug] Response: ${bodyText}`);
    const parsed = safeJsonParse<OracleApiResponse>(bodyText);
    const metrics = parsed?.data?.metrics;

    if (!parsed?.success || !metrics) {
      continue;
    }

    const oracle: OracleMetricsInput = {
      noiseLevelDb: isFiniteNumber(metrics.noiseLevelDb) ? metrics.noiseLevelDb : undefined,
      safetyIndex: isFiniteNumber(metrics.safetyIndex) ? metrics.safetyIndex : undefined,
      nearbyConstruction:
        typeof metrics.nearbyConstruction === "boolean"
          ? metrics.nearbyConstruction
          : undefined,
      publicTransportStatus:
        typeof metrics.publicTransportStatus === "string"
          ? metrics.publicTransportStatus
          : undefined,
    };

    const rawContext = `
---------------------------------------------------------
[OFFICIAL URBAN SENSOR DATA - IOT NETWORK]
Property ID: ${oracleId}
Address: ${parsed.data?.address ?? "Unknown"}
Noise Level: ${oracle.noiseLevelDb ?? "N/A"} dB
Safety Index: ${oracle.safetyIndex ?? "N/A"}
Construction Nearby: ${
      typeof oracle.nearbyConstruction === "boolean"
        ? String(oracle.nearbyConstruction)
        : "Unknown"
    }
Transport: ${oracle.publicTransportStatus ?? "Unknown"}
Source: ${url}
---------------------------------------------------------`;

    return {
      oracle,
      sourceUrl: url,
      rawContext,
    };
  }

  return { rawContext: "" };
};

const fetchFlightDelayViaConfidentialHttp = (
  runtime: Runtime<Config>,
  config: Config,
  flightId: string,
  travelDate?: string
): FlightFetchResult => {
  const settings = resolveFlightApiSettings(config);
  if (!settings.useConfidentialHttp) return { rawContext: "" };

  const url = buildConfidentialFlightUrl(settings, flightId, travelDate);
  if (!url) return { rawContext: "" };

  const confidentialHttpClient = new cre.capabilities.ConfidentialHTTPClient();

  try {
    const enclaveResponse = confidentialHttpClient
      .sendRequests(runtime as unknown as NodeRuntime<unknown>, {
        vaultDonSecrets: [
          {
            key: settings.secretId,
            namespace: settings.secretNamespace,
          },
        ],
        input: {
          requests: [
            {
              url,
              method: "GET",
              body: "",
              headers: [
                "Accept: application/json",
                `Authorization: Bearer \${secrets.${settings.secretId}}`,
              ],
              publicTemplateValues: {},
            },
          ],
        },
      })
      .result();

    const response = enclaveResponse.responses?.[0];
    if (!response) {
      console.log("[Flight Debug] Confidential HTTP returned empty response list.");
      return { rawContext: "" };
    }

    const statusCode = Number(response.statusCode);
    const bodyText = new TextDecoder().decode(response.body ?? new Uint8Array());
    console.log(`[Flight Debug] Confidential HTTP status: ${statusCode}`);
    console.log(`[Flight Debug] Confidential HTTP body: ${bodyText}`);

    if (statusCode < 200 || statusCode >= 300) {
      console.log(`[Flight Debug] Confidential HTTP non-success status: ${statusCode}`);
      return { rawContext: "" };
    }

    const parsed = safeJsonParse<FlightProviderApiResponse>(bodyText);
    const payload = parsed?.success && parsed.data ? parsed.data : parsed ?? undefined;
    const flight = toFlightDelayInput(payload, flightId);
    if (!flight) {
      console.log("[Flight Debug] Confidential HTTP payload missing flight fields.");
      return { rawContext: "" };
    }

    const rawContext = `
---------------------------------------------------------
[OFFICIAL FLIGHT DELAY DATA - CONFIDENTIAL HTTP]
Flight: ${flight.flightId ?? flightId}
Route: ${flight.departureAirport ?? "N/A"} -> ${flight.arrivalAirport ?? "N/A"}
Status: ${flight.status ?? "Unknown"}
Delay Minutes: ${flight.delayMinutes ?? "N/A"}
Delay Threshold: ${flight.thresholdMinutes ?? "N/A"} min
Payout Tier: ${flight.payoutTier ?? "N/A"} (${flight.payoutPercent ?? 0}%)
Payout Reason: ${flight.payoutReason ?? "N/A"}
Date: ${flight.date ?? travelDate ?? "Unknown"}
Source: ${url}
---------------------------------------------------------`;

    return {
      flight,
      sourceUrl: url,
      rawContext,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`[Flight Debug] Confidential HTTP unavailable, falling back: ${reason}`);
    return { rawContext: "" };
  }
};

const fetchFlightDelayMetrics = (
  runtime: Runtime<Config>,
  sendRequester: HTTPSendRequester,
  config: Config,
  question: string
): FlightFetchResult => {
  if (!isFlightDelayQuestion(question)) {
    return { rawContext: "" };
  }

  const flightId = extractFlightId(question);
  if (!flightId) {
    return { rawContext: "" };
  }

  const travelDate = extractTravelDate(question);
  const confidentialFetch = fetchFlightDelayViaConfidentialHttp(
    runtime,
    config,
    flightId,
    travelDate
  );
  if (confidentialFetch.flight) {
    return confidentialFetch;
  }

  const urls = resolveFlightDelayUrls(config, flightId);
  for (const baseUrl of urls) {
    const url = appendDateQuery(baseUrl, travelDate);
    console.log(`[Flight Debug] Fetching from: ${url}`);

    const response = sendRequester
      .sendRequest({
        url,
        method: "GET" as const,
        headers: { "Content-Type": "application/json" },
        cacheSettings: { store: false, maxAge: "0s" },
      })
      .result();

    if (!ok(response)) {
      console.log(`[Flight Debug] Failed: ${response.statusCode}`);
      continue;
    }

    const bodyText = new TextDecoder().decode(response.body ?? new Uint8Array());
    console.log(`[Flight Debug] Response: ${bodyText}`);
    const parsed = safeJsonParse<FlightDelayApiResponse>(bodyText);
    const data = parsed?.data;
    if (!parsed?.success || !data) {
      continue;
    }

    const flight = toFlightDelayInput(data, flightId);
    if (!flight) {
      continue;
    }

    const rawContext = `
---------------------------------------------------------
[OFFICIAL FLIGHT DELAY DATA]
Flight: ${flight.flightId ?? flightId}
Route: ${flight.departureAirport ?? "N/A"} -> ${flight.arrivalAirport ?? "N/A"}
Status: ${flight.status ?? "Unknown"}
Delay Minutes: ${flight.delayMinutes ?? "N/A"}
Delay Threshold: ${flight.thresholdMinutes ?? "N/A"} min
Payout Tier: ${flight.payoutTier ?? "N/A"} (${flight.payoutPercent ?? 0}%)
Payout Reason: ${flight.payoutReason ?? "N/A"}
Date: ${flight.date ?? "Unknown"}
Source: ${url}
---------------------------------------------------------`;

    return {
      flight,
      sourceUrl: url,
      rawContext,
    };
  }

  return { rawContext: "" };
};

const fetchWeatherMetrics = (
  sendRequester: HTTPSendRequester,
  config: Config
): WeatherFetchResult => {
  const latitude = isFiniteNumber(config.weather?.latitude)
    ? config.weather?.latitude
    : DEFAULT_WEATHER.latitude;
  const longitude = isFiniteNumber(config.weather?.longitude)
    ? config.weather?.longitude
    : DEFAULT_WEATHER.longitude;
  const timezone = config.weather?.timezone || DEFAULT_WEATHER.timezone;
  const encodedTimezone = encodeURIComponent(timezone);
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    "&current=temperature_2m,precipitation,wind_speed_10m" +
    `&timezone=${encodedTimezone}`;

  const response = sendRequester
    .sendRequest({
      url,
      method: "GET" as const,
      headers: { "Content-Type": "application/json" },
      cacheSettings: { store: false, maxAge: "0s" },
    })
    .result();

  if (!ok(response)) {
    return {};
  }

  const bodyText = new TextDecoder().decode(response.body ?? new Uint8Array());
  const parsed = safeJsonParse<OpenMeteoResponse>(bodyText);
  const current = parsed?.current;
  if (!current) {
    return {};
  }

  const weather: WeatherMetricsInput = {
    time: typeof current.time === "string" ? current.time : undefined,
    temperatureC: isFiniteNumber(current.temperature_2m)
      ? current.temperature_2m
      : undefined,
    precipitationMm: isFiniteNumber(current.precipitation)
      ? current.precipitation
      : undefined,
    windSpeedKmh: isFiniteNumber(current.wind_speed_10m)
      ? current.wind_speed_10m
      : undefined,
  };

  return { weather, sourceUrl: url };
};

const buildGeminiRequestWithModel = (
  question: string,
  apiKey: string,
  systemPrompt: string,
  model: string,
  oracleContext: string
) => {
  const requestData: GeminiData = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        parts: [{ text: USER_PROMPT + question + oracleContext }],
      },
    ],
    tools: [
      {
        google_search: {},
      },
    ],
  };

  const body = bytesToBase64(new TextEncoder().encode(JSON.stringify(requestData)));

  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    method: "POST" as const,
    body,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    cacheSettings: {
      store: true,
      maxAge: "60s",
    },
  };
};

export function askGemini(
  runtime: Runtime<Config>,
  question: string,
  customSystemPrompt?: string,
  oracleId?: string
): GeminiResponse {
  runtime.log("[Gemini] Querying AI for market outcome...");
  runtime.log(`[Gemini] Question: "${question}"`);

  const geminiApiKey = runtime.getSecret({ id: "GEMINI_API_KEY" }).result().value;
  const systemPrompt = customSystemPrompt || SYSTEM_PROMPT;
  const httpClient = new cre.capabilities.HTTPClient();

  const result = httpClient
    .sendRequest(
      runtime,
      (sendRequester: HTTPSendRequester, config: Config): GeminiResponse => {
        const resolvedOracleId = extractOracleId(question, oracleId);
        if (resolvedOracleId) {
          console.log(`[Oracle Debug] Using Oracle ID: ${resolvedOracleId}`);
        }

        const flightQuestion = isFlightDelayQuestion(question);
        const explicitFlightId = extractFlightId(question);
        const isFlightPolicy = flightQuestion && Boolean(explicitFlightId);
        const flightFetch = isFlightPolicy
          ? fetchFlightDelayMetrics(runtime, sendRequester, config, question)
          : ({ rawContext: "" } as FlightFetchResult);
        if (isFlightPolicy && flightFetch.flight?.flightId) {
          console.log(`[Flight Debug] Using Flight ID: ${flightFetch.flight.flightId}`);
        }
        if (isFlightPolicy && !flightFetch.flight) {
          console.log("[Flight Debug] Flight policy detected but no trusted flight payload was available.");
        }

        const oracleFetch = isFlightPolicy
          ? ({ rawContext: "" } as OracleFetchResult)
          : fetchOracleMetrics(sendRequester, config, resolvedOracleId);
        const weatherFetch = isFlightPolicy
          ? ({} as WeatherFetchResult)
          : fetchWeatherMetrics(sendRequester, config);

        const traceBase = isFlightPolicy
          ? evaluateFlightDelayBreach({
              flight: flightFetch.flight,
              flightId: flightFetch.flight?.flightId || explicitFlightId,
              sourceUrl: flightFetch.sourceUrl,
            })
          : evaluateQualityOfLifeBreach({
              oracleId: resolvedOracleId,
              oracle: oracleFetch.oracle,
              weather: weatherFetch.weather,
            });

        const policyContext = isFlightPolicy
          ? flightFetch.rawContext
          : oracleFetch.rawContext;

        const response = sendRequester
          .sendRequest(
            buildGeminiRequestWithModel(
              question,
              geminiApiKey,
              systemPrompt,
              config.geminiModel,
              policyContext
            )
          )
          .result();
        const bodyText = new TextDecoder().decode(response.body ?? new Uint8Array());

        if (!ok(response)) {
          if (response.statusCode === 429) {
            console.log("\n⚠️ [GEMINI 429 RATE LIMIT] -> FALLBACK TO LOCAL ORACLE DATA");
            console.log("Using oracle/weather thresholds to settle deterministically.\n");

            const fallbackTrace: DecisionTrace = {
              ...traceBase,
              reason: `Gemini 429 rate limit. ${traceBase.reason}`,
            };
            return {
              statusCode: 200,
              geminiResponse: JSON.stringify({
                result: fallbackTrace.deterministicVerdict,
                confidence: 10000,
              }),
              responseId: "fallback-429-bypass",
              rawJsonString: JSON.stringify({
                fallback: true,
                source: "deterministic-engine",
                policyType: traceBase.policyType || "quality_of_life",
                flightSourceUrl: flightFetch.sourceUrl,
                oracleSourceUrl: oracleFetch.sourceUrl,
                weatherSourceUrl: weatherFetch.sourceUrl,
                geminiStatusCode: response.statusCode,
              }),
              usedFallback: true,
              decisionTrace: fallbackTrace,
            };
          }
          throw new Error(`Gemini API error: ${response.statusCode} - ${bodyText}`);
        }

        const parsed = safeJsonParse<GeminiApiResponse>(bodyText);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error("Malformed Gemini response: missing text");
        }

        const decisionTrace: DecisionTrace = {
          ...traceBase,
          reason: `Gemini response accepted. ${traceBase.reason}`,
        };

        return {
          statusCode: response.statusCode,
          geminiResponse: text,
          responseId: parsed?.responseId || "",
          rawJsonString: bodyText,
          usedFallback: false,
          decisionTrace,
        };
      },
      consensusIdenticalAggregation<GeminiResponse>()
    )(runtime.config)
    .result();

  runtime.log(`[Gemini] Response received: ${result.geminiResponse}`);
  runtime.log(
    `[Gemini] Decision source: ${result.usedFallback ? "fallback" : "gemini"}`
  );
  runtime.log(`[Gemini] Decision trace: ${JSON.stringify(result.decisionTrace)}`);
  return result;
}
