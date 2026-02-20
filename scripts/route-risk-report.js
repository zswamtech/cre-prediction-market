#!/usr/bin/env node
/**
 * route-risk-report.js  v1.0.0
 *
 * Reads pre-ingested flight observations and produces:
 *   artifacts/flight-risk-routes.csv   (per-route risk metrics)
 *   artifacts/flight-risk-summary.md   (slide-ready markdown)
 *
 * Tiered payout model (parametric insurance):
 *   Tier 1 (partial, ~50%): delay >= threshold_primary AND delay < threshold_secondary
 *   Tier 2 (full, 100%):    delay >= threshold_secondary OR status == CANCELLED
 *
 * E[payout] = bps_tier1/10000 * ticket * P(tier1)
 *           + bps_tier2/10000 * ticket * P(tier2)
 *
 * Break-even premium = E[payout]   (no margin)
 * Recommended premium = E[payout] * (1 + margin_pct)
 *
 * Input sources (first found wins):
 *   1. OBSERVATIONS_CSV env var
 *   2. artifacts/flight-observations.csv     (from flight-live-ingest.js)
 *   3. artifacts/flight-risk-observations.csv (from flight-risk-export.js)
 *
 * Usage:
 *   node scripts/route-risk-report.js
 *   TICKET_PRICE=125 BPS_TIER1=5000 BPS_TIER2=10000 MARGIN_PCT=20 \
 *     node scripts/route-risk-report.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT         = path.resolve(__dirname, '..');
const OUT_DIR      = path.join(ROOT, 'artifacts');
const OUT_CSV      = path.join(OUT_DIR, 'flight-risk-routes.csv');
const OUT_MD       = path.join(OUT_DIR, 'flight-risk-summary.md');

const TICKET_PRICE = parseFloat(process.env.TICKET_PRICE || '125');
const BPS_TIER1    = parseInt(process.env.BPS_TIER1      || '5000',  10); // 50%
const BPS_TIER2    = parseInt(process.env.BPS_TIER2      || '10000', 10); // 100%
const MARGIN_PCT   = parseFloat(process.env.MARGIN_PCT   || '20');        // 20% buffer
const CONFIDENCE_Z = 1.959963984540054;                                    // 95% two-sided

// Find the best available observations file
function findObservationsFile() {
  const candidates = [
    process.env.OBSERVATIONS_CSV,
    path.join(OUT_DIR, 'flight-observations.csv'),
    path.join(OUT_DIR, 'flight-risk-observations.csv'),
  ].filter(Boolean);

  for (const f of candidates) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// ---------------------------------------------------------------------------
// CSV parser (minimal, handles quoted fields)
// ---------------------------------------------------------------------------
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === '"')      { inQ = true; }
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else                 { cur += ch; }
    }
  }
  fields.push(cur);
  return fields;
}

function parseCsv(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] ?? '').trim(); });
    return row;
  });
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Wilson 95% confidence interval
// ---------------------------------------------------------------------------
function wilson(successes, n) {
  if (n <= 0) return { pHat: 0, lower: 0, upper: 0 };
  const p  = successes / n;
  const z  = CONFIDENCE_Z;
  const z2 = z * z;
  const d  = 1 + z2 / n;
  const c  = (p + z2 / (2 * n)) / d;
  const m  = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / d;
  return {
    pHat:  p,
    lower: Math.max(0, c - m),
    upper: Math.min(1, c + m),
  };
}

// ---------------------------------------------------------------------------
// Determine tier from a single observation row
// (works with both ingest formats)
// ---------------------------------------------------------------------------
function determineTier(row) {
  const payoutTier = row.payoutTier !== '' ? parseInt(row.payoutTier, 10) : null;
  if (payoutTier !== null) return payoutTier; // trust oracle verdict if present

  // Fallback: infer from status + breach
  const status  = (row.status || '').toUpperCase();
  const breach  = row.breachDetected === '1' || row.breachDetected === 'true';
  if (status === 'CANCELLED')                 return 2;
  if (breach && row.payoutPercent === '100')  return 2;
  if (breach)                                 return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Aggregate by route
// ---------------------------------------------------------------------------
function aggregate(rows) {
  const map = new Map(); // route -> {n, tier0, tier1, tier2, flightIds}

  for (const row of rows) {
    const route = row.route || `${row.departureAirport}→${row.arrivalAirport}`;
    if (!route) continue;

    let agg = map.get(route);
    if (!agg) {
      agg = { n: 0, tier0: 0, tier1: 0, tier2: 0, flightIds: new Set() };
      map.set(route, agg);
    }
    agg.n++;
    const tier = determineTier(row);
    if      (tier === 2) agg.tier2++;
    else if (tier === 1) agg.tier1++;
    else                 agg.tier0++;

    if (row.flightId) agg.flightIds.add(row.flightId);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Compute per-route metrics
// ---------------------------------------------------------------------------
function computeRouteMetrics(route, agg) {
  const { n, tier1, tier2, flightIds } = agg;
  const tier1_2 = tier1 + tier2;  // any breach

  const ci_any   = wilson(tier1_2, n);
  const ci_tier1 = wilson(tier1,   n);
  const ci_tier2 = wilson(tier2,   n);

  // E[payout] using p_hat (point estimate)
  const pTier1   = ci_tier1.pHat;
  const pTier2   = ci_tier2.pHat;
  const ePayout  = (BPS_TIER1 / 10000) * TICKET_PRICE * pTier1
                 + (BPS_TIER2 / 10000) * TICKET_PRICE * pTier2;

  // Break-even: recover expected payout
  const breakEven    = ePayout;
  // Recommended: break-even + margin
  const recommended  = breakEven * (1 + MARGIN_PCT / 100);

  return {
    route,
    samples:          n,
    tier0_count:      agg.tier0,
    tier1_count:      tier1,
    tier2_count:      tier2,
    p_any_hat:        +ci_any.pHat.toFixed(4),
    p_any_ci95_lower: +ci_any.lower.toFixed(4),
    p_any_ci95_upper: +ci_any.upper.toFixed(4),
    p_tier1:          +pTier1.toFixed(4),
    p_tier2:          +pTier2.toFixed(4),
    bps_tier1:        BPS_TIER1,
    bps_tier2:        BPS_TIER2,
    ticket_price:     TICKET_PRICE,
    e_payout:         +ePayout.toFixed(2),
    break_even_premium: +breakEven.toFixed(2),
    recommended_premium: +recommended.toFixed(2),
    margin_pct:       MARGIN_PCT,
    sample_flight_ids: Array.from(flightIds).sort().join('|'),
  };
}

// ---------------------------------------------------------------------------
// CSV output
// ---------------------------------------------------------------------------
const ROUTE_CSV_COLS = [
  'route', 'samples', 'tier0_count', 'tier1_count', 'tier2_count',
  'p_any_hat', 'p_any_ci95_lower', 'p_any_ci95_upper',
  'p_tier1', 'p_tier2',
  'bps_tier1', 'bps_tier2', 'ticket_price',
  'e_payout', 'break_even_premium', 'recommended_premium', 'margin_pct',
  'sample_flight_ids',
];

function escapeCsv(val) {
  const s = val == null ? '' : String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(metrics) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const header = ROUTE_CSV_COLS.join(',');
  const rows   = metrics.map(m => ROUTE_CSV_COLS.map(c => escapeCsv(m[c])).join(','));
  fs.writeFileSync(OUT_CSV, [header, ...rows, ''].join('\n'), 'utf8');
}

// ---------------------------------------------------------------------------
// Markdown summary (slide-ready)
// ---------------------------------------------------------------------------
function writeMarkdown(metrics, totalObs, sourceFile, generatedAt) {
  const pct = v => `${(v * 100).toFixed(1)}%`;
  const usd = v => `$${Number(v).toFixed(2)}`;

  // Overall stats
  const totalTier1    = metrics.reduce((s, m) => s + m.tier1_count, 0);
  const totalTier2    = metrics.reduce((s, m) => s + m.tier2_count, 0);
  const totalSamples  = metrics.reduce((s, m) => s + m.samples,     0);
  const avgRecommended = metrics.length > 0
    ? metrics.reduce((s, m) => s + m.recommended_premium, 0) / metrics.length : 0;

  let md = `# Flight-Delay Risk Summary\n\n`;
  md += `_Generated: ${generatedAt}_  \n`;
  md += `_Source: ${path.basename(sourceFile)}_  \n`;
  md += `_Ticket price: ${usd(TICKET_PRICE)} · Tier 1: ${BPS_TIER1/100}% payout · Tier 2: ${BPS_TIER2/100}% payout · Margin: ${MARGIN_PCT}%_\n\n`;
  md += `---\n\n`;

  md += `## Overall\n\n`;
  md += `| Metric | Value |\n|---|---|\n`;
  md += `| Routes analyzed | ${metrics.length} |\n`;
  md += `| Total observations | ${totalSamples} |\n`;
  md += `| Tier 1 breaches (partial payout) | ${totalTier1} (${pct(totalSamples > 0 ? totalTier1/totalSamples : 0)}) |\n`;
  md += `| Tier 2 breaches (full payout / cancelled) | ${totalTier2} (${pct(totalSamples > 0 ? totalTier2/totalSamples : 0)}) |\n`;
  md += `| Avg recommended premium | ${usd(avgRecommended)} |\n`;
  md += `\n---\n\n`;

  md += `## Per-Route Risk & Pricing\n\n`;
  md += `| Route | n | P(tier1) | P(tier2/cancel) | E[payout] | Break-even | Recommended |\n`;
  md += `|---|---|---|---|---|---|---|\n`;

  for (const m of metrics) {
    md += `| ${m.route} | ${m.samples} `;
    md += `| ${pct(m.p_tier1)} `;
    md += `| ${pct(m.p_tier2)} `;
    md += `| ${usd(m.e_payout)} `;
    md += `| ${usd(m.break_even_premium)} `;
    md += `| **${usd(m.recommended_premium)}** |\n`;
  }

  md += `\n---\n\n`;
  md += `## Payout Model\n\n`;
  md += `\`\`\`\n`;
  md += `E[payout] = (bps_tier1/10000) × ticket × P(tier1)\n`;
  md += `          + (bps_tier2/10000) × ticket × P(tier2_or_cancelled)\n`;
  md += `\n`;
  md += `Break-even premium  = E[payout]\n`;
  md += `Recommended premium = E[payout] × (1 + margin%)\n`;
  md += `\n`;
  md += `Parameters used:\n`;
  md += `  ticket_price = ${usd(TICKET_PRICE)}\n`;
  md += `  bps_tier1    = ${BPS_TIER1}  (${BPS_TIER1/100}% payout on partial breach)\n`;
  md += `  bps_tier2    = ${BPS_TIER2} (${BPS_TIER2/100}% payout on full breach)\n`;
  md += `  margin       = ${MARGIN_PCT}%\n`;
  md += `\`\`\`\n\n`;

  md += `## Interpretation\n\n`;
  md += `- **P(tier1)**: probability of delay meeting partial-payout threshold (oracle Tier 1)\n`;
  md += `- **P(tier2/cancel)**: probability of severe delay or cancellation (oracle Tier 2)\n`;
  md += `- **E[payout]**: expected cost per policy — the minimum the insurer must collect\n`;
  md += `- **Recommended premium**: break-even + ${MARGIN_PCT}% margin for solvency buffer\n`;
  md += `- Wilson 95% CI used for breach probability; point estimate (p_hat) used in pricing\n\n`;

  md += `> **Note:** figures reflect only the loaded dataset (${totalSamples} observations across ${metrics.length} routes).\n`;
  md += `> No claims are made about absolute industry-wide statistics.\n`;

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_MD, md, 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log('route-risk-report v1.0.0');

  const sourceFile = findObservationsFile();
  if (!sourceFile) {
    console.error('[error] No observations file found. Run flight-live-ingest.js first.');
    console.error('  Expected: artifacts/flight-observations.csv');
    console.error('  Or set:   OBSERVATIONS_CSV=/path/to/file.csv');
    process.exit(1);
  }
  console.log(`Source: ${sourceFile}`);

  const content = fs.readFileSync(sourceFile, 'utf8');
  const { rows } = parseCsv(content);
  console.log(`Loaded ${rows.length} observations`);

  if (rows.length === 0) {
    console.error('[error] No rows found in observations file.');
    process.exit(1);
  }

  const aggMap   = aggregate(rows);
  const metrics  = Array.from(aggMap.entries())
    .map(([route, agg]) => computeRouteMetrics(route, agg))
    .sort((a, b) => a.route.localeCompare(b.route));

  writeCsv(metrics);
  const now = new Date().toISOString();
  writeMarkdown(metrics, rows.length, sourceFile, now);

  // Console summary
  console.log('\n=== Route Risk & Pricing ===');
  console.log(`${'Route'.padEnd(20)} ${'n'.padStart(5)} ${'P(t1)'.padStart(7)} ${'P(t2)'.padStart(7)} ${'E[pay]'.padStart(8)} ${'Rec.'.padStart(8)}`);
  console.log('-'.repeat(62));
  for (const m of metrics) {
    const pct = v => `${(v * 100).toFixed(1)}%`;
    const usd = v => `$${Number(v).toFixed(2)}`;
    console.log(
      `${m.route.padEnd(20)} ${String(m.samples).padStart(5)} ${pct(m.p_tier1).padStart(7)} ${pct(m.p_tier2).padStart(7)} ${usd(m.e_payout).padStart(8)} ${usd(m.recommended_premium).padStart(8)}`
    );
  }
  console.log('');
  console.log(`Output CSV:      ${OUT_CSV}`);
  console.log(`Output markdown: ${OUT_MD}`);
  console.log('');
}

main();
