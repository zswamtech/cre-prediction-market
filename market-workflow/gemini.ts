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

// ================================================================
// |                    PROMPTS                                   |
// ================================================================
const SYSTEM_PROMPT = `You are a prediction market oracle. Your ONLY job is to output JSON.

TASK: Determine if an event happened (or will happen) and return a JSON verdict.

QUESTION TYPES:
- PAST EVENT: Use confidence 9000-10000
- CURRENT STATE: Use confidence 8000-10000
- NEAR FUTURE (<7 days): Use confidence 6000-9000
- SPECULATIVE (>7 days): Use confidence 3000-7000 MAX
- UNANSWERABLE: Return {"result":"NO","confidence":0}

PROCESS:
1. Search Google for current information
2. Determine YES or NO
3. Assign confidence (0-10000)
4. Output ONLY the JSON

CRITICAL: You MUST output ONLY a JSON object. No text before. No text after. No explanation.

CORRECT OUTPUT EXAMPLE:
{"result":"YES","confidence":9500}

WRONG OUTPUT (DO NOT DO THIS):
Based on my search, Bitcoin did reach $100k... (NO! Just output JSON!)`;

const USER_PROMPT = `Search Google, then output ONLY this JSON format:
{"result":"YES","confidence":XXXX} or {"result":"NO","confidence":XXXX}

Date: ${new Date().toISOString().split('T')[0]}
Question: `;

// ================================================================
// |                    MAIN FUNCTION                             |
// ================================================================
/**
 * Queries Gemini AI to determine the outcome of a prediction market
 * @param runtime - CRE runtime with config and secrets access
 * @param question - The prediction market question to evaluate
 * @returns GeminiResponse with the AI's determination
 */
export function askGemini(runtime: Runtime<Config>, question: string): GeminiResponse {
  runtime.log("[Gemini] Querying AI for market outcome...");
  runtime.log(`[Gemini] Question: "${question}"`);

  // Get API key from secrets
  const geminiApiKey = runtime.getSecret({ id: "GEMINI_API_KEY" }).result();
  const httpClient = new cre.capabilities.HTTPClient();

  // Make request with consensus
  const result = httpClient
    .sendRequest(
      runtime,
      buildGeminiRequest(question, geminiApiKey.value),
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
  (question: string, apiKey: string) =>
  (sendRequester: HTTPSendRequester, config: Config): GeminiResponse => {
    // Estructura CON google_search para búsqueda en tiempo real
    const requestData: GeminiData = {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          parts: [{ text: USER_PROMPT + question }],
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
    const body = Buffer.from(bodyBytes).toString("base64");

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
