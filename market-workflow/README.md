# 🧠 FairLease — CRE Settlement Workflow

This folder contains the **Chainlink Runtime Environment (CRE)** workflow that settles FairLease policies (parametric “insurance markets”) using:

- EVM reads/writes (Sepolia)
- IoT/urban metrics oracle (HTTP)
- Weather oracle (Open‑Meteo HTTP)
- Gemini (AI verdict)

For the hackathon demo we keep the CLI flow simple and copy/paste‑friendly:

- `config.staging.json` disables log/cron triggers by default
- The workflow exposes **a single HTTP trigger** → `--trigger-index 0`

You can re‑enable log/cron triggers any time by toggling the config flags.

---

## ✅ Inputs

The HTTP trigger accepts JSON like:

```json
{ "action": "settle", "marketId": 36 }
```

---

## 🚀 Run (recommended command)

From repo root:

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

---

## ⏳ Observation period (coverage window)

To avoid “instant settlement”, the workflow enforces a minimum age:

- `minMarketAgeMinutes` in `config.staging.json` (fast demo)
- `minMarketAgeMinutes` in `config.production.json` (more realistic)

If the policy is too new, the workflow returns “Too early to settle”.

---

## 🔐 Secrets

The workflow reads the Gemini key via CRE secrets:

- `secrets.yaml` maps secret `GEMINI_API_KEY` → env var `GEMINI_API_KEY_VAR`

**For recording:** don’t run the simulation with `-v` or `--engine-logs` (can print headers/secrets).

