/**
 * CRE Prediction Market Workflow v2.2
 *
 * Day 1: HTTP Trigger + EVM Write (Create Markets)
 * Day 2: Log Trigger + AI + EVM Write (Settlement)
 * Day 3: Cron Trigger + Chainlink Price Feeds + Auto-Settlement
 * Day 4: Log Trigger + AI + Dispute Resolution (NEW!)
 */
import { cre, Runner, getNetwork } from "@chainlink/cre-sdk";
import { keccak256, toHex } from "viem";
import { onHttpTrigger } from "./httpCallback";
import { onLogTrigger } from "./logCallback";
import { onCronTrigger } from "./cronCallback";
import { onDisputeTrigger } from "./disputeCallback";

// ================================================================
// |                    CONFIGURATION TYPE                        |
// ================================================================
type EvmConfig = {
  marketAddress: string;
  chainSelectorName: string;
  gasLimit: string;
};

type Config = {
  geminiModel: string;
  oracleBaseUrl?: string;
  // Minimum "observation period" after a market/policy is created before it can be settled.
  // Implemented in the workflow (no contract changes).
  minMarketAgeMinutes?: number;
  evms: EvmConfig[];
  disableLogTriggers?: boolean;
  disableCronTrigger?: boolean;
};

// ================================================================
// |                    EVENT SIGNATURES                          |
// ================================================================
const SETTLEMENT_REQUESTED_SIGNATURE = "SettlementRequested(uint256,string)";
const DISPUTE_OPENED_SIGNATURE = "DisputeOpened(uint256,address,string,uint256)";

// ================================================================
// |                    WORKFLOW SETUP                            |
// ================================================================
const initWorkflow = (config: Config) => {
  // Day 1: HTTP Trigger for creating markets
  const httpCapability = new cre.capabilities.HTTPCapability();
  const httpTrigger = httpCapability.trigger({});

  const handlers = [
    // Day 1: HTTP Trigger - Market Creation
    cre.handler(httpTrigger, onHttpTrigger),
  ];

  // Day 2: Log Trigger for settlement
  if (!config.disableLogTriggers) {
    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName: config.evms[0].chainSelectorName,
      isTestnet: true,
    });

    if (!network) {
      throw new Error(`Network not found: ${config.evms[0].chainSelectorName}`);
    }

    const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
    const settlementEventHash = keccak256(toHex(SETTLEMENT_REQUESTED_SIGNATURE));
    const disputeEventHash = keccak256(toHex(DISPUTE_OPENED_SIGNATURE));

    // Day 2: Log Trigger - Event-Driven Settlement (AI-powered)
    handlers.push(
      cre.handler(
        evmClient.logTrigger({
          addresses: [config.evms[0].marketAddress],
          topics: [{ values: [settlementEventHash] }],
          confidence: "CONFIDENCE_LEVEL_FINALIZED",
        }),
        onLogTrigger
      )
    );

    // Day 4: Log Trigger - Dispute Resolution (NEW!)
    // Triggered when a user opens a dispute on a settled market
    handlers.push(
      cre.handler(
        evmClient.logTrigger({
          addresses: [config.evms[0].marketAddress],
          topics: [{ values: [disputeEventHash] }],
          confidence: "CONFIDENCE_LEVEL_FINALIZED",
        }),
        onDisputeTrigger
      )
    );
  }

  // Day 3: Cron Trigger for Auto-Settlement (NEW!)
  if (!config.disableCronTrigger) {
    const cronCapability = new cre.capabilities.CronCapability();
    handlers.push(
      cre.handler(
        cronCapability.trigger({
          schedule: "0 * * * *", // Every hour at minute 0
        }),
        onCronTrigger
      )
    );
  }

  return handlers;
};

// ================================================================
// |                       MAIN ENTRY                             |
// ================================================================
export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
