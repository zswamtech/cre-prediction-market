# Convergence Hackathon — Submission (Copy/Paste)

Use this file to fill the Airtable form quickly.

---

## Project name

**FairLease**

---

## 1‑line description (≤ 80–100 chars)

Parametric rental insurance: real‑world data + AI verdicts, settled onchain via CRE.

---

## Full description

FairLease is a parametric “quality‑of‑life” insurance layer for rentals.

Instead of handling disputes manually (noise, safety issues, construction works, severe weather), FairLease lets a landlord/manager and tenant fund two underwriting pools (**YES = payout**, **NO = no‑claim**) and automatically resolves the policy using verifiable execution.

When a policy is ready to be settled, a Chainlink CRE workflow reads the policy from a Sepolia smart contract, fetches trusted offchain signals (IoT/urban metrics from an oracle service + weather from Open‑Meteo), queries Gemini for a strict JSON verdict, reaches consensus, and writes the settlement back on‑chain so winners can claim.

---

## How is it built?

- **Frontend:** Next.js app to create policies, fund pools, request settlement, and claim.
- **Smart contracts:** Solidity on Sepolia (policy/market contract + CRE receiver).
- **CRE workflow (TypeScript → WASM):**
  - EVM read/write for policy settlement
  - HTTP requests to:
    - Oracle service (`docs/integration/server-oracle.js`) for urban metrics
    - Open‑Meteo for weather
    - Gemini for the AI verdict
- **Observation window rule:** workflow refuses to settle before `minMarketAgeMinutes` (no contract changes).

---

## Challenges faced

- Mapping “real‑world” identifiers (Property ID) into onchain policies deterministically.
- Designing a strict AI prompt + JSON‑only output to avoid ambiguous settlements.
- Avoiding rate limits and making the demo resilient (fallback when Gemini returns 429).
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
