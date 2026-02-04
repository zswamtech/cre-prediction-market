// V1 Contract (current deployment)
export const PREDICTION_MARKET_ADDRESS = "0x33e7D49d945f3b20e4426440B5DdBB86269689EF" as const;

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

/*
export const PREDICTION_MARKET_SENDER_ABI = [
  ... CCIP ABI removed for simplicity ...
] as const;

export const CHAIN_CONFIG... removed ...
*/
