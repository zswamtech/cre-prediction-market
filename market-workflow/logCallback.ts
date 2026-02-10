/**
 * CRE Bootcamp - Complete Settlement Workflow
 *
 * Flow:
 * 1. Decode SettlementRequested event
 * 2. Read market details (EVM Read)
 * 3. Query Gemini AI for outcome (HTTP)
 * 4. Write settlement to contract (EVM Write)
 */
import {
  cre,
  type Runtime,
  type EVMLog,
  getNetwork,
  bytesToHex,
  hexToBase64,
  TxStatus,
  encodeCallMsg,
} from "@chainlink/cre-sdk";
import {
  decodeEventLog,
  parseAbi,
  encodeAbiParameters,
  parseAbiParameters,
  encodeFunctionData,
  decodeFunctionResult,
  zeroAddress,
} from "viem";
import { askGemini } from "./gemini";

// ================================================================
// |                    CONFIGURATION TYPE                        |
// ================================================================
type Config = {
  geminiModel: string;
  minMarketAgeMinutes?: number;
  evms: Array<{
    marketAddress: string;
    chainSelectorName: string;
    gasLimit: string;
  }>;
};

// ================================================================
// |                    INTERFACES                                |
// ================================================================
interface Market {
  creator: `0x${string}`;
  createdAt: number | bigint;
  settledAt: number | bigint;
  settled: boolean;
  confidence: number | bigint;
  outcome: number | bigint; // 0 = Yes, 1 = No
  totalYesPool: bigint;
  totalNoPool: bigint;
  question: string;
}

interface GeminiResult {
  result: "YES" | "NO" | "INCONCLUSIVE";
  confidence: number; // 0-10000
}

// ================================================================
// |                    CONTRACT ABIs                             |
// ================================================================
const EVENT_ABI = parseAbi([
  "event SettlementRequested(uint256 indexed marketId, string question)",
  "event MarketCreated(uint256 indexed marketId, string question, address creator)",
  "event PredictionMade(uint256 indexed marketId, address indexed predictor, uint8 prediction, uint256 amount)",
  "event MarketSettled(uint256 indexed marketId, uint8 outcome, uint16 confidence)"
]);

const GET_MARKET_ABI = [
  {
    name: "getMarket",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "createdAt", type: "uint48" },
          { name: "settledAt", type: "uint48" },
          { name: "settled", type: "bool" },
          { name: "confidence", type: "uint16" },
          { name: "outcome", type: "uint8" },
          { name: "totalYesPool", type: "uint256" },
          { name: "totalNoPool", type: "uint256" },
          { name: "question", type: "string" },
        ],
      },
    ],
  },
] as const;

// Settlement params: marketId, outcome (uint8 for Prediction enum), confidence
const SETTLEMENT_PARAMS = parseAbiParameters("uint256 marketId, uint8 outcome, uint16 confidence");

// ================================================================
// |                    LOG TRIGGER HANDLER                       |
// ================================================================
export function onLogTrigger(runtime: Runtime<Config>, log: EVMLog): string {
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  runtime.log("CRE Workflow: Log Trigger - Settle Market");
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    // ─────────────────────────────────────────────────────────────
    // Step 1: Decode the event log
    // ─────────────────────────────────────────────────────────────
    const topics = log.topics.map((t: Uint8Array) => bytesToHex(t)) as [
      `0x${string}`,
      ...`0x${string}`[]
    ];
    const data = bytesToHex(log.data);

    const decodedLog = decodeEventLog({ abi: EVENT_ABI, data, topics });
    
    // Check if it's the correct event
    if (decodedLog.eventName !== "SettlementRequested") {
      runtime.log(`[ERROR] Incorrect Event Detected: ${decodedLog.eventName}`);
      if (decodedLog.eventName === "MarketCreated") {
        throw new Error("You provided the Market Creation TX. Please request settlement in the UI and use THAT transaction hash.");
      }
      throw new Error(`Expected SettlementRequested, got ${decodedLog.eventName}`);
    }

    const marketId = decodedLog.args.marketId as bigint;
    const question = decodedLog.args.question as string;

    runtime.log(`[Step 1] Settlement requested for Market #${marketId}`);
    runtime.log(`[Step 1] Question: "${question}"`);

    // ─────────────────────────────────────────────────────────────
    // Step 2: Read market details from contract (EVM Read)
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 2] Reading market details from contract...");

    const evmConfig = runtime.config.evms[0];
    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName: evmConfig.chainSelectorName,
      isTestnet: true,
    });

    if (!network) {
      throw new Error(`Unknown chain: ${evmConfig.chainSelectorName}`);
    }

    const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

    const callData = encodeFunctionData({
      abi: GET_MARKET_ABI,
      functionName: "getMarket",
      args: [marketId],
    });

    const readResult = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: evmConfig.marketAddress as `0x${string}`,
          data: callData,
        })
      })
      .result();

    const market = decodeFunctionResult({
      abi: GET_MARKET_ABI,
      functionName: "getMarket",
      data: bytesToHex(readResult.data),
    }) as unknown as Market;

    runtime.log(`[Step 2] Market creator: ${market.creator}`);
    runtime.log(`[Step 2] Already settled: ${market.settled}`);
    runtime.log(`[Step 2] Yes Pool: ${market.totalYesPool}`);
    runtime.log(`[Step 2] No Pool: ${market.totalNoPool}`);

    if (market.settled) {
      runtime.log("[Step 2] Market already settled, skipping...");
      return "Market already settled";
    }

    // ─────────────────────────────────────────────────────────────
    // Guard: Minimum "observation period" after creation
    // ─────────────────────────────────────────────────────────────
    const minAgeMinutes = runtime.config.minMarketAgeMinutes ?? 0;
    const minAgeSeconds = Math.ceil(minAgeMinutes * 60);
    const createdAtSeconds =
      typeof market.createdAt === "bigint" ? Number(market.createdAt) : market.createdAt;

    if (minAgeSeconds > 0 && createdAtSeconds > 0) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const ageSeconds = nowSeconds - createdAtSeconds;
      runtime.log(
        `[Step 2] Market age: ${ageSeconds}s (min required: ${minAgeSeconds}s)`
      );

      if (ageSeconds < minAgeSeconds) {
        const waitSeconds = Math.max(0, minAgeSeconds - ageSeconds);
        runtime.log(
          `[Step 2] Too early to settle. Try again in ${waitSeconds}s.`
        );
        return `Too early to settle. Wait ${waitSeconds}s.`;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // Step 3: Query AI (HTTP)
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 3] Querying Gemini AI...");

    const geminiResult = askGemini(runtime, question, undefined, marketId.toString());

    // Extract JSON from response (AI may include prose before/after the JSON)
    const jsonMatch = geminiResult.geminiResponse.match(/\{[\s\S]*"result"[\s\S]*"confidence"[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Could not find JSON in AI response: ${geminiResult.geminiResponse}`);
    }
    const parsed = JSON.parse(jsonMatch[0]) as GeminiResult;

    // Validate the result - only YES or NO can settle a market
    if (!["YES", "NO"].includes(parsed.result)) {
      throw new Error(`Cannot settle: AI returned ${parsed.result}. Only YES or NO can settle a market.`);
    }
    if (parsed.confidence < 0 || parsed.confidence > 10000) {
      throw new Error(`Invalid confidence: ${parsed.confidence}`);
    }

    runtime.log(`[Step 3] AI Result: ${parsed.result}`);
    runtime.log(`[Step 3] AI Confidence: ${parsed.confidence / 100}%`);

    // Convert result string to Prediction enum value (0 = Yes, 1 = No)
    const outcomeValue = parsed.result === "YES" ? 0 : 1;

    // ─────────────────────────────────────────────────────────────
    // Step 4: Write settlement report to contract (EVM Write)
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 4] Generating settlement report...");

    // Encode settlement data
    const settlementData = encodeAbiParameters(SETTLEMENT_PARAMS, [
      marketId,
      outcomeValue,
      parsed.confidence,
    ]);

    // Prepend 0x01 prefix so contract routes to _settleMarket
    const reportData = ("0x01" + settlementData.slice(2)) as `0x${string}`;

    const reportResponse = runtime
      .report({
        encodedPayload: hexToBase64(reportData),
        encoderName: "evm",
        signingAlgo: "ecdsa",
        hashingAlgo: "keccak256",
      })
      .result();

    runtime.log(`[Step 4] Writing to contract: ${evmConfig.marketAddress}`);

    const writeResult = evmClient
      .writeReport(runtime, {
        receiver: evmConfig.marketAddress as `0x${string}`,
        report: reportResponse,
        gasConfig: {
          gasLimit: evmConfig.gasLimit,
        },
      })
      .result();

    if (writeResult.txStatus === TxStatus.SUCCESS) {
      const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
      runtime.log(`[Step 4] ✓ Settlement successful: ${txHash}`);
      runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      return `Settled: ${txHash}`;
    }

    throw new Error(`Transaction failed: ${writeResult.txStatus}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] ${msg}`);
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    throw err;
  }
}
