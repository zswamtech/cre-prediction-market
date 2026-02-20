# ✈️🏠 FairLease — Parametric Experience Insurance (Chainlink CRE + AI)

> **Underwriting pools + automatic payouts when real-world experience breaches are proven by data.**

This repo is built for **Convergence (Chainlink Hackathon 2026)**.

FairLease reframes “prediction markets” as **parametric insurance policies** for binary outcomes:

- **YES = Claim approved (payout is activated)**
- **NO = No claim**

Policies are settled by a **Chainlink CRE workflow** that orchestrates:

- On-chain reads/writes (Sepolia)
- A real-world **Flight Delay oracle** (delay/cancelation)
- A real-world **IoT / urban metrics oracle** (noise, safety, construction)
- A real-world **Weather API** (Open‑Meteo)
- **Gemini** (AI verdict) with verifiable CRE execution

Core submission path is V1 (current deployed contract/address).  
Current product focus for demo/pitch is **flight delay insurance**; property QoL remains as secondary scenario.

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
- A **policy package builder (off-chain UX)** in `/create`:
  - policy type selector (`Inmueble` / `Viaje`)
  - coverage templates per type
  - bundle/cart draft of multiple policies
  - sequential onchain creation (`1 policy = 1 tx`) with stop-on-first-failure
- A **dynamic pricing module (Phase 3)** that quotes premium/stake/payout by property risk:
  - `/api/quote` consumes oracle signals (`noise`, `safety`, `construction`, `riskScore`, `region`, market snapshot)
  - Applies combined multipliers (base risk + zone + demand)
  - Enforces guardrails for aggressive mode (minimum reserve ratio + max risk score)
- A **Chainlink CRE workflow** to settle policies:
  1. Reads policy metadata from the contract
  2. Pulls “official” metrics from the oracle service (IoT)
  3. Pulls “official” weather from Open‑Meteo
  4. Queries Gemini and enforces strict JSON output (`YES/NO + confidence`)
  5. Writes the settlement report on-chain so winners can claim
- A **World ID anti-fraud layer** (frontend + API, no redeploy):
  - Create gate: `device` or `orb`
  - Flight claim gate: `orb` required
  - Optional PNR hash in claim signal for additional anti-fraud context
- A simple **observation period rule** (no contract changes):
  - the workflow refuses to settle if the policy was created too recently

---

## 🔗 Contracts (Sepolia)

| Contract | Address |
|---|---|
| `PredictionMarket` | `0x33e7D49d945f3b20e4426440B5DdBB86269689EF` |
| `KeystoneForwarder` | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |

## 🌐 Network modes (current)

| Mode | Purpose | RPC | CRE target | Explorer |
|---|---|---|---|---|
| Sepolia public (recommended) | Main demo path (`create -> predict -> settle -> claim`) | `https://ethereum-sepolia-rpc.publicnode.com` | `staging-sepolia-public` | Etherscan |
| Tenderly VNet (optional) | Observability/debug | `https://virtual.sepolia.eu.rpc.tenderly.co/e2f0da8b-1a20-49fd-8e7c-ac48c542cdce` | `staging-settings` | Tenderly Dashboard |
| Private payout (experimental) | Settlement + confidential payout relay | `https://ethereum-sepolia-rpc.publicnode.com` | `staging-private-payout` | Etherscan + Relay logs |

Tenderly remains optional. If you hit quota (`403`) in CRE, switch back to `staging-sepolia-public`.

---

## 🧪 Demo scenarios (guaranteed YES and NO)

The included oracle mock (`docs/integration/server-oracle.js`) is deterministic for both verticals.
For a dedicated flight-only node, use `scripts/server-flight-oracle.js`.

### Flight-delay (main demo path)

- **AV8520 (expected YES / payout)**  
  `status = DELAYED`, `delayMinutes = 78`, `thresholdMinutes = 45`
- **LA4112 (expected NO / no-claim)**  
  `status = ON_TIME`, `delayMinutes = 8`, `thresholdMinutes = 45`

Create two flight policies:

- `¿Se activó el payout por retraso del vuelo AV8520 (>=45 min) o cancelación el 13-02-2026?`
- `¿Se activó el payout por retraso del vuelo LA4112 (>=45 min) o cancelación el 13-02-2026?`

### Property QoL (secondary demo path)

- **Property ID 1 (expected YES / payout)**  
  `noiseLevelDb = 85` and `nearbyConstruction = true`
- **Property ID 2 (expected NO / no-claim)**  
  `noiseLevelDb = 45` and `nearbyConstruction = false`

Business-aligned fixtures (from `alojamientos-medellin` real property set):

- **Property ID 111 (Suite Elegante en Bello, expected NO)**  
  `noiseLevelDb = 58`, `safetyIndex = 7.8`, `nearbyConstruction = false`
- **Property ID 110 (Loft Lujoso en Bello, expected YES)**  
  `noiseLevelDb = 74` → breach by noise threshold
- **Property ID 102 (Penthouse Acogedor en La Estrella, expected YES)**  
  `safetyIndex = 4.7` → breach by safety threshold

Each oracle response now includes `marketSnapshot` (`adr`, `revpar`, `bookings`, etc.) so business metrics and settlement data are aligned in the same payload.

Create **two** policies with the same text, changing only the Property ID:

- **Policy A (YES)**:  
  `¿Se activó el payout durante la última hora por incumplimiento de calidad de vida en la Propiedad ID 1 (ruido >70 dB, seguridad <5, obras, o clima severo)?`
- **Policy B (NO)**:  
  `¿Se activó el payout durante la última hora por incumplimiento de calidad de vida en la Propiedad ID 2 (ruido >70 dB, seguridad <5, obras, o clima severo)?`

### ✈️ Flight-delay oracle endpoint (experience insurance pilot)

`docs/integration/server-oracle.js` and `scripts/server-flight-oracle.js` expose a flight delay endpoint so you can prototype parametric travel experience policies while live data integration is finalized.

- `GET /api/flight-delay/:flightId`
- `GET /api/flight-delay?flightId=AV8520&date=2026-02-13`

Current behavior:

- `demo` mode (default): deterministic fixtures (`AV8520`, `LA4112`, `CM0178`)
- `live` mode: calls external provider (`FLIGHT_API_BASE_URL`)
- `hybrid` mode: tries live first, then deterministic fallback

Response includes:

- `status`, `delayMinutes`, `thresholdMinutes`
- `breachDetected` and `expectedVerdict` (`YES/NO`)
- `source` and `officialSourceUrl`

Useful env vars:

- `FLIGHT_ORACLE_MODE=demo|live|hybrid`
- `FLIGHT_DELAY_THRESHOLD_MINUTES=45`
- `FLIGHT_API_BASE_URL` (required in `live`/`hybrid` for official feed)
- `FLIGHT_API_KEY` (optional auth header)
- `FLIGHT_CONFIDENTIAL_HTTP_ENABLED=1` (workflow uses CRE Confidential HTTP for provider calls)

---

## 🧱 Architecture (high-level)

```text
User (Frontend) ──▶ Sepolia Contract ──▶ “Request AI Settlement” (on-chain)
                            │
                            ▼
                 Chainlink CRE Workflow (TypeScript → WASM)
                            │
        ┌───────────────────┼──────────────────────┬────────────────────┐
        ▼                   ▼                      ▼                    ▼
 Flight Oracle (Node)   IoT Oracle (Node)     Open‑Meteo API       Gemini (LLM)
        │                   │                      │                    │
        └───────────────────┴──────────────────────┴────────────────────┘
                            ▼
                  CRE consensus + EVM writeReport
                            ▼
                  Contract settled (YES/NO + confidence)
                            ▼
                   Users claim winnings (payout)
```

---

## 🧬 Identity Truth: World ID

FairLease now models three trust layers:

- **Data Truth**: Chainlink CRE + oracle signals (flight/property/weather).
- **Logic Truth**: deterministic + AI-assisted decision flow.
- **Identity Truth**: World ID Proof of Humanity (anti-Sybil for create/claim).

Important for this phase:

- No contract redeploy. Enforcement is **frontend + `/api/world-id/verify`**.
- Flight claim requires Orb-level verification.
- Create requires Device-or-higher verification.
- PNR is optional and hashed before being added to claim signal.

---

## 🔒 End-to-End Privacy Architecture (Hackathon)

FairLease now separates privacy in two stages:

- **Input Privacy**: `confidential-http` hides flight-provider API keys in CRE (Vault DON secrets).
- **Output Privacy**: experimental private payout orchestration for flight YES verdicts:
  - onchain settlement remains verifiable via `writeReport`
  - workflow derives a **payout commitment hash** (`keccak256`)
  - workflow sends confidential payout instructions to a relay via `ConfidentialHTTPClient`
  - relay auth token is injected from Vault secret (`PRIVATE_PAYOUT_RELAY_TOKEN`)

Important implementation note:

- Current CRE SDK exposes `confidential-http` and EVM client, but not a first-class
  `private-evm-transfer` capability in this repo version.
- For this reason, output privacy is implemented as **commitment + confidential relay instruction**
  without breaking the live `create -> predict -> settle -> claim` path.

Activation:

- Frontend toggle in `/create`: `🔒 Enable Private Payout (Experimental)` (flight policies)
- Question opt-in tag: `[FF_PRIVATE_PAYOUT]`
- CRE target: `staging-private-payout` (`market-workflow/config.private.json`)

---

## 🧭 Core vs Experimental

### Core Demo Path (enabled by default)

- HTTP settlement trigger (`market-workflow/httpCallback.ts`)
- Oracle IoT + Open-Meteo + Gemini (with deterministic fallback on 429)
- EVM `writeReport` settlement to `PredictionMarket` V1

### Experimental Features (visible, disabled by default)

- `features.logSettlement`: event-driven settlement from `SettlementRequested`
- `features.cronPriceFeeds`: cron auto-settlement for price markets
- `features.disputesV2`: dispute pipeline for V2 contract flows

Feature flags live in:

- `market-workflow/config.staging.json`
- `market-workflow/config.production.json`

---

## 🔄 External State Mirror (optional)

For the “real-time servicing” pattern, FairLease can mirror each successful settlement to an external backend API.

- Config key: `stateSync` in `market-workflow/config.staging.json` and `market-workflow/config.production.json`
- Staging endpoint (connected): `http://127.0.0.1:3002/api/v1/integrations/fairlease/settlements`
- Transport: HTTP `POST` with `X-Idempotency-Key`
- Data mirrored: market ID, question, outcome, confidence, tx hash, trigger source, and decision trace
- Failure mode: non-blocking (onchain settlement still succeeds even if mirror fails)

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
pnpm --dir frontend install
pnpm --dir market-workflow install
```

### 1) Start the Oracle (real-world data source)

```bash
ALLOW_ORIGIN=http://localhost:3000 PORT=3001 node docs/integration/server-oracle.js
```

Flight-only option (separate specialized node):

```bash
ALLOW_ORIGIN=http://localhost:3000 PORT=3101 FLIGHT_ORACLE_MODE=demo node scripts/server-flight-oracle.js
```

Optional private payout relay (experimental output privacy):

```bash
PORT=3003 PRIVATE_PAYOUT_RELAY_TOKEN=local-private-token node scripts/server-private-payout-relay.js
```

### 2) Start the Frontend

```bash
cd frontend
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
NEXT_PUBLIC_RPC_MODE=fallback \
NEXT_PUBLIC_TRACE_WINDOW_BLOCKS=10000 \
NEXT_PUBLIC_TX_WARN_AFTER_MS=25000 \
NEXT_PUBLIC_TX_CONFIRM_TIMEOUT_MS=90000 \
NEXT_PUBLIC_WORLD_ID_ENABLED=0 \
NEXT_PUBLIC_WORLD_ID_APP_ID=app_staging_xxx \
NEXT_PUBLIC_WORLD_ID_ACTION_CREATE=fairlease-create-policy-v1 \
NEXT_PUBLIC_WORLD_ID_ACTION_CLAIM=fairlease-claim-flight-v1 \
NEXT_PUBLIC_WORLD_ID_CREATE_MIN_LEVEL=device \
NEXT_PUBLIC_WORLD_ID_CLAIM_MIN_LEVEL=orb \
NEXT_PUBLIC_ORACLE_BASE_URL=http://127.0.0.1:3001 pnpm dev
```

Open `http://localhost:3000` and create your policies.

If Turbopack crashes on your machine, run frontend in webpack mode:

```bash
cd frontend
rm -rf .next
pnpm dev --webpack
```

### Create flow (new UX)

On `/create`:

1. Select `Tipo de póliza`: `Inmueble` or `Viaje`.
2. Choose a coverage template:
   - Inmueble: `Ruido`, `Seguridad`, `Obras`, `Clima severo`, `Calidad de vida (combinada)`
   - Viaje: `Retraso o cancelación`
3. Generate/edit the binary question.
4. Click `Agregar al paquete`.
5. Click `Crear paquete ahora` to create markets sequentially.

Important:

- `carrito = UX off-chain`
- `1 póliza = 1 tx`
- `1 cobertura = 1 mercado`

Optional safety flags:

```bash
export NEXT_PUBLIC_ENABLE_ADMIN_TOOLS=0
export NEXT_PUBLIC_SHOW_EXPERIMENTAL=0
```

Wallet note: frontend read calls use `NEXT_PUBLIC_SEPOLIA_RPC_URL`, but wallet-signed writes use the active RPC in MetaMask for Sepolia. Keep wallet RPC aligned with demo mode to avoid state mismatch.

Frontend tx confirmation mode:

- `NEXT_PUBLIC_RPC_MODE=fallback` (default demo público): confirms against public Sepolia RPC/fallbacks.
- `NEXT_PUBLIC_RPC_MODE=tenderly_strict` (optional): confirms txs only against Tenderly RPC.
- `NEXT_PUBLIC_TRACE_WINDOW_BLOCKS` (default `10000`) limits historical log window to avoid free-tier RPC range errors.
- `NEXT_PUBLIC_TX_WARN_AFTER_MS` (default `25000`) controls when `rpc_mismatch` warning appears.
- `NEXT_PUBLIC_TX_CONFIRM_TIMEOUT_MS` (default `90000`) controls timeout state for pending txs.

### Modo demo recomendado

| Modo | Red para writes | RPC esperado en wallet | CRE target | Explorer principal |
|---|---|---|---|---|
| Principal (recomendado) | Sepolia pública | `https://ethereum-sepolia-rpc.publicnode.com` | `staging-sepolia-public` | Etherscan |
| Opcional | Tenderly VNet | `https://virtual.sepolia.eu.rpc.tenderly.co/e2f0da8b-1a20-49fd-8e7c-ac48c542cdce` | `staging-settings` | Tenderly Dashboard |

Troubleshooting tx verification:

- If UI shows `rpc_mismatch`, the tx was signed on a different RPC/state than frontend confirmation.
- If UI shows `timeout`, tx took too long to confirm on selected RPC. Keep same hash and retry verification before resubmitting.
- If `createMarket/predict` fails with gas estimation errors, verify wallet **balance** first:
  - `cast balance <WALLET> --rpc-url https://ethereum-sepolia-rpc.publicnode.com`
  - Keep at least `0.001 ETH` in the active MetaMask account for smooth demos.
- If CRE returns `403 quota limit`, switch to `--target staging-sepolia-public`.
- If CRE fails with `PRIVATE_PAYOUT_RELAY_TOKEN_VAR ... not found`, export:
  - `export PRIVATE_PAYOUT_RELAY_TOKEN_VAR=local-dev-private-relay-token`
- If World ID gate appears disabled, check `NEXT_PUBLIC_WORLD_ID_*` env vars.
- If World ID verify fails in local-only demos, set `WORLD_ID_DEV_BYPASS=1` (never in production).

### 3) Settle a policy with CRE (the “money shot”)

Copy the policy/market number (e.g. `#36`) and run:

```bash
export CRE_TARGET=staging-sepolia-public
export ETH_CHAIN_ID=11155111
export SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
export ORACLE_BASE_URL=http://127.0.0.1:3001
export CRE_ETH_PRIVATE_KEY=YOUR_PRIVATE_KEY_NO_0x
export GEMINI_API_KEY_VAR=YOUR_GEMINI_KEY
export PRIVATE_PAYOUT_RELAY_TOKEN_VAR=local-dev-private-relay-token

cre workflow simulate market-workflow \
  --target staging-sepolia-public \
  --broadcast \
  --trigger-index 0 \
  --http-payload '{"action":"settle","marketId":36}' \
  --non-interactive
```

`cre` v1.0.8 does not expose `--rpc-url` for `workflow simulate`; it resolves RPC through `--target` in `project.yaml`.

If everything is correct, the UI updates to **Resolved** and shows **Result: YES/NO**.

Private payout run (experimental):

```bash
export CRE_TARGET=staging-private-payout
export PRIVATE_PAYOUT_RELAY_TOKEN_VAR=local-private-token
cre workflow simulate market-workflow \
  --target staging-private-payout \
  --broadcast \
  --trigger-index 0 \
  --http-payload '{"action":"settle","marketId":36}' \
  --non-interactive
```

Expected trace for judges:

- Onchain: normal settlement tx hash (`MarketSettled`)
- Offchain private rail: log with commitment + relay reference (`pp_...`)
- No raw payout beneficiary data is pushed through public workflow logs

### 4) Rehearsal command (single command)

```bash
./scripts/rehearse-demo.sh --market-id 36
```

See `docs/DEMO_REHEARSAL.md` for full troubleshooting.
If you are moving to a fresh chat/session for the new product phase, use `docs/FLIGHT_DELAY_FOCUS_HANDOFF.md` as the phase source of truth.

### 5) Sprint 2 — Live data + route pricing

#### Airport catalog

```bash
node scripts/slot-airports-sync.js
# Output: artifacts/slot-airports.csv (15 airports, L1/L2/L3 coordination levels)
```

#### Historical flight ingest (queries oracle, not provider directly)

```bash
node scripts/server-flight-oracle.js &   # start oracle first

INGEST_START_DATE=2025-01-01 INGEST_END_DATE=2025-01-07 \
  node scripts/flight-live-ingest.js
# Output: artifacts/flight-observations.csv + artifacts/flight-observations.json
```

#### Route risk + pricing report

```bash
node scripts/route-risk-report.js
# Output: artifacts/flight-risk-routes.csv + artifacts/flight-risk-summary.md
```

Pricing model:

```text
E[payout] = (bps_tier1/10000) × ticket × P(tier1)
          + (bps_tier2/10000) × ticket × P(tier2_or_cancelled)
recommended_premium = E[payout] × (1 + margin%)
```

#### Oracle in hybrid mode with live provider

```bash
ORACLE_MODE=hybrid FLIGHT_PROVIDER=aviationstack AVIATIONSTACK_API_KEY=xxx \
  node scripts/server-flight-oracle.js
```

New env vars: `FLIGHT_PROVIDER`, `FLIGHT_LIVE_TIMEOUT_MS`, `FLIGHT_LIVE_CACHE_TTL_SEC`.
Response now includes `fallbackReason` when provider is unavailable (hybrid mode).

See `docs/DEMO_REHEARSAL.md` section "3B" for full Sprint 2 runbook.

### 6) Financial viability simulation (1000 + 1000 with one script)

Run one command to simulate both product lines (`Inmueble` + `Viaje`) and combined reserve:

```bash
node scripts/simulate-dual-portfolio.js \
  --property-count 1000 \
  --flight-count 1000 \
  --property-breach-prob 0.25 \
  --flight-delay-rate 0.20 \
  --currency USD \
  --trials 30000 \
  --confidence 0.99 \
  --target-net-per-policy 5
```

Notes:

- `--flight-delay-rate` is the annual delay/cancellation rate from your public source.
- The script reports expected net, break-even breach, and reserve (`@99%`, configured confidence, and worst-case) per line and combined.
- Use this output directly for the pitch slide that justifies initial reserve and pricing.

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

## ✅ Pre-video checklist

- Oracle running and healthy at `/health`
- Frontend reachable at `http://127.0.0.1:3000`
- Policy question includes explicit identifier (`Flight Code` or `Propiedad ID`)
- `cre workflow simulate` returns `Settled: 0x...`
- UI shows status **Resolved** with outcome/confidence
- No terminal flags that leak secrets (`-v`, `--engine-logs`)
- Follow `docs/DEMO_REHEARSAL.md` for:
  - 2-minute pre-recording checklist (commands + exact screens)
  - Guided 3-tx flow for recording (`createMarket` -> `predict` -> `claim`)
  - Alternate mirrored flow for `NO-claim` (`LA4112` or `Property ID 2`)

## ✅ Pre-submit checklist

- Public repo URL updated in form
- Public video URL (3-5 min) updated in form
- README links to Chainlink usage files are valid
- Hackathon tracks selected: CRE & AI / Prediction Markets / Risk & Compliance
- Experimental features are labeled and disabled by default

---

## 🔗 Key files showing Chainlink usage

For the hackathon “Chainlink usage” requirement:

- CRE workflow entry + handlers: `market-workflow/main.ts`
- Manual settlement (HTTP) + observation window: `market-workflow/httpCallback.ts`
- Event-driven settlement (EVM Log, experimental): `market-workflow/logCallback.ts`
- Cron price-feeds settlement (experimental): `market-workflow/cronCallback.ts`
- Dispute resolution pipeline (experimental V2): `market-workflow/disputeCallback.ts`
- AI + oracle + weather integration: `market-workflow/gemini.ts`
- Private payout orchestration (commitment + confidential relay): `market-workflow/privatePayout.ts`
- Deterministic threshold engine + trace: `market-workflow/decisionEngine.ts`
- CRE workflow config: `market-workflow/workflow.yaml`
- CRE project targets + RPCs: `project.yaml`
- Secret mapping (no secrets stored): `secrets.yaml`
- Optional external mirror sync: `market-workflow/stateSync.ts`
- Rehearsal script (single-command dry run): `scripts/rehearse-demo.sh`
- Private payout relay (local demo service): `scripts/server-private-payout-relay.js`
- Smart contract: `contracts/src/PredictionMarket.sol`

World ID integration files:

- Verification route: `frontend/src/app/api/world-id/verify/route.ts`
- Client adapters + session/signal: `frontend/src/lib/worldId/*`
- Create gate UI: `frontend/src/app/create/page.tsx`
- Flight-claim gate UI: `frontend/src/app/market/[id]/page.tsx`

---

## 🏆 Hackathon tracks (recommended)

- **CRE & AI**: AI-in-the-loop decisioning + verifiable execution.
- **Prediction Markets**: automated, verifiable resolution based on offchain signals.
- **Risk & Compliance**: parametric insurance-like safeguards and automated payouts.

---

## 👤 Author

Andrés Soto — Colombia  
GitHub: `@zswamtech`
