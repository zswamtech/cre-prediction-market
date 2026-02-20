# Flight-Delay Risk Summary

_Generated: 2026-02-20T14:48:11.420Z_  
_Source: flight-risk-observations.csv_  
_Ticket price: $125.00 · Tier 1: 50% payout · Tier 2: 100% payout · Margin: 20%_

---

## Overall

| Metric | Value |
|---|---|
| Routes analyzed | 5 |
| Total observations | 1825 |
| Tier 1 breaches (partial payout) | 730 (40.0%) |
| Tier 2 breaches (full payout / cancelled) | 730 (40.0%) |
| Avg recommended premium | $90.00 |

---

## Per-Route Risk & Pricing

| Route | n | P(tier1) | P(tier2/cancel) | E[payout] | Break-even | Recommended |
|---|---|---|---|---|---|---|
| BOG->EWR | 365 | 0.0% | 100.0% | $125.00 | $125.00 | **$150.00** |
| MDE->BOG | 365 | 100.0% | 0.0% | $62.50 | $62.50 | **$75.00** |
| MDE->CTG | 365 | 0.0% | 0.0% | $0.00 | $0.00 | **$0.00** |
| MDE->MIA | 365 | 100.0% | 0.0% | $62.50 | $62.50 | **$75.00** |
| MDE->PTY | 365 | 0.0% | 100.0% | $125.00 | $125.00 | **$150.00** |

---

## Payout Model

```
E[payout] = (bps_tier1/10000) × ticket × P(tier1)
          + (bps_tier2/10000) × ticket × P(tier2_or_cancelled)

Break-even premium  = E[payout]
Recommended premium = E[payout] × (1 + margin%)

Parameters used:
  ticket_price = $125.00
  bps_tier1    = 5000  (50% payout on partial breach)
  bps_tier2    = 10000 (100% payout on full breach)
  margin       = 20%
```

## Interpretation

- **P(tier1)**: probability of delay meeting partial-payout threshold (oracle Tier 1)
- **P(tier2/cancel)**: probability of severe delay or cancellation (oracle Tier 2)
- **E[payout]**: expected cost per policy — the minimum the insurer must collect
- **Recommended premium**: break-even + 20% margin for solvency buffer
- Wilson 95% CI used for breach probability; point estimate (p_hat) used in pricing

> **Note:** figures reflect only the loaded dataset (1825 observations across 5 routes).
> No claims are made about absolute industry-wide statistics.
