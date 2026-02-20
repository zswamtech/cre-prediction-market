# Portfolio Simulator (Parametric Insurance)

This simulator estimates reserve needs for a **tripartite insurance model**:

- Buyer/Tenant pays premium (`buyer-premium`)
- Host/Landlord posts stake (`host-stake`)
- Protocol/Insurer covers deficit risk

## Model

Per policy:

- Inflow: `buyerPremium + hostStake`
- Outflow:
  - if breach YES: `payoutIfYes`
  - if breach NO: `hostRefundIfNo`
- Net:
  - YES: `inflow - payoutIfYes - opCost`
  - NO: `inflow - hostRefundIfNo - opCost`

Reserve outputs:

- `Reserve @99%`: practical reserve (Monte Carlo percentile)
- `Worst-case reserve`: fully stress-case reserve

## Script

```bash
node scripts/simulate-portfolio.js --help
```

## Flight Risk Export (CSV + p_hat + CI95 + premium por ruta)

Este script consulta el oracle de vuelos, exporta muestras a CSV y calcula métricas
estadísticas/pricing por ruta:

- `p_hat = breaches / muestras`
- intervalo 95% (Wilson)
- prima de equilibrio
- prima recomendada para `target net / póliza`

```bash
node scripts/flight-risk-export.js --help
```

Ejemplo rápido (fixtures demo):

```bash
node scripts/flight-risk-export.js \
  --oracle-base-url http://127.0.0.1:3101 \
  --flight-ids AV8520,LA4112,CM0178 \
  --dates 2026-02-19 \
  --ticket-price 125 \
  --host-stake 20 \
  --refund-no 20 \
  --target-net 5
```

Salida esperada:

- `artifacts/flight-risk-observations.csv` (muestras crudas por vuelo/fecha)
- `artifacts/flight-risk-routes.csv` (métricas agregadas por ruta)

Para estimaciones conservadoras, el script usa `--premium-probability upper95` por defecto
(usa el límite superior del CI95). Si prefieres usar el estimador puntual:

```bash
node scripts/flight-risk-export.js --premium-probability hat
```

## Dual script (Inmueble + Viaje en una corrida)

```bash
node scripts/simulate-dual-portfolio.js --help
```

Ejemplo recomendado para pitch (1000 + 1000):

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

`--flight-delay-rate` permite cargar directamente un porcentaje anual de retrasos/cancelaciones (fuente pública) para pricing de pólizas de viaje.

## Baseline examples (100 / 500 / 1000 policies)

### A) 50% compensation, 100% host refund

```bash
node scripts/simulate-portfolio.js \
  --counts "100,500,1000" \
  --buyer-premium 20 \
  --host-stake 20 \
  --payout-yes 50 \
  --refund-no 20 \
  --breach-prob 0.25 \
  --currency USD \
  --trials 30000 \
  --confidence 0.99
```

### B) 100% compensation, 100% host refund

```bash
node scripts/simulate-portfolio.js \
  --counts "100,500,1000" \
  --buyer-premium 20 \
  --host-stake 20 \
  --payout-yes 100 \
  --refund-no 20 \
  --breach-prob 0.25 \
  --currency USD \
  --trials 30000 \
  --confidence 0.99
```

### C) 50% compensation, 50% host refund

```bash
node scripts/simulate-portfolio.js \
  --counts "100,500,1000" \
  --buyer-premium 20 \
  --host-stake 20 \
  --payout-yes 50 \
  --refund-no 10 \
  --breach-prob 0.25 \
  --currency USD \
  --trials 30000 \
  --confidence 0.99
```

## Sprint 2 — Live Ingest + Route Risk Report

### flight-live-ingest.js

Queries the local oracle (not the provider directly) and saves all observations:

```bash
# Start oracle first
node scripts/server-flight-oracle.js &

# Ingest (default: 5 flights × 7 days = 35 observations)
node scripts/flight-live-ingest.js

# Custom range
INGEST_FLIGHTS=AV8520,LA4112,CM0178 \
INGEST_START_DATE=2025-01-01 \
INGEST_END_DATE=2025-03-31 \
  node scripts/flight-live-ingest.js
```

Output: `artifacts/flight-observations.csv` + `artifacts/flight-observations.json`

### route-risk-report.js

Reads ingested observations and produces tiered payout pricing:

```bash
node scripts/route-risk-report.js
```

Pricing model used:

```text
E[payout] = (bps_tier1/10000) × ticket × P(tier1)
          + (bps_tier2/10000) × ticket × P(tier2_or_cancelled)

break_even_premium  = E[payout]
recommended_premium = E[payout] × (1 + margin%)
```

Custom parameters:

```bash
TICKET_PRICE=125 BPS_TIER1=5000 BPS_TIER2=10000 MARGIN_PCT=20 \
  node scripts/route-risk-report.js
```

Output:

- `artifacts/flight-risk-routes.csv` — per-route metrics (P(tier1), P(tier2), E[payout], premiums)
- `artifacts/flight-risk-summary.md` — slide-ready markdown summary

### slot-airports-sync.js

Airport catalog with coordination levels (L1/L2/L3):

```bash
node scripts/slot-airports-sync.js
# Output: artifacts/slot-airports.csv

# With external CSV override
AIRPORTS_CSV=my-airports.csv node scripts/slot-airports-sync.js
```

Seed: `data/slot-airports.seed.json` (15 airports across 7 countries).

> **Note:** all counts and percentages reflect only the loaded dataset.
> No global industry-wide claims are made.

## Notes

- If `payoutIfYes <= buyerPremium + hostStake`, the portfolio often needs little to no reserve in typical conditions, but still has a non-zero worst-case reserve.
- If `payoutIfYes` is aggressive (e.g., 100% compensation), reserve policy must be explicit before scaling.
- This model is a **business simulation** and does not change smart-contract settlement logic in V1.
- For pitch consistency, keep one explicit source assumption for `--flight-delay-rate` (e.g. public annual delay/cancelation rate) and state the year.
- In zsh, wrap list args in quotes, e.g. `--counts "100,500,1000"` to avoid parse errors.
