# 🖥️ FairLease — Frontend (Next.js)

The frontend is a simple UI to:

- Create “policies” (markets)
- Fund the underwriting pools (**YES = payout**, **NO = no‑claim**)
- Request settlement (“Solicitar liquidación de IA”)
- Claim winnings after settlement

---

## Run locally

```bash
cd frontend
NEXT_PUBLIC_ORACLE_BASE_URL=http://127.0.0.1:3001 npm run dev
```

Open `http://localhost:3000`.

---

## E2E tests (Playwright)

```bash
cd frontend
NEXT_PUBLIC_TEST_MODE=1 npm run test:e2e
```

