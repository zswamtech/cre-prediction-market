/**
 * CRE Prediction Market - Dispute Resolution Workflow
 *
 * This callback handles dispute resolution:
 * 1. Triggered by DisputeOpened event
 * 2. Re-evaluates the market question with additional context
 * 3. Compares with original AI verdict
 * 4. Resolves dispute as valid or invalid
 *
 * NEW FEATURE for Hackathon v2.2: Fair dispute resolution system
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
  createdAt: number;
  settledAt: number;
  settled: boolean;
  confidence: number;
  outcome: number; // 0 = Yes, 1 = No
  totalYesPool: bigint;
  totalNoPool: bigint;
  question: string;
  disputePeriodEnd: number;
  disputeStatus: number; // 0=None, 1=Open, 2=ResolvedValid, 3=ResolvedInvalid
}

interface Dispute {
  disputer: `0x${string}`;
  stake: bigint;
  reason: string;
  openedAt: number;
}

// ================================================================
// |                    CONTRACT ABIs                             |
// ================================================================
const DISPUTE_OPENED_EVENT = [
  {
    type: "event",
    name: "DisputeOpened",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "disputer", type: "address", indexed: true },
      { name: "reason", type: "string", indexed: false },
      { name: "stake", type: "uint256", indexed: false },
    ],
  },
] as const;

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
          { name: "disputePeriodEnd", type: "uint48" },
          { name: "disputeStatus", type: "uint8" },
        ],
      },
    ],
  },
] as const;

const GET_DISPUTE_ABI = [
  {
    name: "getDispute",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "disputer", type: "address" },
          { name: "stake", type: "uint256" },
          { name: "reason", type: "string" },
          { name: "openedAt", type: "uint48" },
        ],
      },
    ],
  },
] as const;

const DISPUTE_RESOLUTION_PARAMS = parseAbiParameters(
  "uint256 marketId, bool isValid, uint8 newOutcome, uint16 newConfidence"
);

// ================================================================
// |                    DISPUTE AI PROMPT                         |
// ================================================================
const DISPUTE_SYSTEM_PROMPT = `You are a DISPUTE RESOLUTION oracle for prediction markets. Your job is to RE-EVALUATE a previous AI verdict.

CONTEXT:
- A market was settled with outcome YES or NO
- A participant has disputed the verdict with a specific reason
- You must determine if the dispute is VALID (original verdict was wrong) or INVALID (original verdict was correct)

EVALUATION CRITERIA:
1. Search Google for CURRENT information about the question
2. Consider the dispute reason carefully
3. Compare your findings with the original verdict
4. Determine if the dispute has merit

OUTPUT FORMAT - You MUST output ONLY a JSON object:
{"disputeValid": true/false, "newResult": "YES" or "NO", "confidence": 0-10000, "reasoning": "brief explanation"}

RULES:
- disputeValid: true ONLY if the original verdict was clearly wrong
- newResult: What the correct answer should be
- confidence: Your confidence in the NEW verdict (0-10000)
- Be conservative: only overturn if evidence is strong

CRITICAL: Output ONLY the JSON. No text before. No text after.`;

const buildDisputePrompt = (
  question: string,
  originalOutcome: string,
  originalConfidence: number,
  disputeReason: string
): string => {
  return `DISPUTE EVALUATION REQUEST

Original Question: ${question}
Original Verdict: ${originalOutcome}
Original Confidence: ${originalConfidence / 100}%
Dispute Reason: ${disputeReason}
Current Date: ${new Date().toISOString().split("T")[0]}

Search Google for current information, then output ONLY the JSON verdict.`;
};

// ================================================================
// |                    DISPUTE TRIGGER HANDLER                   |
// ================================================================
export function onDisputeTrigger(
  runtime: Runtime<Config>,
  trigger: EVMLog
): string {
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  runtime.log("CRE Workflow: Dispute Resolution");
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const evmConfig = runtime.config.evms[0];
    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName: evmConfig.chainSelectorName,
      isTestnet: true,
    });

    if (!network) {
      throw new Error(`Unknown chain: ${evmConfig.chainSelectorName}`);
    }

    const evmClient = new cre.capabilities.EVMClient(
      network.chainSelector.selector
    );

    // ─────────────────────────────────────────────────────────────
    // Step 1: Decode DisputeOpened event
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 1] Decoding DisputeOpened event...");

    const decodedLog = decodeEventLog({
      abi: DISPUTE_OPENED_EVENT,
      data: bytesToHex(trigger.data),
      topics: trigger.topics.map((t) => bytesToHex(t)) as [
        `0x${string}`,
        ...`0x${string}`[]
      ],
    });

    const marketId = decodedLog.args.marketId;
    const disputer = decodedLog.args.disputer;
    const disputeReason = decodedLog.args.reason;
    const stake = decodedLog.args.stake;

    runtime.log(`[Step 1] Market ID: ${marketId}`);
    runtime.log(`[Step 1] Disputer: ${disputer}`);
    runtime.log(`[Step 1] Reason: ${disputeReason}`);
    runtime.log(`[Step 1] Stake: ${stake} wei`);

    // ─────────────────────────────────────────────────────────────
    // Step 2: Read market data
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 2] Reading market data...");

    const marketCallData = encodeFunctionData({
      abi: GET_MARKET_ABI,
      functionName: "getMarket",
      args: [marketId],
    });

    const marketResult = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: evmConfig.marketAddress as `0x${string}`,
          data: marketCallData,
        }),
      })
      .result();

    const market = decodeFunctionResult({
      abi: GET_MARKET_ABI,
      functionName: "getMarket",
      data: bytesToHex(marketResult.data),
    }) as unknown as Market;

    const originalOutcome = market.outcome === 0 ? "YES" : "NO";
    runtime.log(`[Step 2] Question: "${market.question}"`);
    runtime.log(`[Step 2] Original Outcome: ${originalOutcome}`);
    runtime.log(`[Step 2] Original Confidence: ${market.confidence / 100}%`);

    // ─────────────────────────────────────────────────────────────
    // Step 3: Re-evaluate with AI
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 3] Re-evaluating with Gemini AI...");

    const disputePrompt = buildDisputePrompt(
      market.question,
      originalOutcome,
      market.confidence,
      disputeReason
    );

    const geminiResult = askGemini(
      runtime,
      DISPUTE_SYSTEM_PROMPT,
      disputePrompt
    );

    runtime.log(`[Step 3] Gemini response: ${geminiResult.geminiResponse}`);

    // ─────────────────────────────────────────────────────────────
    // Step 4: Parse AI response
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 4] Parsing dispute resolution...");

    let disputeValid = false;
    let newOutcome = market.outcome;
    let newConfidence = market.confidence;

    try {
      // Try to extract JSON from response
      const jsonMatch = geminiResult.geminiResponse.match(
        /\{[\s\S]*"disputeValid"[\s\S]*\}/
      );
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        disputeValid = parsed.disputeValid === true;
        if (disputeValid) {
          newOutcome = parsed.newResult?.toUpperCase() === "YES" ? 0 : 1;
          newConfidence = Math.min(10000, Math.max(0, parsed.confidence || 8000));
        }

        runtime.log(`[Step 4] Dispute Valid: ${disputeValid}`);
        runtime.log(`[Step 4] New Outcome: ${newOutcome === 0 ? "YES" : "NO"}`);
        runtime.log(`[Step 4] New Confidence: ${newConfidence / 100}%`);
        if (parsed.reasoning) {
          runtime.log(`[Step 4] Reasoning: ${parsed.reasoning}`);
        }
      } else {
        runtime.log("[Step 4] Could not parse JSON, defaulting to invalid dispute");
        disputeValid = false;
      }
    } catch (parseErr) {
      runtime.log(`[Step 4] Parse error, defaulting to invalid dispute`);
      disputeValid = false;
    }

    // ─────────────────────────────────────────────────────────────
    // Step 5: Write dispute resolution to contract
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 5] Sending dispute resolution to contract...");

    // Encode resolution data with 0x02 prefix for dispute resolution
    const resolutionData = encodeAbiParameters(DISPUTE_RESOLUTION_PARAMS, [
      marketId,
      disputeValid,
      newOutcome,
      newConfidence,
    ]);

    const reportData = ("0x02" + resolutionData.slice(2)) as `0x${string}`;

    const reportResponse = runtime
      .report({
        encodedPayload: hexToBase64(reportData),
        encoderName: "evm",
        signingAlgo: "ecdsa",
        hashingAlgo: "keccak256",
      })
      .result();

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
      runtime.log(`[Step 5] Dispute resolved! TX: ${txHash}`);
      runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      const result = disputeValid ? "VALID - Outcome reversed" : "INVALID - Outcome maintained";
      return `Dispute for Market #${marketId}: ${result}`;
    }

    throw new Error(`Dispute resolution failed: ${writeResult.txStatus}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] ${msg}`);
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    throw err;
  }
}
