/**
 * CRE Prediction Market - Cron Trigger Auto-Settlement
 *
 * This callback runs periodically to:
 * 1. Fetch all active (unsettled) markets
 * 2. Check if price conditions are met using external APIs
 * 3. Auto-settle markets when conditions are verifiable
 *
 * NEW FEATURE for Hackathon: Automated settlement without manual intervention
 */
import {
  cre,
  type Runtime,
  getNetwork,
  bytesToHex,
  hexToBase64,
  TxStatus,
  encodeCallMsg,
  consensusIdenticalAggregation,
  ok,
  type HTTPSendRequester,
} from "@chainlink/cre-sdk";
import {
  parseAbi,
  encodeAbiParameters,
  parseAbiParameters,
  encodeFunctionData,
  decodeFunctionResult,
  zeroAddress,
} from "viem";

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
  outcome: number;
  totalYesPool: bigint;
  totalNoPool: bigint;
  question: string;
}

interface PriceData {
  symbol: string;
  price: number;
  timestamp: number;
}

interface PriceCondition {
  asset: string;       // "BTC", "ETH", etc.
  operator: ">" | "<" | ">=" | "<=";
  targetPrice: number;
  byDate?: string;     // Optional deadline
}

// ================================================================
// |                    CONTRACT ABIs                             |
// ================================================================
const GET_NEXT_MARKET_ID_ABI = [
  {
    name: "getNextMarketId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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
        ],
      },
    ],
  },
] as const;

const SETTLEMENT_PARAMS = parseAbiParameters("uint256 marketId, uint8 outcome, uint16 confidence");

// ================================================================
// |                    PRICE PARSING                             |
// ================================================================
/**
 * Parses a market question to extract price conditions
 * Examples:
 * - "¿Superará Bitcoin los $100,000 USD?" → {asset: "BTC", operator: ">", targetPrice: 100000}
 * - "Will ETH reach $5000?" → {asset: "ETH", operator: ">=", targetPrice: 5000}
 */
function parsePriceCondition(question: string): PriceCondition | null {
  const lowerQuestion = question.toLowerCase();

  // Detect asset
  let asset: string | null = null;
  if (lowerQuestion.includes("bitcoin") || lowerQuestion.includes("btc")) {
    asset = "BTC";
  } else if (lowerQuestion.includes("ethereum") || lowerQuestion.includes("eth")) {
    asset = "ETH";
  } else if (lowerQuestion.includes("solana") || lowerQuestion.includes("sol")) {
    asset = "SOL";
  }

  if (!asset) return null;

  // Detect price target - matches patterns like $100,000 or $100000 or 100000
  const priceMatch = question.match(/\$?([\d,]+(?:\.\d+)?)/);
  if (!priceMatch) return null;

  const targetPrice = parseFloat(priceMatch[1].replace(/,/g, ""));
  if (isNaN(targetPrice)) return null;

  // Detect operator
  let operator: ">" | "<" | ">=" | "<=" = ">";
  if (lowerQuestion.includes("superar") || lowerQuestion.includes("exceed") ||
      lowerQuestion.includes("above") || lowerQuestion.includes("reach")) {
    operator = ">";
  } else if (lowerQuestion.includes("below") || lowerQuestion.includes("under") ||
             lowerQuestion.includes("menos de") || lowerQuestion.includes("debajo")) {
    operator = "<";
  }

  return { asset, operator, targetPrice };
}

// ================================================================
// |                    PRICE FETCHING                            |
// ================================================================
/**
 * Fetches current price from CoinGecko API
 * This provides real-time crypto prices for verification
 */
const fetchCryptoPrice = (
  runtime: Runtime<Config>,
  asset: string
): PriceData => {
  const httpClient = new cre.capabilities.HTTPClient();

  const coinId = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
  }[asset] || "bitcoin";

  const result = httpClient
    .sendRequest(
      runtime,
      buildPriceRequest(coinId),
      consensusIdenticalAggregation<PriceData>()
    )(runtime.config)
    .result();

  return result;
};

const buildPriceRequest = (coinId: string) =>
  (sendRequester: HTTPSendRequester, config: Config): PriceData => {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;

    const req = {
      url,
      method: "GET" as const,
      headers: {
        "Accept": "application/json",
      },
      cacheSettings: {
        store: true,
        maxAge: "60s", // Cache for 1 minute
      },
    };

    const resp = sendRequester.sendRequest(req).result();
    const bodyText = new TextDecoder().decode(resp.body);

    if (!ok(resp)) {
      throw new Error(`CoinGecko API error: ${resp.statusCode} - ${bodyText}`);
    }

    const data = JSON.parse(bodyText);
    const price = data[coinId]?.usd;

    if (!price) {
      throw new Error(`Could not get price for ${coinId}`);
    }

    const symbol = coinId === "bitcoin" ? "BTC" :
                   coinId === "ethereum" ? "ETH" :
                   coinId === "solana" ? "SOL" : coinId.toUpperCase();

    return {
      symbol,
      price,
      timestamp: Date.now(),
    };
  };

// ================================================================
// |                    CONDITION EVALUATION                      |
// ================================================================
/**
 * Evaluates if the price condition is met
 */
function evaluateCondition(
  condition: PriceCondition,
  currentPrice: number
): { met: boolean; confidence: number } {
  let met = false;

  switch (condition.operator) {
    case ">":
      met = currentPrice > condition.targetPrice;
      break;
    case "<":
      met = currentPrice < condition.targetPrice;
      break;
    case ">=":
      met = currentPrice >= condition.targetPrice;
      break;
    case "<=":
      met = currentPrice <= condition.targetPrice;
      break;
  }

  // Calculate confidence based on how clearly the condition is met/not met
  const percentDiff = Math.abs((currentPrice - condition.targetPrice) / condition.targetPrice) * 100;

  let confidence: number;
  if (percentDiff > 10) {
    confidence = 9500; // Very clear result
  } else if (percentDiff > 5) {
    confidence = 9000; // Clear result
  } else if (percentDiff > 2) {
    confidence = 8500; // Moderately clear
  } else {
    confidence = 8000; // Close to threshold
  }

  return { met, confidence };
}

// ================================================================
// |                    SETTLEMENT EXECUTION                      |
// ================================================================
function settleMarket(
  runtime: Runtime<Config>,
  evmClient: ReturnType<typeof cre.capabilities.EVMClient>,
  marketId: bigint,
  outcome: number,
  confidence: number
): string {
  const evmConfig = runtime.config.evms[0];

  // Encode settlement data
  const settlementData = encodeAbiParameters(SETTLEMENT_PARAMS, [
    marketId,
    outcome,
    confidence,
  ]);

  // Prepend 0x01 prefix for settlement routing
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
    return bytesToHex(writeResult.txHash || new Uint8Array(32));
  }

  throw new Error(`Settlement failed: ${writeResult.txStatus}`);
}

// ================================================================
// |                    CRON TRIGGER HANDLER                      |
// ================================================================
export function onCronTrigger(runtime: Runtime<Config>): string {
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  runtime.log("CRE Workflow: Cron Trigger - Auto Settlement Check");
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

    const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

    // ─────────────────────────────────────────────────────────────
    // Step 1: Get total number of markets
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 1] Fetching total market count...");

    const countCallData = encodeFunctionData({
      abi: GET_NEXT_MARKET_ID_ABI,
      functionName: "getNextMarketId",
    });

    const countResult = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: evmConfig.marketAddress as `0x${string}`,
          data: countCallData,
        })
      })
      .result();

    const totalMarkets = decodeFunctionResult({
      abi: GET_NEXT_MARKET_ID_ABI,
      functionName: "getNextMarketId",
      data: bytesToHex(countResult.data),
    }) as bigint;

    runtime.log(`[Step 1] Total markets: ${totalMarkets}`);

    if (totalMarkets === 0n) {
      runtime.log("[Step 1] No markets found, nothing to check");
      return "No markets to check";
    }

    // ─────────────────────────────────────────────────────────────
    // Step 2: Find unsettled price-based markets
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 2] Scanning for unsettled price-based markets...");

    const marketsToSettle: Array<{
      id: bigint;
      market: Market;
      condition: PriceCondition;
    }> = [];

    // Check last 10 markets (to limit gas/time)
    const startId = totalMarkets > 10n ? totalMarkets - 10n : 0n;

    for (let i = startId; i < totalMarkets; i++) {
      const marketCallData = encodeFunctionData({
        abi: GET_MARKET_ABI,
        functionName: "getMarket",
        args: [i],
      });

      const marketResult = evmClient
        .callContract(runtime, {
          call: encodeCallMsg({
            from: zeroAddress,
            to: evmConfig.marketAddress as `0x${string}`,
            data: marketCallData,
          })
        })
        .result();

      const market = decodeFunctionResult({
        abi: GET_MARKET_ABI,
        functionName: "getMarket",
        data: bytesToHex(marketResult.data),
      }) as unknown as Market;

      // Skip settled markets
      if (market.settled) continue;

      // Try to parse price condition from question
      const condition = parsePriceCondition(market.question);
      if (condition) {
        runtime.log(`[Step 2] Market #${i}: "${market.question.substring(0, 50)}..."`);
        runtime.log(`[Step 2] → Parsed: ${condition.asset} ${condition.operator} $${condition.targetPrice}`);
        marketsToSettle.push({ id: i, market, condition });
      }
    }

    if (marketsToSettle.length === 0) {
      runtime.log("[Step 2] No unsettled price-based markets found");
      return "No price markets to settle";
    }

    runtime.log(`[Step 2] Found ${marketsToSettle.length} markets to check`);

    // ─────────────────────────────────────────────────────────────
    // Step 3: Fetch current prices
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 3] Fetching current prices from CoinGecko...");

    // Get unique assets needed
    const assets = [...new Set(marketsToSettle.map(m => m.condition.asset))];
    const prices: Record<string, number> = {};

    for (const asset of assets) {
      const priceData = fetchCryptoPrice(runtime, asset);
      prices[asset] = priceData.price;
      runtime.log(`[Step 3] ${asset}: $${priceData.price.toLocaleString()}`);
    }

    // ─────────────────────────────────────────────────────────────
    // Step 4: Evaluate and settle markets
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 4] Evaluating conditions and settling markets...");

    const results: string[] = [];

    for (const { id, market, condition } of marketsToSettle) {
      const currentPrice = prices[condition.asset];
      const { met, confidence } = evaluateCondition(condition, currentPrice);

      // Determine outcome: 0 = YES, 1 = NO
      const outcome = met ? 0 : 1;
      const outcomeStr = met ? "YES" : "NO";

      runtime.log(`[Step 4] Market #${id}: ${condition.asset} ($${currentPrice}) ${condition.operator} $${condition.targetPrice}`);
      runtime.log(`[Step 4] → Result: ${outcomeStr} (confidence: ${confidence / 100}%)`);

      try {
        const txHash = settleMarket(runtime, evmClient, id, outcome, confidence);
        runtime.log(`[Step 4] ✓ Market #${id} settled: ${txHash}`);
        results.push(`Market #${id}: ${outcomeStr} (${txHash.substring(0, 10)}...)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.log(`[Step 4] ✗ Market #${id} failed: ${msg}`);
        results.push(`Market #${id}: FAILED`);
      }
    }

    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return results.length > 0
      ? `Auto-settled: ${results.join(", ")}`
      : "No markets met settlement conditions";

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] ${msg}`);
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    throw err;
  }
}
