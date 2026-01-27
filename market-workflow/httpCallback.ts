/**
 * CRE Bootcamp - HTTP Trigger Callback
 *
 * Handles HTTP requests to create prediction markets.
 * This file processes incoming requests and validates the payload.
 */
import {
    cre,
    type Runtime,
    type HTTPPayload,
    decodeJson,
} from "@chainlink/cre-sdk";

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

/**
 * HTTP Trigger callback function
 * Called when an HTTP request is received by the workflow
 */
export function onHttpTrigger(runtime: Runtime<Config>, payload: HTTPPayload): string {
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log("CRE Workflow: HTTP Trigger - Create Market");
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Step 1: Validate that we have a payload
    if (!payload.input || payload.input.length === 0) {
        runtime.log("[ERROR] Empty request payload");
        return "Error: Empty request";
    }

    // Step 2: Parse the JSON payload
    const inputData = decodeJson(payload.input) as CreateMarketPayload;
    runtime.log(`[Step 1] Received market question: "${inputData.question}"`);

    // Step 3: Validate the question
    if (!inputData.question || inputData.question.trim().length === 0) {
        runtime.log("[ERROR] Question is required");
        return "Error: Question is required";
    }

    // Log configuration info
    runtime.log(`[Config] Target contract: ${runtime.config.evms[0]?.marketAddress || "Not configured"}`);
    runtime.log(`[Config] Chain: ${runtime.config.evms[0]?.chainSelectorName || "Not configured"}`);

    // Steps 4-6: EVM Write (will be completed in the next chapter)
    // We'll add the contract interaction logic here

    runtime.log("[Step 2] Ready for EVM Write (next chapter)");
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return "Success";
}
