# 🏠 FairLease — Parametric Rental Insurance (Chainlink CRE + AI)

> **Underwriting pools + automatic payouts when “Quality of Life” breaches are proven by real‑world data.**

This repo is built for **Convergence (Chainlink Hackathon 2026)**.

FairLease reframes “prediction markets” as **parametric insurance policies**:

- **YES = Claim approved (payout is activated)**
- **NO = No claim**

Policies are settled by a **Chainlink CRE workflow** that orchestrates:

- On-chain reads/writes (Sepolia)
- A real-world **IoT / urban metrics oracle** (noise, safety, construction)
- A real-world **Weather API** (Open‑Meteo)
- **Gemini** (AI verdict) with verifiable CRE execution

---

## 💡 The real-world problem

In rentals and leases, disputes are common:

- Noise (parties, street, construction)
- Safety issues
- Unexpected disruptions (construction works, extreme weather)

Today, refunds/discounts are often **manual, slow, and subjective**.

FairLease turns this into a verifiable parametric policy:

> “If X conditions happen during the coverage window, a payout is automatically triggered.”

---

## ✅ What we built (MVP)

- A **policy/market smart contract** (Sepolia) with pools:
  - Pool **YES (payout)** funds claims
  - Pool **NO (no-claim)** funds the opposite side
- A **Next.js frontend** to create policies, fund pools, request settlement, and claim winnings
- A **Chainlink CRE workflow** to settle policies:
  1. Reads policy metadata from the contract
  2. Pulls “official” metrics from the oracle service (IoT)
  3. Pulls “official” weather from Open‑Meteo
  4. Queries Gemini and enforces strict JSON output (`YES/NO + confidence`)
  5. Writes the settlement report on-chain so winners can claim
- A simple **observation period rule** (no contract changes):
  - the workflow refuses to settle if the policy was created too recently

---

## 🔗 Contracts (Sepolia)

| Contract | Address |
|---|---|
| `PredictionMarket` | `0x33e7D49d945f3b20e4426440B5DdBB86269689EF` |
| `KeystoneForwarder` | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |

---

## 🧪 Demo scenarios (guaranteed YES and guaranteed NO)

The included oracle mock (`docs/integration/server-oracle.js`) is deterministic:

- **Property ID 1 (expected YES / payout)**  
  `noiseLevelDb = 85` and `nearbyConstruction = true` → breach
- **Property ID 2 (expected NO / no-claim)**  
  `noiseLevelDb = 45` and `nearbyConstruction = false` → no breach

Create **two** policies with the same text, changing only the Property ID:

- **Policy A (YES)**:  
  `¿Se activó el payout durante la última hora por incumplimiento de calidad de vida en la Propiedad ID 1 (ruido >70 dB, seguridad <5, obras, o clima severo)?`
- **Policy B (NO)**:  
  `¿Se activó el payout durante la última hora por incumplimiento de calidad de vida en la Propiedad ID 2 (ruido >70 dB, seguridad <5, obras, o clima severo)?`

---

## 🧱 Architecture (high-level)

```text
User (Frontend) ──▶ Sepolia Contract ──▶ “Request AI Settlement” (on-chain)
                            │
                            ▼
                 Chainlink CRE Workflow (TypeScript → WASM)
                            │
        ┌───────────────────┼────────────────────┐
        ▼                   ▼                    ▼
   IoT Oracle (Node)    Open‑Meteo API       Gemini (LLM)
        │                   │                    │
        └───────────────────┴────────────────────┘
                            ▼
                  CRE consensus + EVM writeReport
                            ▼
                  Contract settled (YES/NO + confidence)
                            ▼
                   Users claim winnings (payout)
```

---

## 🚀 Local demo (recommended for the hackathon video)

### Prerequisites

- Node.js 20+
- Bun (for CRE compilation)
- CRE CLI (`cre version` should work)
- A funded Sepolia wallet
- Gemini API key (billing enabled)

### 0) Install dependencies

```bash
cd frontend
npm install

cd ../market-workflow
npm install
```

### 1) Start the Oracle (real-world data source)

```bash
ALLOW_ORIGIN=http://localhost:3000 PORT=3001 node docs/integration/server-oracle.js
```

### 2) Start the Frontend

```bash
cd frontend
NEXT_PUBLIC_ORACLE_BASE_URL=http://127.0.0.1:3001 npm run dev
```

Open `http://localhost:3000` and create your policies.

### 3) Settle a policy with CRE (the “money shot”)

Copy the policy/market number (e.g. `#36`) and run:

```bash
export CRE_TARGET=staging-settings
export ORACLE_BASE_URL=http://127.0.0.1:3001
export CRE_ETH_PRIVATE_KEY=YOUR_PRIVATE_KEY_NO_0x
export GEMINI_API_KEY_VAR=YOUR_GEMINI_KEY

cre workflow simulate market-workflow \
  --target staging-settings \
  --broadcast \
  --trigger-index 0 \
  --http-payload '{"action":"settle","marketId":36}' \
  --non-interactive
```

If everything is correct, the UI updates to **Resolved** and shows **Result: YES/NO**.

---

## ⏳ Observation period (coverage window)

We enforce a minimum policy age in the workflow:

- Staging: `minMarketAgeMinutes` in `market-workflow/config.staging.json`
- Production: `minMarketAgeMinutes` in `market-workflow/config.production.json`

If you try to settle too early, the workflow returns “Too early to settle”.

---

## 🛡️ Safety notes (important for recording the demo)

- Do **NOT** record with `-v` or `--engine-logs` (can print headers / secrets).
- Don’t commit `.env` files, private keys, or API keys.
- If your terminal shows `quote>` you copied “smart quotes” (`’` / `”`).  
  Re-run using plain ASCII quotes: `'` and `"` (examples above are safe).

---

## 🔗 Key files showing Chainlink usage

For the hackathon “Chainlink usage” requirement:

- CRE workflow entry + handlers: `market-workflow/main.ts`
- Manual settlement (HTTP) + observation window: `market-workflow/httpCallback.ts`
- Event-driven settlement (EVM Log): `market-workflow/logCallback.ts`
- AI + oracle + weather integration: `market-workflow/gemini.ts`
- CRE workflow config: `market-workflow/workflow.yaml`
- CRE project targets + RPCs: `project.yaml`
- Secret mapping (no secrets stored): `secrets.yaml`
- Smart contract: `contracts/src/PredictionMarket.sol`

---

## 🏆 Hackathon tracks (recommended)

- **CRE & AI**: AI-in-the-loop decisioning + verifiable execution.
- **Prediction Markets**: automated, verifiable resolution based on offchain signals.
- **Risk & Compliance**: parametric insurance-like safeguards and automated payouts.

---

## 👤 Author

Andrés Soto — Colombia  
GitHub: `@zswamtech`

