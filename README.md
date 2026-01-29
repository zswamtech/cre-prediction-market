# 🔮 CRE AI Prediction Market

> **Decentralized prediction markets with AI-powered settlement and automated price oracles using Chainlink Runtime Environment (CRE)**

[![Chainlink](https://img.shields.io/badge/Chainlink-CRE-375BD2?style=flat&logo=chainlink)](https://docs.chain.link/cre)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?style=flat&logo=solidity)](https://soliditylang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Network](https://img.shields.io/badge/Network-Sepolia-7B3FE4?style=flat&logo=ethereum)](https://sepolia.etherscan.io/)
[![CoinGecko](https://img.shields.io/badge/Prices-CoinGecko-8BC53F?style=flat)](https://www.coingecko.com/)

---

## 🆕 What's New (v2.0)

- ✨ **Cron Trigger Auto-Settlement** - Price markets settle automatically every hour
- 🔄 **CoinGecko Price Feed** - Real-time BTC/ETH/SOL prices with CRE consensus
- 🧠 **Improved AI Prompts** - Better question classification and confidence scoring
- 📊 **Dual Settlement System** - AI for complex questions, Price API for crypto markets

---

## 🎯 Overview

This project demonstrates a **fully decentralized prediction market** where:

1. **Users create markets** with yes/no questions (e.g., "Will Bitcoin exceed $100k in 2026?")
2. **Participants stake ETH** on their predictions
3. **Settlement happens automatically:**
   - 🤖 **AI-powered** (Gemini) for complex questions
   - 📈 **Price-based** (CoinGecko) for crypto price markets
4. **CRE ensures trustless settlement** through decentralized consensus
5. **Winners claim rewards** automatically

### Why CRE?

Traditional prediction markets rely on centralized oracles that can be manipulated. CRE solves this by:

- Running the same AI query across **multiple independent nodes**
- Requiring **BFT consensus** (2/3 agreement) before settlement
- Making results **cryptographically verifiable** on-chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE (v2.0)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   [User]                                                                    │
│      │                                                                      │
│      ▼                                                                      │
│   [Smart Contract] ──── requestSettlement() ────▶ [SettlementRequested]    │
│                                                          │                  │
│                    ┌─────────────────────────────────────┤                  │
│                    │                                     │                  │
│                    ▼                                     ▼                  │
│           [CRE Cron Trigger]                   [CRE Log Trigger]           │
│           (Every hour)                         (On-demand)                  │
│                    │                                     │                  │
│                    ▼                                     ▼                  │
│           [Workflow DON]                        [Workflow DON]              │
│                    │                                     │                  │
│          ┌────────┴────────┐               ┌────────────┴────────┐         │
│          ▼                 ▼               ▼                     ▼         │
│    [EVM Read]        [CoinGecko]     [EVM Read]           [Gemini AI]      │
│    (Markets)         (BTC/ETH/SOL)   (Market Data)        (Outcome)        │
│          │                 │               │                     │         │
│          └────────┬────────┘               └──────────┬──────────┘         │
│                   ▼                                   ▼                    │
│            [Price Check]                        [AI Response]              │
│            (> or < target)                      (YES/NO + confidence)      │
│                   │                                   │                    │
│                   └───────────────┬───────────────────┘                    │
│                                   ▼                                        │
│                            [BFT Consensus]                                 │
│                                   │                                        │
│                                   ▼                                        │
│                            [EVM Write]                                     │
│                            (Settlement)                                    │
│                                   │                                        │
│                                   ▼                                        │
│   [Smart Contract] ◀──── onReport() ◀──── [Verified Result]               │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+ or [Bun](https://bun.sh/) v1.0+
- [CRE CLI](https://docs.chain.link/cre/getting-started/installation) v1.0.6+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for contracts)
- Google Gemini API key with [billing enabled](https://console.cloud.google.com/billing)

### Installation

```bash
# Clone the repository
git clone https://github.com/zswamtech/cre-prediction-market.git
cd cre-prediction-market

# Install workflow dependencies
cd market-workflow
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys
```

### Configuration

Create `.env` file in the project root:

```env
# Ethereum private key (Sepolia testnet - without 0x prefix)
CRE_ETH_PRIVATE_KEY=your_private_key_here

# CRE target
CRE_TARGET=staging-settings

# Gemini API Key (requires Google Cloud billing)
GEMINI_API_KEY_VAR=your_gemini_api_key_here
```

### Run Simulation

**Option 1: AI Settlement (Log Trigger)**
```bash
cre workflow simulate market-workflow --trigger-index 1 \
  --evm-tx-hash <SETTLEMENT_REQUEST_TX_HASH> \
  --evm-event-index 0 --non-interactive --broadcast
```

**Option 2: Auto-Settlement (Cron Trigger)** 🆕
```bash
cre workflow simulate market-workflow --trigger-index 2 --non-interactive --broadcast
```

| Trigger Index | Type | Description |
|---------------|------|-------------|
| 0 | HTTP | Create markets via API |
| 1 | Log (EVM) | AI-powered settlement (Gemini) |
| 2 | Cron | Auto-settlement for price markets |

---

## 📁 Project Structure

```
cre-prediction-market/
├── contracts/                 # Solidity smart contracts (Foundry)
│   └── src/
│       ├── PredictionMarket.sol    # Main prediction market contract
│       └── interfaces/
│           └── ReceiverTemplate.sol # CRE receiver interface
├── market-workflow/           # CRE workflow (TypeScript)
│   ├── main.ts               # Workflow entry point (3 triggers)
│   ├── httpCallback.ts       # HTTP trigger handler (create markets)
│   ├── logCallback.ts        # Log trigger handler (AI settlement)
│   ├── cronCallback.ts       # 🆕 Cron trigger handler (auto-settlement)
│   ├── gemini.ts             # Gemini AI integration
│   ├── config.staging.json   # Staging configuration
│   └── workflow.yaml         # Workflow settings
├── docs/                     # Documentation
│   └── CRE_UNDERSTANDING.md  # CRE concepts explained
├── project.yaml              # CRE project settings
├── secrets.yaml              # Secret mappings (API keys)
└── README.md                 # This file
```

---

## 🔗 Deployed Contracts (Sepolia Testnet)

| Contract | Address | Etherscan |
|----------|---------|-----------|
| PredictionMarket | `0x33e7D49d945f3b20e4426440B5DdBB86269689EF` | [View](https://sepolia.etherscan.io/address/0x33e7D49d945f3b20e4426440B5DdBB86269689EF) |
| Keystone Forwarder | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` | [View](https://sepolia.etherscan.io/address/0x15fC6ae953E024d975e77382eEeC56A9101f9F88) |

---

## 🧪 Demo: Successful Settlement

| Field | Value |
|-------|-------|
| **Transaction** | [`0x448ce0186c8ef757d05e4de8354bf312b2daf57501bed48accd6a2a9b4eb2a72`](https://sepolia.etherscan.io/tx/0x448ce0186c8ef757d05e4de8354bf312b2daf57501bed48accd6a2a9b4eb2a72) |
| **Market Question** | "Will Bitcoin exceed 100k USD in 2026?" |
| **AI Result** | NO |
| **Confidence** | 100% |
| **Status** | ✅ Settled on-chain |

### Simulation Output (AI Settlement)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRE Workflow: Log Trigger - Settle Market
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Step 1] Settlement requested for Market #13
[Step 1] Question: "Superará Ethereum los $10,000 USD antes del 31 de enero de 2026?"
[Step 2] Reading market details from contract...
[Step 2] Already settled: false
[Step 3] Querying Gemini AI...
[Gemini] Response received: {"result":"NO","confidence":10000}
[Step 3] AI Result: NO
[Step 3] AI Confidence: 100%
[Step 4] ✓ Settlement successful: 0x1de1e0b15fcbf480dd6d405fd74da3a399ffda81d0fb16b24cdeeaf92ce65960
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🆕 Demo: Auto-Settlement with Cron Trigger

| Field | Value |
|-------|-------|
| **Transaction** | [`0xd3c6cbbe43f29a5bd16122cbe0a0f633c7cb53e11dba1c1eb07f79852d44be03`](https://sepolia.etherscan.io/tx/0xd3c6cbbe43f29a5bd16122cbe0a0f633c7cb53e11dba1c1eb07f79852d44be03) |
| **Market Question** | "¿Superará Bitcoin los $90,000 USD?" |
| **Price Source** | CoinGecko API (BTC: $85,096) |
| **Result** | NO (Price < Target) |
| **Confidence** | 90% |
| **Status** | ✅ Auto-settled on-chain |

### Simulation Output (Auto-Settlement)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRE Workflow: Cron Trigger - Auto Settlement Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Step 1] Fetching total market count...
[Step 1] Total markets: 15
[Step 2] Scanning for unsettled price-based markets...
[Step 2] Market #14: "Superará Bitcoin los $90,000 USD?..."
[Step 2] → Parsed: BTC > $90000
[Step 2] Found 1 markets to check
[Step 3] Fetching current prices from CoinGecko...
[Step 3] BTC: $85096
[Step 4] Evaluating conditions and settling markets...
[Step 4] Market #14: BTC ($85096) > $90000
[Step 4] → Result: NO (confidence: 90%)
[Step 4] ✓ Market #14 settled: 0xd3c6cbbe43f29a5bd16122cbe0a0f633c7cb53e11dba1c1eb07f79852d44be03
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🛠️ How It Works

### 1. Market Creation

Users call `createMarket(question)` on the smart contract:

```solidity
function createMarket(string memory question) public returns (uint256 marketId)
```

### 2. Making Predictions

Participants stake ETH on YES or NO:

```solidity
function predict(uint256 marketId, Prediction prediction) external payable
```

### 3. Settlement Request

Anyone can request settlement by calling:

```solidity
function requestSettlement(uint256 marketId) external
```

This emits a `SettlementRequested` event that triggers the CRE workflow.

### 4. AI-Powered Settlement (CRE Workflow)

The workflow:
1. **Detects** the `SettlementRequested` event (Log Trigger)
2. **Reads** market details from the contract (EVM Read)
3. **Queries** Gemini AI for the outcome (HTTP)
4. **Verifies** consensus across CRE nodes
5. **Writes** the settlement back to the contract (EVM Write)

### 5. Claiming Winnings

Winners call `claim(marketId)` to receive their proportional share of the pool.

---

## 🔐 Security Features

| Feature | Description |
|---------|-------------|
| **Decentralized Consensus** | Multiple CRE nodes must agree on AI response |
| **BFT Tolerance** | System works even if 1/3 of nodes are malicious |
| **On-Chain Verification** | All settlements are verifiable on Ethereum |
| **Keystone Forwarder** | Only authorized CRE reports can settle markets |

---

## 📊 CRE Capabilities Used

| Capability | Purpose | Trigger |
|------------|---------|---------|
| **Log Trigger** | Detect `SettlementRequested` events on-chain | AI Settlement |
| **Cron Trigger** | 🆕 Run auto-settlement every hour | Price Settlement |
| **EVM Read** | Read market data from smart contract | Both |
| **HTTP Client** | Query Gemini AI / CoinGecko API | Both |
| **Consensus** | Ensure all nodes agree on response | Both |
| **EVM Write** | Write verified settlement to blockchain | Both |

### Settlement Methods Comparison

| Method | Trigger | Data Source | Best For |
|--------|---------|-------------|----------|
| **AI Settlement** | Log (on-demand) | Gemini AI + Google Search | Complex questions, events, sports |
| **Auto Settlement** | Cron (hourly) | CoinGecko Price API | Crypto price targets (BTC, ETH, SOL) |

---

## 🏆 Hackathon Submission

This project is submitted for **Convergence: A Chainlink Hackathon**

### Tracks

| Track | Prize | Fit |
|-------|-------|-----|
| **CRE & AI** | $20,000 | AI-powered oracle using Gemini |
| **Prediction Markets** | $20,000 | Decentralized market settlement |

### Requirements Met

- ✅ CRE workflow as orchestration layer
- ✅ Integrates blockchain with external AI (Gemini)
- ✅ Integrates blockchain with external price API (CoinGecko)
- ✅ Multiple trigger types (Log, Cron, HTTP)
- ✅ Successful simulations demonstrated (AI + Auto-settlement)
- ✅ Public source code with documentation

---

## 👤 Author

**Andrés Soto**

- 🌐 Location: Medellín, Colombia
- 💼 GitHub: [@zswamtech](https://github.com/zswamtech)

---

## 📜 License

This project is licensed under the MIT License.

---

## 🔗 Resources

- [CRE Documentation](https://docs.chain.link/cre)
- [CRE Bootcamp GitBook](https://chainlink.gitbook.io/cre-bootcamp)
- [Convergence Hackathon](https://hack.chain.link)
- [Simulating Workflows](https://docs.chain.link/cre/guides/operations/simulating-workflows)
- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)