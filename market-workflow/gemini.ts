/**
 * CRE Bootcamp - Gemini AI Integration
 *
 * Uses Google's Gemini API to determine prediction market outcomes.
 * All requests go through CRE consensus for verified results.
 *
 * UPDATED: Habilitado Google Search (google_search) para búsqueda en tiempo real
 * NOTA: Usa el nuevo formato google_search en lugar del deprecado googleSearchRetrieval
 */
import {
  cre,
  ok,
  consensusIdenticalAggregation,
  type Runtime,
  type HTTPSendRequester,
} from "@chainlink/cre-sdk";

// ================================================================
// |                    CONFIGURATION TYPE                        |
// ================================================================
type Config = {
  geminiModel: string;
  oracleBaseUrl?: string;
  weather?: {
    latitude: number;
    longitude: number;
    timezone?: string;
  };
  evms: Array<{
    marketAddress: string;
    chainSelectorName: string;
    gasLimit: string;
  }>;
};

// ================================================================
// |                    GEMINI INTERFACES                         |
// ================================================================
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

export interface GeminiResponse {
  statusCode: number;
  geminiResponse: string;
  responseId: string;
  rawJsonString: string;
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  const base64Chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;

    const triple = (a << 16) | (b << 8) | c;

    output += base64Chars[(triple >> 18) & 0x3f];
    output += base64Chars[(triple >> 12) & 0x3f];
    output += i + 1 < bytes.length ? base64Chars[(triple >> 6) & 0x3f] : "=";
    output += i + 2 < bytes.length ? base64Chars[triple & 0x3f] : "=";
  }

  return output;
};

// ================================================================
// |                    PROMPTS                                   |
// ================================================================
const SYSTEM_PROMPT = `You are a "Dynamic Lease" Smart Auditor. Your job is to analyze urban metrics to enforce Quality of Life guarantees.

TASK: Analyze the provided "Urban Sensor Data" and general context to determine if the "Quality of Life" conditions have been breached.

CONDITIONS FOR BREACH (Result: "YES"):
1. Noise Level > 70 dB (Unacceptable noise pollution)
2. Safety Index < 5.0 (Unsafe environment)
3. "nearbyConstruction" is TRUE (Disruptive works)
4. Severe Weather Disruption:
   - precipitation >= 5 mm (current hour) OR wind_speed_10m >= 30 km/h

If ANY of these are true based on the OFFICIAL TRUSTED ORACLE DATA and OFFICIAL WEATHER DATA, output "YES" (The tenant deserves a discount/payout).
Otherwise, output "NO".

PROCESS:
1. Read the [OFFICIAL TRUSTED ORACLE DATA].
2. Read the [OFFICIAL WEATHER DATA - OPEN METEO] (if present).
3. Check against the thresholds.
4. Output JSON verdict.

CORRECT OUTPUT EXAMPLE:
{"result":"YES","confidence":10000}
`;

const USER_PROMPT = `Analyze the Urban Data and determine if Quality of Life was compromised.
Output ONLY JSON: {"result":"YES/NO","confidence":0-10000}

Question: `;

// ================================================================
// |                    MAIN FUNCTION                             |
// ================================================================
/**
 * Queries Gemini AI to determine the outcome of a prediction market
 * @param runtime - CRE runtime with config and secrets access
 * @param question - The prediction market question to evaluate
 * @param customSystemPrompt - Optional custom system prompt (for disputes, etc.)
 * @returns GeminiResponse with the AI's determination
 */
export function askGemini(
  runtime: Runtime<Config>,
  question: string,
  customSystemPrompt?: string,
  oracleIdOverride?: string
): GeminiResponse {
  runtime.log("[Gemini] Querying AI for market outcome...");
  runtime.log(`[Gemini] Question: "${question}"`);

  // Get API key from secrets
  const geminiApiKey = runtime.getSecret({ id: "GEMINI_API_KEY" }).result();
  const httpClient = new cre.capabilities.HTTPClient();

  // Use custom system prompt if provided, otherwise use default
  const systemPrompt = customSystemPrompt || SYSTEM_PROMPT;

  // Make request with consensus
  const result = httpClient
    .sendRequest(
      runtime,
      buildGeminiRequest(question, geminiApiKey.value, systemPrompt, oracleIdOverride),
      consensusIdenticalAggregation<GeminiResponse>()
    )(runtime.config)
    .result();

  runtime.log(`[Gemini] Response received: ${result.geminiResponse}`);
  return result;
}

// ================================================================
// |                    REQUEST BUILDER                           |
// ================================================================
const buildGeminiRequest =
  (question: string, apiKey: string, systemPrompt: string, oracleIdOverride?: string) =>
  (sendRequester: HTTPSendRequester, config: Config): GeminiResponse => {
    
    // [HACKATHON MODE] Integración con Oracle "FairLease" (Assets del mundo real)
    // Intentamos obtener datos oficiales del servidor local (alojamientos-medellin)
    let oracleContext = "";
    let oracleMetrics:
      | {
          noiseLevelDb?: number;
          safetyIndex?: number;
          nearbyConstruction?: boolean;
          publicTransportStatus?: string;
          address?: string;
        }
      | undefined;

    // Prefer parsing from the question (e.g., "Propiedad ID 1") so the oracle
    // matches what the user sees in the UI. Fall back to the override (e.g., onchain marketId).
    const detectedFromQuestion =
      question.match(/(?:market|id|propiedad)[:\s]*(\d+)/i)?.[1];
    const detectedId = detectedFromQuestion ?? oracleIdOverride;

    if (detectedId) {
      const id = detectedId;
      console.log(`[Oracle Debug] Using Oracle ID: ${id}`);
      try {
        const envOracleBaseUrl =
          typeof process !== "undefined" ? process.env.ORACLE_BASE_URL : undefined;
        const configuredBaseUrl = config.oracleBaseUrl || envOracleBaseUrl;
        const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, "");

        // [FIX] Try configured base URL first, then fallbacks (LAN/localhost)
        const urlsToTry = [
            ...(configuredBaseUrl
              ? [`${normalizeBaseUrl(configuredBaseUrl)}/api/market/${id}`]
              : []),
            `http://192.168.1.5:3001/api/market/${id}`,
            `http://host.docker.internal:3001/api/market/${id}`,
            `http://127.0.0.1:3001/api/market/${id}`
        ];

        let oracleResult: any;
        let success = false;

        for (const url of urlsToTry) {
            console.log(`[Oracle Debug] Fetching from: ${url}`);
            const oracleReq = {
                url: url,
                method: "GET" as const,
                headers: { "Content-Type": "application/json" },
                cacheSettings: { store: false, maxAge: '0s' },
            };
            
            oracleResult = sendRequester.sendRequest(oracleReq).result();
            if (ok(oracleResult)) {
                success = true;
                break; // Found it!
            } else {
                 console.log(`[Oracle Debug] Failed with ${url}: ${oracleResult.statusCode || "Error"}`);
            }
        }

        if (success && ok(oracleResult)) {
           const bodyStr = new TextDecoder().decode(oracleResult.body);
           console.log(`[Oracle Debug] Response: ${bodyStr}`);
           const json = JSON.parse(bodyStr);
           if (json.success && json.data) {
             oracleMetrics = {
               address: json.data.address,
               noiseLevelDb: json.data.metrics?.noiseLevelDb,
               safetyIndex: json.data.metrics?.safetyIndex,
               nearbyConstruction: json.data.metrics?.nearbyConstruction,
               publicTransportStatus: json.data.metrics?.publicTransportStatus,
             };

             oracleContext = `
---------------------------------------------------------
[OFFICIAL URBAN SENSOR DATA - IOT NETWORK]
Property ID: ${id}
Metrics:
- Noise Level: ${json.data.metrics?.noiseLevelDb ?? "N/A"} dB
- Safety Index: ${json.data.metrics?.safetyIndex ?? "N/A"}/10
- Construction Nearby: ${json.data.metrics?.nearbyConstruction ?? "Unknown"}
- Transport: ${json.data.metrics?.publicTransportStatus ?? "Unknown"}
- Base Info: ${JSON.stringify(json.data)}

INSTRUCTION: Trust these sensor readings absolutely.
---------------------------------------------------------
`;
           }
        } else {
            console.log(`[Oracle Debug] Fetch failed with status: ${oracleResult.statusCode}`);
        }
      } catch (err) {
        console.log(`[Oracle Debug] Exception:`, err);
      }
    } else {
        console.log("[Oracle Debug] No Market ID detected in question");
    }

    // [HACKATHON MODE] External Weather API (real-world signal)
    // Uses Open-Meteo (no API key) so the workflow integrates a real external data source.
    let weatherContext = "";
    let weatherMetrics:
      | {
          precipitationMm?: number;
          windSpeedKmh?: number;
          temperatureC?: number;
          time?: string;
        }
      | undefined;
    try {
      const latitude = config.weather?.latitude ?? 6.2442; // Medellín default
      const longitude = config.weather?.longitude ?? -75.5812;
      const timezone = config.weather?.timezone ?? "America/Bogota";

      const weatherUrl =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${encodeURIComponent(String(latitude))}` +
        `&longitude=${encodeURIComponent(String(longitude))}` +
        `&current=temperature_2m,precipitation,wind_speed_10m` +
        `&timezone=${encodeURIComponent(timezone)}`;

      const weatherReq = {
        url: weatherUrl,
        method: "GET" as const,
        headers: { Accept: "application/json" },
        // google.protobuf.Duration JSON format expects seconds like "900s"
        cacheSettings: { store: true, maxAge: "900s" },
      };

      const weatherResp = sendRequester.sendRequest(weatherReq).result();
      if (ok(weatherResp)) {
        const bodyStr = new TextDecoder().decode(weatherResp.body);
        const json = JSON.parse(bodyStr);
        const current = json?.current;

        if (current) {
          weatherMetrics = {
            time: current.time,
            temperatureC: current.temperature_2m,
            precipitationMm: current.precipitation,
            windSpeedKmh: current.wind_speed_10m,
          };

          weatherContext = `
---------------------------------------------------------
[OFFICIAL WEATHER DATA - OPEN METEO]
Location: ${latitude}, ${longitude}
Time: ${current.time ?? "N/A"} (${timezone})
- Temperature: ${current.temperature_2m ?? "N/A"} °C
- Precipitation: ${current.precipitation ?? "N/A"} mm
- Wind Speed: ${current.wind_speed_10m ?? "N/A"} km/h
Source: ${weatherUrl}

INSTRUCTION: Trust these weather readings absolutely.
---------------------------------------------------------
`;
        }
      } else {
        console.log(
          `[Weather Debug] Fetch failed: ${weatherResp.statusCode ?? "Error"}`
        );
      }
    } catch (err) {
      console.log(`[Weather Debug] Exception:`, err);
    }

    // Estructura CON google_search para búsqueda en tiempo real
    const requestData: GeminiData = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          parts: [{ text: USER_PROMPT + question + oracleContext + weatherContext }],
        },
      ],
      // Habilitar Google Search para datos en tiempo real
      tools: [
        {
          google_search: {},
        },
      ],
    };

    // Base64 encode the body
    const bodyBytes = new TextEncoder().encode(JSON.stringify(requestData));
    const body = bytesToBase64(bodyBytes);

    const req = {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`,
      method: "POST" as const,
      body,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      cacheSettings: {
        store: true,
        maxAge: '60s',
      },
    };

    const resp = sendRequester.sendRequest(req).result();
    const bodyText = new TextDecoder().decode(resp.body);

    if (!ok(resp)) {
      // [HACKATHON MODE ERROR HANDLER]
      // Si Gemini falla (ej. Quota 429) PERO tenemos datos del oráculo local,
      // usamos los datos del oráculo para generar una respuesta determinista y permitir probar el flujo.
      // If we rate-limit but we already have local oracle data, allow demo fallback
      if (
        resp.statusCode === 429 &&
        (oracleMetrics || weatherMetrics || oracleContext.includes("OFFICIAL URBAN SENSOR DATA"))
      ) {
          console.log("\n⚠️ [GEMINI 429 RATE LIMIT] -> FALLBACK TO LOCAL ORACLE DATA");
          console.log("Using oracle/weather thresholds to settle deterministically.\n");

          const noiseLevelDb = oracleMetrics?.noiseLevelDb;
          const safetyIndex = oracleMetrics?.safetyIndex;
          const nearbyConstruction = oracleMetrics?.nearbyConstruction;
          const precipitationMm = weatherMetrics?.precipitationMm;
          const windSpeedKmh = weatherMetrics?.windSpeedKmh;

          const breached =
            (typeof noiseLevelDb === "number" && noiseLevelDb > 70) ||
            (typeof safetyIndex === "number" && safetyIndex < 5) ||
            nearbyConstruction === true ||
            (typeof precipitationMm === "number" && precipitationMm >= 5) ||
            (typeof windSpeedKmh === "number" && windSpeedKmh >= 30);

          return {
            statusCode: 200,
            geminiResponse: JSON.stringify({
              result: breached ? "YES" : "NO",
              confidence: 10000,
            }),
            responseId: "fallback-429-bypass",
            rawJsonString: '{"fallback": true}'
          };
      }

      throw new Error(`Gemini API error: ${resp.statusCode} - ${bodyText}`);
    }

    const apiResponse = JSON.parse(bodyText) as GeminiApiResponse;
    const text = apiResponse?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Malformed Gemini response: missing text");
    }

    return {
      statusCode: resp.statusCode,
      geminiResponse: text,
      responseId: apiResponse.responseId || "",
      rawJsonString: bodyText,
    };
  };
