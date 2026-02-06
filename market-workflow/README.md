# 🔮 CRE AI Prediction Market - Workflow

> **Chainlink Runtime Environment workflow for AI-powered prediction market settlement**

[![CRE SDK](https://img.shields.io/badge/CRE_SDK-1.0.6-375BD2?style=flat&logo=chainlink)](https://docs.chain.link/cre)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0-FBF0DF?style=flat&logo=bun)](https://bun.sh/)

---

## 📋 Overview

This workflow implements a decentralized prediction market oracle using CRE. It:

1. **Listens for settlement requests** via Log Trigger (on-chain events)
2. **Reads market data** from the smart contract (EVM Read)
3. **Queries Gemini AI** to determine the outcome (HTTP)
4. **Writes the settlement** back to blockchain (EVM Write)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WORKFLOW FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   [SettlementRequested Event]                                               │
│              │                                                              │
│              ▼                                                              │
│   ┌──────────────────────┐                                                  │
│   │  1. LOG TRIGGER      │  Detects on-chain event                          │
│   └──────────────────────┘                                                  │
│              │                                                              │
│              ▼                                                              │
│   ┌──────────────────────┐                                                  │
│   │  2. EVM READ         │  Gets market details (question, pools, status)   │
│   └──────────────────────┘                                                  │
│              │                                                              │
│              ▼                                                              │
│   ┌──────────────────────┐                                                  │
│   │  3. GEMINI AI        │  Determines outcome: YES/NO + confidence         │
│   └──────────────────────┘                                                  │
│              │                                                              │
│              ▼                                                              │
│   ┌──────────────────────┐                                                  │
│   │  4. CONSENSUS        │  CRE nodes verify identical responses            │
│   └──────────────────────┘                                                  │
│              │                                                              │
│              ▼                                                              │
│   ┌──────────────────────┐                                                  │
│   │  5. EVM WRITE        │  Settles market on-chain via signed report       │
│   └──────────────────────┘                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.0+ or Node.js v18+
- [CRE CLI](https://docs.chain.link/cre/getting-started/installation) v1.0.6+
- Google Gemini API key with [billing enabled](https://aistudio.google.com/apikey)
- Funded Sepolia wallet

### Installation

```bash
# Install dependencies
bun install

# Or with npm
npm install
```

### Configuration

1. **Create `.env` file** in the project root (`prediction-market/`):

```env
# Ethereum private key (Sepolia testnet - without 0x prefix)
CRE_ETH_PRIVATE_KEY=your_private_key_here

# CRE target
CRE_TARGET=staging-settings

# Gemini API Key (requires Google Cloud billing)
GEMINI_API_KEY_VAR=your_gemini_api_key_here
```

2. **Verify `secrets.yaml`** maps the API key correctly:

```yaml
secretsNames:
    GEMINI_API_KEY:
        - GEMINI_API_KEY_VAR
```

3. **Check `config.staging.json`** has correct contract address:

```json
{
  "geminiModel": "gemini-2.0-flash",
  "oracleBaseUrl": "http://127.0.0.1:3001",
  "evms": [{
    "marketAddress": "0x33e7D49d945f3b20e4426440B5DdBB86269689EF",
    "chainSelectorName": "ethereum-testnet-sepolia",
    "gasLimit": "500000"
  }]
}
```

---

## 🧪 Running Simulations

### Option 1: Log Trigger (Settlement)

Simulates settling a market when `SettlementRequested` event is detected:

```bash
# From project root (prediction-market/)
cre workflow simulate market-workflow --broadcast
```

Select:
- **Trigger**: `2` (Log Trigger)
- **TX Hash**: A transaction that emitted `SettlementRequested`
- **Event Index**: `0`

**Example successful output:**
```
[Step 1] Settlement requested for Market #0
[Step 1] Question: "Will Bitcoin exceed 100k USD in 2026?"
[Step 2] Reading market details from contract...
[Step 2] Market creator: 0x7f21851D163C3477E7527c6669580E15129A4833
[Step 3] Querying Gemini AI...
[Gemini] Response received: {"result":"NO","confidence":10000}
[Step 3] AI Result: NO
[Step 3] AI Confidence: 100%
[Step 4] ✓ Settlement successful: 0x448ce0...
```

### Option 2: HTTP Trigger (Create Market)

Simulates creating a new market via HTTP request:

```bash
cre workflow simulate market-workflow --broadcast
```

Select:
- **Trigger**: `1` (HTTP Trigger)
- Provide JSON body with market question

---

## 📁 File Structure

```
market-workflow/
├── main.ts              # Workflow entry point - registers handlers
├── logCallback.ts       # Log trigger handler - settlement logic
├── httpCallback.ts      # HTTP trigger handler - market creation
├── gemini.ts            # Gemini AI integration
├── config.staging.json  # Staging environment config
├── config.production.json # Production config
├── workflow.yaml        # CRE workflow settings
├── package.json         # Dependencies
└── tsconfig.json        # TypeScript config
```

---

## 🛠️ Key Components

### Triggers

| File | Trigger Type | Purpose |
|------|--------------|---------|
| `main.ts` | HTTP | Create new prediction markets |
| `main.ts` | Log (EVM) | Settle markets on `SettlementRequested` event |

### Capabilities Used

| Capability | File | Purpose |
|------------|------|---------|
| `EVMClient.callContract` | `logCallback.ts` | Read market data |
| `HTTPClient.sendRequest` | `gemini.ts` | Query Gemini AI |
| `runtime.report` | `logCallback.ts` | Generate signed report |
| `EVMClient.writeReport` | `logCallback.ts` | Write settlement |

### AI Integration (`gemini.ts`)

- **Model**: Gemini 2.0 Flash
- **Output Format**: `{"result": "YES" | "NO", "confidence": 0-10000}`
- **Consensus**: `consensusIdenticalAggregation` ensures all nodes agree

---

## 🔧 Troubleshooting

### Error: 429 - Quota Exceeded

```
Gemini API error: 429 - Resource exhausted
```

**Solution**: 
1. Enable billing on [Google Cloud Console](https://console.cloud.google.com/billing)
2. Link billing to your project with Generative Language API
3. Wait 2 minutes for quota to reset

### Error: Context Deadline Exceeded (Timeout)

```
context deadline exceeded (Client.Timeout exceeded)
```

**Solution**: 
- Remove `google_search` from Gemini request (already done in `gemini.ts`)
- CRE has ~30s timeout; searches take longer

### Error: Market Already Settled

```
[Step 2] Market already settled, skipping...
```

**Solution**: Use a different market ID or create a new market

---

## 📊 Demo Transactions

| Action | TX Hash | Status |
|--------|---------|--------|
| Settlement | [`0x448ce018...`](https://sepolia.etherscan.io/tx/0x448ce0186c8ef757d05e4de8354bf312b2daf57501bed48accd6a2a9b4eb2a72) | ✅ Success |

---

## 🔗 Related Files

- **Smart Contract**: `../contracts/src/PredictionMarket.sol`
- **Project Config**: `../project.yaml`
- **Secrets**: `../secrets.yaml`
- **Docs**: `../docs/CRE_UNDERSTANDING.md`

---

## 📜 License

MIT License

---

## 🔗 Resources

- [CRE Documentation](https://docs.chain.link/cre)
- [CRE SDK Reference](https://docs.chain.link/cre/sdk)
- [Simulating Workflows](https://docs.chain.link/cre/guides/operations/simulating-workflows)
- [Gemini API](https://ai.google.dev/gemini-api/docs)
