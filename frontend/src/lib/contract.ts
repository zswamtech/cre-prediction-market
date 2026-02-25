// V1 Contract (current deployment)
export const PREDICTION_MARKET_ADDRESS = "0x33e7D49d945f3b20e4426440B5DdBB86269689EF" as const;

// V3 Contract — parametric insurance model (deploy separately)
const V3_PLACEHOLDER = "0x0000000000000000000000000000000000000000";
const envV3Address = process.env.NEXT_PUBLIC_PREDICTION_MARKET_V3_ADDRESS;
export const PREDICTION_MARKET_V3_ADDRESS = (
  envV3Address && /^0x[a-fA-F0-9]{40}$/.test(envV3Address)
    ? envV3Address
    : V3_PLACEHOLDER
) as `0x${string}`;

// V2 Contract with Disputes (deploy new contract to use)
// export const PREDICTION_MARKET_V2_ADDRESS = "0x..." as const;

// Constants for dispute system
export const DISPUTE_PERIOD = 24 * 60 * 60; // 24 hours in seconds
export const MIN_DISPUTE_STAKE = "0.01"; // 0.01 ETH
export const DISPUTE_CONFIDENCE_THRESHOLD = 9000; // 90%

export const PREDICTION_MARKET_ABI = [
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
  {
    name: "getNextMarketId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getPrediction",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "amount", type: "uint256" },
          { name: "prediction", type: "uint8" },
          { name: "claimed", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "createMarket",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "question", type: "string" }],
    outputs: [{ name: "marketId", type: "uint256" }],
  },
  {
    name: "predict",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "prediction", type: "uint8" },
    ],
    outputs: [],
  },
  {
    name: "requestSettlement",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  // Admin / Testing functions
  {
    name: "setForwarderAddress",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "forwarder", type: "address" }],
    outputs: [],
  },
  {
    name: "onReport",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "metadata", type: "bytes" },
      { name: "report", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

// V2 ABI - Includes dispute functions (for future V2 deployment)
export const PREDICTION_MARKET_V2_ABI = [
  ...PREDICTION_MARKET_ABI,
  // V2 Market struct has additional fields
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
  {
    name: "openDispute",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "canDispute",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "canClaim",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
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

// V3 ABI — PredictionMarketV3 (parametric insurance model)
// stake(marketId, isInsured): true=policyholder/viajero, false=provider/asegurador
// claim(marketId): tier-based payout; contract determines entitlement by stake type
export const PREDICTION_MARKET_V3_ABI = [
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
          { name: "appliedTier", type: "uint8" },
          { name: "appliedPayoutBps", type: "uint16" },
          { name: "confidence", type: "uint16" },
          { name: "reportHash", type: "bytes32" },
          {
            name: "config",
            type: "tuple",
            components: [
              { name: "policyType", type: "uint8" },
              { name: "oracleRef", type: "bytes32" },
              { name: "startTime", type: "uint48" },
              { name: "endTime", type: "uint48" },
              { name: "thresholdPrimary", type: "uint32" },
              { name: "thresholdSecondary", type: "uint32" },
              { name: "payoutBpsTier1", type: "uint16" },
              { name: "payoutBpsTier2", type: "uint16" },
              { name: "maxPayoutWei", type: "uint256" },
            ],
          },
          { name: "totalInsuredPool", type: "uint256" },
          { name: "totalProviderPool", type: "uint256" },
          { name: "totalPaidOut", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getStake",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "amount", type: "uint256" },
          { name: "isInsured", type: "bool" },
          { name: "claimed", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "previewClaim",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "payout", type: "uint256" }],
  },
  {
    name: "getNextMarketId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "createPolicy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "config",
        type: "tuple",
        components: [
          { name: "policyType", type: "uint8" },
          { name: "oracleRef", type: "bytes32" },
          { name: "startTime", type: "uint48" },
          { name: "endTime", type: "uint48" },
          { name: "thresholdPrimary", type: "uint32" },
          { name: "thresholdSecondary", type: "uint32" },
          { name: "payoutBpsTier1", type: "uint16" },
          { name: "payoutBpsTier2", type: "uint16" },
          { name: "maxPayoutWei", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "marketId", type: "uint256" }],
  },
  {
    name: "stake",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "isInsured", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "requestSettlement",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "togglePause",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "globalPaused",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "onReport",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "metadata", type: "bytes" },
      { name: "report", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/*
export const PREDICTION_MARKET_SENDER_ABI = [
  ... CCIP ABI removed for simplicity ...
] as const;

export const CHAIN_CONFIG... removed ...
*/
