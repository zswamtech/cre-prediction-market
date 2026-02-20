#!/usr/bin/env node
/**
 * slot-airports-sync.js  v1.0.0
 *
 * Loads airport slot-coordination data from:
 *   1. data/slot-airports.seed.json   (bundled seed)
 *   2. Optional CSV override: AIRPORTS_CSV env var  (columns must match seed fields)
 *
 * Outputs:
 *   artifacts/slot-airports.csv
 *
 * Usage:
 *   node scripts/slot-airports-sync.js
 *   AIRPORTS_CSV=my-override.csv node scripts/slot-airports-sync.js
 *
 * Coordination levels (IATA ACI standard used here):
 *   L1 - Uncoordinated (no slot required)
 *   L2 - Schedule-facilitated (voluntary coordination)
 *   L3 - Fully coordinated (slot mandatory)
 *
 * IMPORTANT: Numbers reported reflect only the dataset loaded —
 * no claims are made about global totals.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROOT        = path.resolve(__dirname, '..');
const SEED_FILE   = path.join(ROOT, 'data', 'slot-airports.seed.json');
const OUT_DIR     = path.join(ROOT, 'artifacts');
const OUT_CSV     = path.join(OUT_DIR, 'slot-airports.csv');

const CSV_COLUMNS = [
  'iata', 'icao', 'airportName', 'city', 'country',
  'coordinationLevel', 'timezone', 'source', 'updatedAt',
];

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------
function escapeCsv(val) {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(record) {
  return CSV_COLUMNS.map(col => escapeCsv(record[col] ?? '')).join(',');
}

function parseCsvLine(line) {
  // Minimal CSV parser: handles quoted fields with commas inside
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"')                   { inQuotes = false; }
      else                                   { cur += ch; }
    } else {
      if (ch === '"')       { inQuotes = true; }
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else                  { cur += ch; }
    }
  }
  fields.push(cur);
  return fields;
}

function parseCsv(content) {
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const record = {};
    headers.forEach((h, i) => { record[h.trim()] = (values[i] ?? '').trim(); });
    return record;
  });
}

// ---------------------------------------------------------------------------
// Normalise a record — ensures all required columns are present
// ---------------------------------------------------------------------------
function normalise(record) {
  return {
    iata:               (record.iata   || '').toUpperCase().slice(0, 4),
    icao:               (record.icao   || '').toUpperCase().slice(0, 4),
    airportName:        record.airportName    || record.airport_name || '',
    city:               record.city           || '',
    country:            record.country        || '',
    coordinationLevel:  normaliseLevel(record.coordinationLevel || record.coordination_level || record.level),
    timezone:           record.timezone       || '',
    source:             record.source         || 'unknown',
    updatedAt:          record.updatedAt      || record.updated_at || new Date().toISOString().slice(0, 10),
  };
}

function normaliseLevel(val) {
  if (!val) return 'L1';
  const v = String(val).toUpperCase().trim();
  if (v === 'L1' || v === '1' || v === 'UNCOORDINATED')           return 'L1';
  if (v === 'L2' || v === '2' || v === 'SCHEDULE-FACILITATED')    return 'L2';
  if (v === 'L3' || v === '3' || v === 'FULLY COORDINATED')       return 'L3';
  return 'L1'; // default to uncoordinated if unknown
}

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------
function loadSeed() {
  const raw = fs.readFileSync(SEED_FILE, 'utf8');
  return JSON.parse(raw).map(normalise);
}

function loadCsvOverride(csvPath) {
  if (!fs.existsSync(csvPath)) {
    console.warn(`[warn] AIRPORTS_CSV not found: ${csvPath}`);
    return [];
  }
  const content = fs.readFileSync(csvPath, 'utf8');
  return parseCsv(content).map(normalise);
}

// ---------------------------------------------------------------------------
// Merge: CSV override wins for matching IATA; seed fills the rest
// ---------------------------------------------------------------------------
function merge(seed, overrides) {
  const map = new Map();
  for (const r of seed)      map.set(r.iata, r);
  for (const r of overrides) {
    if (r.iata) map.set(r.iata, { ...map.get(r.iata) || {}, ...r });
  }
  return Array.from(map.values()).sort((a, b) => a.iata.localeCompare(b.iata));
}

// ---------------------------------------------------------------------------
// Write CSV
// ---------------------------------------------------------------------------
function writeCsv(records) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const header = CSV_COLUMNS.join(',');
  const rows   = records.map(rowToCsv);
  fs.writeFileSync(OUT_CSV, [header, ...rows, ''].join('\n'), 'utf8');
}

// ---------------------------------------------------------------------------
// Print summary
// ---------------------------------------------------------------------------
function printSummary(records) {
  const byLevel = { L1: 0, L2: 0, L3: 0 };
  const byCountry = {};
  for (const r of records) {
    byLevel[r.coordinationLevel] = (byLevel[r.coordinationLevel] || 0) + 1;
    byCountry[r.country]         = (byCountry[r.country]         || 0) + 1;
  }

  console.log('\n=== Slot-Airport Catalog Summary ===');
  console.log(`Total airports in dataset: ${records.length}`);
  console.log(`  L1 (uncoordinated):       ${byLevel.L1}`);
  console.log(`  L2 (schedule-facilitated):${byLevel.L2}`);
  console.log(`  L3 (fully coordinated):   ${byLevel.L3}`);
  console.log('\nBy country:');
  for (const [country, count] of Object.entries(byCountry).sort()) {
    console.log(`  ${country.padEnd(25)} ${count}`);
  }
  console.log(`\nOutput: ${OUT_CSV}`);
  console.log('Note: counts reflect only airports in the loaded dataset.\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log('slot-airports-sync v1.0.0');

  let records = loadSeed();
  console.log(`Loaded ${records.length} airports from seed.`);

  const csvOverridePath = process.env.AIRPORTS_CSV;
  if (csvOverridePath) {
    const overrides = loadCsvOverride(csvOverridePath);
    console.log(`Loaded ${overrides.length} overrides from ${csvOverridePath}`);
    records = merge(records, overrides);
    console.log(`Merged total: ${records.length} airports`);
  }

  writeCsv(records);
  printSummary(records);
}

main();
