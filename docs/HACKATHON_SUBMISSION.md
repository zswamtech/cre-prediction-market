# Convergence Hackathon — Submission (Copy/Paste)

Spanish-ready assets:

- Airtable ES copy/paste: `docs/AIRTABLE_SUBMISSION_ES.md`
- Official video script (<= 5 min): `docs/VIDEO_SCRIPT_OFICIAL_ES.md`

Use this file to fill the Airtable form quickly.

---

## Project name

**FairLease**

---

## 1‑line description (≤ 80–100 chars)

Parametric flight-delay insurance with CRE + AI, settled onchain in seconds.

---

## Full description

FairLease is a parametric insurance layer for real-world experiences, with a **flight-delay first** go-to-market.

Instead of manual and slow compensation claims, FairLease lets users fund two underwriting pools (**YES = payout**, **NO = no‑claim**) and resolves policies automatically with verifiable execution.

For flight policies, the CRE workflow reads policy data from Sepolia, fetches delay/cancelation signals from the flight oracle endpoint, queries Gemini with strict JSON output, falls back to deterministic rules when needed, and writes the settlement onchain so winners can claim.

Property quality-of-life policies (noise/safety/construction/weather) remain available as a secondary use case to prove cross-vertical extensibility.

---

## How is it built?

- **Frontend:** Next.js app to create policies, fund pools, request settlement, and claim.
- **Smart contracts:** Solidity on Sepolia (policy/market contract + CRE receiver).
- **CRE workflow (TypeScript → WASM):**
  - EVM read/write for policy settlement
  - HTTP requests to:
    - Oracle service (`docs/integration/server-oracle.js`) for flight delay + property metrics
    - Open‑Meteo for weather (property flow)
    - Gemini for the AI verdict
- **Observation window rule:** workflow refuses to settle before `minMarketAgeMinutes` (no contract changes).

---

## Challenges faced

- Mapping real-world identifiers (flight code/date and property ID) into onchain policies deterministically.
- Designing a strict AI prompt + JSON‑only output to avoid ambiguous settlements.
- Avoiding rate limits and making the demo resilient (fallback when Gemini returns 429).
- Keeping network/RPC consistency between wallet-signed writes and frontend confirmations during live demos.
- Keeping secrets safe during demos (no verbose logs; no secrets committed).

---

## Repo link

`https://github.com/zswamtech/cre-prediction-market`

---

## Chainlink usage (code pointers)

Paste any of these links in the form (they show CRE orchestration clearly):

- CRE handlers/triggers: `market-workflow/main.ts`  
  `https://github.com/zswamtech/cre-prediction-market/blob/main/market-workflow/main.ts#L45`
- Manual settlement + observation window: `market-workflow/httpCallback.ts`  
  `https://github.com/zswamtech/cre-prediction-market/blob/main/market-workflow/httpCallback.ts#L120`
- Oracle + weather + Gemini integration: `market-workflow/gemini.ts`  
  `https://github.com/zswamtech/cre-prediction-market/blob/main/market-workflow/gemini.ts#L150`
- CRE targets/RPCs: `project.yaml`  
  `https://github.com/zswamtech/cre-prediction-market/blob/main/project.yaml`
- Secret mapping: `secrets.yaml`  
  `https://github.com/zswamtech/cre-prediction-market/blob/main/secrets.yaml`
- Smart contract: `contracts/src/PredictionMarket.sol`  
  `https://github.com/zswamtech/cre-prediction-market/blob/main/contracts/src/PredictionMarket.sol`

These links are ready to paste into the submission form.

---

## Demo video link

Upload the final 3–5 min demo (unlisted is fine) and paste here:

`https://youtu.be/<YOUR_VIDEO_ID>`

---

## Prize tracks (recommended)

- CRE & AI
- Prediction Markets
- Risk & Compliance

---

## Submitter

- Name: Andrés Soto
- Email: ansoto1604@gmail.com
- Team: Individual
