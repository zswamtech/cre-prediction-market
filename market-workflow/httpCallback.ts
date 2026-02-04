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
    hexToBase64,
    bytesToHex,
    TxStatus,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";

// Interface for the HTTP request payload
interface CreateMarketPayload {
    question: string;
}

// Configuration type matching config.staging.json
type Config = {
    geminiModel: string;
    evms: Array<{
        marketAddress: string;
        chainSelectorName: string;
        gasLimit: string;
    }>;
};

// ABI parameters for encoding the question
const QUESTION_PARAMS = parseAbiParameters("string question");

/**
 * HTTP Trigger callback function
 * Called when an HTTP request is received by the workflow
 */
export function onHttpTrigger(runtime: Runtime<Config>, payload: HTTPPayload): string {
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log("CRE Workflow: HTTP Trigger - Create Market");
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
        // ─────────────────────────────────────────────────────────────
        // Step 1: Validate payload
        // ─────────────────────────────────────────────────────────────
        if (!payload.input || payload.input.length === 0) {
            runtime.log("[ERROR] Empty request payload");
            return "Error: Empty request";
        }

        const inputData = decodeJson(payload.input) as CreateMarketPayload;
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
