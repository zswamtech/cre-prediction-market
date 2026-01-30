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
  evms: EvmConfig[];
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

  // Day 2: Log Trigger for settlement
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

  // Day 3: Cron Trigger for Auto-Settlement (NEW!)
  const cronCapability = new cre.capabilities.CronCapability();

  return [
    // Day 1: HTTP Trigger - Market Creation
    cre.handler(httpTrigger, onHttpTrigger),

    // Day 2: Log Trigger - Event-Driven Settlement (AI-powered)
    cre.handler(
      evmClient.logTrigger({
        addresses: [config.evms[0].marketAddress],
        topics: [{ values: [settlementEventHash] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onLogTrigger
    ),

    // Day 3: Cron Trigger - Auto-Settlement for Price Markets
    // Runs every hour to check if price conditions are met
    cre.handler(
      cronCapability.trigger({
        schedule: "0 * * * *", // Every hour at minute 0
      }),
      onCronTrigger
    ),

    // Day 4: Log Trigger - Dispute Resolution (NEW!)
    // Triggered when a user opens a dispute on a settled market
    cre.handler(
      evmClient.logTrigger({
        addresses: [config.evms[0].marketAddress],
        topics: [{ values: [disputeEventHash] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onDisputeTrigger
    ),
  ];
};

// ================================================================
// |                       MAIN ENTRY                             |
// ================================================================
export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
