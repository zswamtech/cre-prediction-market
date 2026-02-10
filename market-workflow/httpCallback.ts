/**
 * CRE Bootcamp - HTTP Trigger Callback
 *
 * Handles HTTP requests to create prediction markets.
 * Flow:
 * 1. Validate HTTP payload
 * 2. Encode question for contract
 * 3. Generate CRE report
 * 4. Write to contract (EVM Write)
 */
import {
    cre,
    type Runtime,
    type HTTPPayload,
    decodeJson,
    getNetwork,
    encodeCallMsg,
    hexToBase64,
    bytesToHex,
    TxStatus,
} from "@chainlink/cre-sdk";
import {
    decodeFunctionResult,
    encodeAbiParameters,
    encodeFunctionData,
    parseAbiParameters,
    zeroAddress,
} from "viem";
import { askGemini } from "./gemini";

// Interface for the HTTP request payload
interface CreateMarketPayload {
    question: string;
}

interface SettlementPayload {
    action?: "settle";
    marketId: number | string;
    question?: string;
}

type HttpRequestPayload = {
    action?: "create" | "settle";
    question?: string;
    marketId?: number | string;
};

// Configuration type matching config.staging.json
type Config = {
    geminiModel: string;
    minMarketAgeMinutes?: number;
    evms: Array<{
        marketAddress: string;
        chainSelectorName: string;
        gasLimit: string;
    }>;
};

interface Market {
    creator: `0x${string}`;
    createdAt: number | bigint;
    settledAt: number | bigint;
    settled: boolean;
    confidence: number | bigint;
    outcome: number | bigint;
    totalYesPool: bigint;
    totalNoPool: bigint;
    question: string;
}

interface GeminiResult {
    result: "YES" | "NO" | "INCONCLUSIVE";
    confidence: number;
}

// ABI parameters for encoding the question
const QUESTION_PARAMS = parseAbiParameters("string question");
const SETTLEMENT_PARAMS = parseAbiParameters(
    "uint256 marketId, uint8 outcome, uint16 confidence"
);

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

const settleMarket = (
    runtime: Runtime<Config>,
    marketId: bigint,
    questionOverride?: string
): string => {
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log("CRE Workflow: HTTP Trigger - Settle Market");
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

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

    runtime.log("[Step 1] Reading market details...");
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
            }),
        })
        .result();

    const market = decodeFunctionResult({
        abi: GET_MARKET_ABI,
        functionName: "getMarket",
        data: bytesToHex(readResult.data),
    }) as unknown as Market;

    runtime.log(`[Step 1] Market #${marketId} loaded`);
    runtime.log(`[Step 1] Already settled: ${market.settled}`);

    if (market.settled) {
        return "Market already settled";
    }

    // ─────────────────────────────────────────────────────────────
    // Guard: Minimum "observation period" after creation
    // (No contract change required; enforced in workflow)
    // ─────────────────────────────────────────────────────────────
    const minAgeMinutes = runtime.config.minMarketAgeMinutes ?? 0;
    const minAgeSeconds = Math.ceil(minAgeMinutes * 60);
    const createdAtSeconds =
        typeof market.createdAt === "bigint" ? Number(market.createdAt) : market.createdAt;

    if (minAgeSeconds > 0 && createdAtSeconds > 0) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const ageSeconds = nowSeconds - createdAtSeconds;
        runtime.log(
            `[Step 1] Market age: ${ageSeconds}s (min required: ${minAgeSeconds}s)`
        );

        if (ageSeconds < minAgeSeconds) {
            const waitSeconds = Math.max(0, minAgeSeconds - ageSeconds);
            runtime.log(
                `[Step 1] Too early to settle. Try again in ${waitSeconds}s.`
            );
            return `Too early to settle. Wait ${waitSeconds}s.`;
        }
    }

    const question = questionOverride?.trim() || market.question;

    runtime.log("[Step 2] Querying Gemini AI...");
    const geminiResult = askGemini(runtime, question, undefined, marketId.toString());

    const jsonMatch = geminiResult.geminiResponse.match(
        /\{[\s\S]*"result"[\s\S]*"confidence"[\s\S]*\}/
    );
    if (!jsonMatch) {
        throw new Error(`Could not parse AI response: ${geminiResult.geminiResponse}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as GeminiResult;
    if (!["YES", "NO"].includes(parsed.result)) {
        throw new Error(
            `Cannot settle: AI returned ${parsed.result}. Only YES or NO can settle.`
        );
    }
    if (parsed.confidence < 0 || parsed.confidence > 10000) {
        throw new Error(`Invalid confidence: ${parsed.confidence}`);
    }

    const outcomeValue = parsed.result === "YES" ? 0 : 1;

    runtime.log("[Step 3] Writing settlement report...");
    const settlementData = encodeAbiParameters(SETTLEMENT_PARAMS, [
        marketId,
        outcomeValue,
        parsed.confidence,
    ]);
    const reportData = ("0x01" + settlementData.slice(2)) as `0x${string}`;

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
        runtime.log(`[Step 3] ✓ Settlement successful: ${txHash}`);
        runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        return `Settled: ${txHash}`;
    }

    throw new Error(`Transaction failed: ${writeResult.txStatus}`);
};

/**
 * HTTP Trigger callback function
 * Called when an HTTP request is received by the workflow
 */
export function onHttpTrigger(runtime: Runtime<Config>, payload: HTTPPayload): string {
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log("CRE Workflow: HTTP Trigger");
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
        // ─────────────────────────────────────────────────────────────
        // Step 1: Validate payload
        // ─────────────────────────────────────────────────────────────
        if (!payload.input || payload.input.length === 0) {
            runtime.log("[ERROR] Empty request payload");
            return "Error: Empty request";
        }

        const inputData = decodeJson(payload.input) as HttpRequestPayload;
        const action =
            inputData.action ??
            (inputData.marketId !== undefined ? "settle" : "create");

        if (action === "settle") {
            if (inputData.marketId === undefined) {
                runtime.log("[ERROR] marketId is required for settlement");
                return "Error: marketId is required";
            }

            const marketId = BigInt(inputData.marketId);
            return settleMarket(runtime, marketId, inputData.question);
        }

        runtime.log(`[Step 1] Received market question: "${inputData.question}"`);

        if (!inputData.question || inputData.question.trim().length === 0) {
            runtime.log("[ERROR] Question is required");
            return "Error: Question is required";
        }

        // ─────────────────────────────────────────────────────────────
        // Step 2: Setup EVM client
        // ─────────────────────────────────────────────────────────────
        const evmConfig = runtime.config.evms[0];
        runtime.log(`[Step 2] Target contract: ${evmConfig.marketAddress}`);
        runtime.log(`[Step 2] Chain: ${evmConfig.chainSelectorName}`);

        const network = getNetwork({
            chainFamily: "evm",
            chainSelectorName: evmConfig.chainSelectorName,
            isTestnet: true,
        });

        if (!network) {
            throw new Error(`Unknown chain: ${evmConfig.chainSelectorName}`);
        }

        const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

        // ─────────────────────────────────────────────────────────────
        // Step 3: Encode question and generate report
        // ─────────────────────────────────────────────────────────────
        runtime.log("[Step 3] Encoding question for contract...");

        // Encode question as ABI parameter (no prefix = createMarket)
        const encodedQuestion = encodeAbiParameters(QUESTION_PARAMS, [
            inputData.question,
        ]);

        runtime.log(`[Step 3] Encoded data: ${encodedQuestion.slice(0, 66)}...`);

        // Generate signed report
        const reportResponse = runtime
            .report({
                encodedPayload: hexToBase64(encodedQuestion),
                encoderName: "evm",
                signingAlgo: "ecdsa",
                hashingAlgo: "keccak256",
            })
            .result();

        runtime.log("[Step 3] ✓ Report generated");

        // ─────────────────────────────────────────────────────────────
        // Step 4: Write to contract (EVM Write)
        // ─────────────────────────────────────────────────────────────
        runtime.log("[Step 4] Writing to contract...");

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
            runtime.log(`[Step 4] ✓ Market created successfully!`);
            runtime.log(`[Step 4] TX Hash: ${txHash}`);
            runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            return `Market created: ${txHash}`;
        }

        throw new Error(`Transaction failed: ${writeResult.txStatus}`);

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.log(`[ERROR] ${msg}`);
        runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        throw err;
    }
}
