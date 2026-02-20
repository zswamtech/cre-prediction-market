#!/usr/bin/env node
/**
 * flight-live-ingest.js  v1.0.0
 *
 * Queries the local flight oracle (server-flight-oracle.js) for a list of
 * flights across a date range, and saves the results to:
 *   artifacts/flight-observations.csv
 *   artifacts/flight-observations.json
 *
 * The script talks to the ORACLE endpoint, not the provider directly —
 * so all demo/live/hybrid logic lives in server-flight-oracle.js.
 *
 * Usage:
 *   # Start oracle first:
 *   node scripts/server-flight-oracle.js &
 *
 *   # Then run ingest with default params:
 *   node scripts/flight-live-ingest.js
 *
 *   # Custom params via env:
 *   ORACLE_URL=http://localhost:3101 \
 *   INGEST_FLIGHTS=AV8520,LA4112,CM0178 \
 *   INGEST_START_DATE=2025-01-01 \
 *   INGEST_END_DATE=2025-01-07 \
 *   INGEST_TIMEOUT_MS=5000 \
 *   node scripts/flight-live-ingest.js
 *
 * Output columns (CSV/JSON):
 *   flightId, dateRequested, airline, flightNumber,
 *   departureAirport, arrivalAirport, route, status,
 *   delayMinutes, thresholdMinutes, breachDetected,
 *   expectedVerdict, payoutTier, payoutPercent, payoutReason,
 *   source, fallbackReason, evaluatedAt, endpoint
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ORACLE_URL      = process.env.ORACLE_URL        || 'http://127.0.0.1:3101';
const TIMEOUT_MS      = parseInt(process.env.INGEST_TIMEOUT_MS || '8000', 10);
const OUT_DIR         = path.resolve(__dirname, '..', 'artifacts');
const OUT_CSV         = path.join(OUT_DIR, 'flight-observations.csv');
const OUT_JSON        = path.join(OUT_DIR, 'flight-observations.json');

const DEFAULT_FLIGHTS = ['AV8520', 'LA4112', 'CM0178', 'AA1234', 'UA5678'];
const FLIGHTS = (process.env.INGEST_FLIGHTS || DEFAULT_FLIGHTS.join(','))
  .split(',').map(f => f.trim()).filter(Boolean);

// Date range (inclusive)
const START_DATE = process.env.INGEST_START_DATE || '2025-01-01';
const END_DATE   = process.env.INGEST_END_DATE   || '2025-01-07';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function dateRange(start, end) {
  const dates = [];
  const cur   = new Date(start + 'T00:00:00Z');
  const last  = new Date(end   + 'T00:00:00Z');
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Oracle fetch
// ---------------------------------------------------------------------------
async function fetchOracle(flightId, date) {
  const url = `${ORACLE_URL}/api/flight-delay/${encodeURIComponent(flightId)}?date=${date}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { error: `HTTP ${res.status}`, url };
    }
    const body = await res.json();
    return { ...body, url };
  } catch (err) {
    return { error: err.message || String(err), url };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Map oracle response → flat observation record
// ---------------------------------------------------------------------------
function toObservation(raw, flightId, date) {
  if (raw.error) {
    return {
      flightId,
      dateRequested:    date,
      airline:          '',
      flightNumber:     flightId,
      departureAirport: '',
      arrivalAirport:   '',
      route:            '',
      status:           'ERROR',
      delayMinutes:     '',
      thresholdMinutes: '',
      breachDetected:   '',
      expectedVerdict:  '',
      payoutTier:       '',
      payoutPercent:    '',
      payoutReason:     raw.error,
      source:           'error',
      fallbackReason:   '',
      evaluatedAt:      new Date().toISOString(),
      endpoint:         raw.url || '',
    };
  }

  // Oracle wraps data in envelope.data
  const d = raw.data || raw;
  return {
    flightId:         flightId,
    dateRequested:    date,
    airline:          d.airline          || '',
    flightNumber:     d.flightNumber     || flightId,
    departureAirport: d.departureAirport || '',
    arrivalAirport:   d.arrivalAirport   || '',
    route:            d.route            || `${d.departureAirport || ''}→${d.arrivalAirport || ''}`,
    status:           d.status           || '',
    delayMinutes:     d.delayMinutes     != null ? d.delayMinutes : '',
    thresholdMinutes: d.thresholdMinutes != null ? d.thresholdMinutes : '',
    breachDetected:   d.breachDetected   != null ? (d.breachDetected ? 1 : 0) : '',
    expectedVerdict:  d.expectedVerdict  || (d.breachDetected ? 'YES' : 'NO'),
    payoutTier:       d.payoutTier       != null ? d.payoutTier : '',
    payoutPercent:    d.payoutPercent    != null ? d.payoutPercent : '',
    payoutReason:     d.payoutReason     || d.reason || '',
    source:           d.source           || raw.source || '',
    fallbackReason:   d.fallbackReason   || raw.fallbackReason || '',
    evaluatedAt:      d.evaluatedAt      || new Date().toISOString(),
    endpoint:         raw.url            || '',
  };
}

// ---------------------------------------------------------------------------
// CSV writer
// ---------------------------------------------------------------------------
const CSV_COLUMNS = [
  'flightId', 'dateRequested', 'airline', 'flightNumber',
  'departureAirport', 'arrivalAirport', 'route', 'status',
  'delayMinutes', 'thresholdMinutes', 'breachDetected',
  'expectedVerdict', 'payoutTier', 'payoutPercent', 'payoutReason',
  'source', 'fallbackReason', 'evaluatedAt', 'endpoint',
];

function escapeCsv(val) {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(records, filePath) {
  const header = CSV_COLUMNS.join(',');
  const rows   = records.map(r => CSV_COLUMNS.map(c => escapeCsv(r[c])).join(','));
  fs.writeFileSync(filePath, [header, ...rows, ''].join('\n'), 'utf8');
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
async function checkOracleHealth() {
  const url = `${ORACLE_URL}/health`;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return body;
  } catch (err) {
    throw new Error(`Oracle not reachable at ${url}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('flight-live-ingest v1.0.0');
  console.log(`Oracle: ${ORACLE_URL}`);
  console.log(`Flights: ${FLIGHTS.join(', ')}`);
  console.log(`Date range: ${START_DATE} → ${END_DATE}`);

  // Check oracle is up
  let health;
  try {
    health = await checkOracleHealth();
    console.log(`Oracle mode: ${health.mode || 'unknown'}  provider: ${health.provider || 'n/a'}`);
  } catch (err) {
    console.error(`\n[error] ${err.message}`);
    console.error('Start the oracle first: node scripts/server-flight-oracle.js\n');
    process.exit(1);
  }

  const dates   = dateRange(START_DATE, END_DATE);
  const total   = FLIGHTS.length * dates.length;
  const records = [];
  let   done    = 0;
  let   errors  = 0;

  console.log(`\nFetching ${total} observations (${FLIGHTS.length} flights × ${dates.length} days)...\n`);

  for (const flightId of FLIGHTS) {
    for (const date of dates) {
      const raw = await fetchOracle(flightId, date);
      const obs = toObservation(raw, flightId, date);
      records.push(obs);
      done++;

      const tag = obs.status === 'ERROR' ? '[ERR]' : `[${obs.expectedVerdict || '?'}]`;
      const fb  = obs.fallbackReason ? ` (fallback: ${obs.fallbackReason})` : '';
      process.stdout.write(`  ${String(done).padStart(4)}/${total}  ${flightId} ${date}  ${obs.status} ${tag}${fb}\n`);
      if (obs.status === 'ERROR') errors++;

      // Respect provider rate limits — small delay between requests
      await new Promise(r => setTimeout(r, 100));
    }
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  writeCsv(records, OUT_CSV);
  fs.writeFileSync(OUT_JSON, JSON.stringify(records, null, 2), 'utf8');

  // Summary
  const breaches = records.filter(r => r.breachDetected === 1).length;
  const valid    = records.filter(r => r.status !== 'ERROR').length;
  console.log('\n=== Ingest Summary ===');
  console.log(`Total observations: ${records.length}`);
  console.log(`  Valid:   ${valid}`);
  console.log(`  Errors:  ${errors}`);
  console.log(`  Breach:  ${breaches} / ${valid} = ${valid > 0 ? (breaches/valid*100).toFixed(1) : 'n/a'}%`);
  console.log(`\nOutput:`);
  console.log(`  ${OUT_CSV}`);
  console.log(`  ${OUT_JSON}`);
  console.log('');
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
