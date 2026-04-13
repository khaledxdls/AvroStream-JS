/**
 * Internals Micro-Benchmark
 *
 * Measures the cost of internal optimizations so the tradeoffs are
 * quantified, not guessed:
 *
 *  1. encode() with vs without circular-reference check (skipCircularCheck)
 *  2. Registry lookup with LRU bookkeeping (maxSize) vs unlimited
 *  3. Canonical fingerprint (Avro Parsing Canonical Form) vs raw JSON.stringify
 *
 * Methodology: warmup rounds followed by measured rounds.
 * Outputs median, p95, p99, ops/sec.
 * Saves JSON/CSV/MD/log to benchmark-results/internals/latest/.
 */

import { performance } from 'node:perf_hooks';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const {
  encode,
  decode,
  SchemaRegistry,
  fingerprint,
  inferSchema,
} = await import('../dist/index.js');

// ── Stats helpers ────────────────────────────────────────────────────

function percentile(sorted, p) {
  const n = sorted.length;
  const idx = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return sorted[idx];
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((acc, x) => acc + (x - mean) ** 2, 0) / n;
  return {
    min: sorted[0],
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[n - 1],
    mean,
    stddev: Math.sqrt(variance),
  };
}

// ── Measure helper ───────────────────────────────────────────────────

function measure({ name, warmup, rounds, fn }) {
  for (let i = 0; i < warmup; i++) fn();

  const times = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const s = stats(times);
  return { name, stats: s, opsPerSec: 1000 / s.median };
}

function measureBatch({ name, warmup, rounds, batchSize, fn }) {
  for (let i = 0; i < warmup; i++) fn();

  const times = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    fn();
    const elapsed = performance.now() - start;
    times.push(elapsed / batchSize);
  }

  const s = stats(times);
  return { name, stats: s, opsPerSec: 1000 / s.median };
}

// ── Format helpers ───────────────────────────────────────────────────

function fmtUs(ms) {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(0)} ns`;
  if (ms < 1) return `${(ms * 1000).toFixed(1)} µs`;
  return `${ms.toFixed(3)} ms`;
}

function fmtOps(ops) {
  if (ops >= 1e6) return `${(ops / 1e6).toFixed(2)} M ops/s`;
  if (ops >= 1e3) return `${(ops / 1e3).toFixed(1)} K ops/s`;
  return `${Math.round(ops)} ops/s`;
}

function csvEscape(value) {
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

// ── Test data ────────────────────────────────────────────────────────

const checkoutSchema = {
  type: 'record',
  name: 'CheckoutEvent',
  fields: [
    { name: 'orderId', type: 'string' },
    { name: 'userId', type: 'string' },
    { name: 'amount', type: 'double' },
    { name: 'currency', type: 'string' },
    { name: 'items', type: 'int' },
    { name: 'timestamp', type: 'long' },
    { name: 'region', type: 'string' },
    { name: 'coupon', type: ['null', 'string'] },
  ],
};

function randomIntBelow(max) {
  // Rejection sampling to avoid modulo bias
  const limit = 256 - (256 % max);
  let b;
  do {
    b = randomBytes(1)[0];
  } while (b >= limit);
  return b % max;
}

function makeCheckoutRecord() {
  const bytes = randomBytes(16);
  return {
    orderId: `order_${bytes.subarray(0, 4).toString('hex')}`,
    userId: `user_${bytes.subarray(4, 8).toString('hex')}`,
    amount: bytes.readUInt16BE(8) / 100,
    currency: 'USD',
    items: randomIntBelow(20) + 1,
    timestamp: Date.now(),
    region: 'us-east-1',
    coupon: randomIntBelow(10) >= 7 ? 'SAVE10' : null,
  };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const rounds = Number(process.env.ROUNDS ?? 12);
  const warmup = Number(process.env.WARMUP_ROUNDS ?? 5);
  const batchSize = Number(process.env.BATCH_SIZE ?? 5000);
  const outputDir = process.env.OUTPUT_DIR
    ?? path.join(process.cwd(), 'benchmark-results', 'internals', 'latest');

  const logLines = [];
  const log = (line = '') => {
    console.log(line);
    logLines.push(line);
  };

  const metadata = {
    benchmarkName: 'Internals Micro-Benchmark',
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    warmupRounds: warmup,
    measuredRounds: rounds,
    batchSize,
  };

  log(`=== ${metadata.benchmarkName} ===`);
  log(`node      : ${process.version}`);
  log(`platform  : ${process.platform} ${process.arch}`);
  log(`warmup    : ${warmup}  rounds: ${rounds}  batch: ${batchSize}`);

  const results = [];

  // ── 1. encode() with vs without circular-ref check ─────────────────

  log('');
  log('--- encode(): circular-ref check overhead ---');

  const registry = new SchemaRegistry();
  registry.register(checkoutSchema);
  const fp = registry.register(checkoutSchema);
  const entry = registry.getByFingerprint(fp);

  // Pre-generate records so generation cost doesn't contaminate
  const records = Array.from({ length: batchSize }, makeCheckoutRecord);

  const encodeChecked = measureBatch({
    name: `encode (with circ-check) x${batchSize}`,
    warmup,
    rounds,
    batchSize,
    fn: () => {
      for (let i = 0; i < batchSize; i++) {
        encode(entry, records[i]);
      }
    },
  });

  const encodeSkipped = measureBatch({
    name: `encode (skip circ-check) x${batchSize}`,
    warmup,
    rounds,
    batchSize,
    fn: () => {
      for (let i = 0; i < batchSize; i++) {
        encode(entry, records[i], true);
      }
    },
  });

  const circDelta = ((encodeChecked.stats.median - encodeSkipped.stats.median) / encodeSkipped.stats.median) * 100;

  log(`  ${encodeChecked.name.padEnd(42)} median=${fmtUs(encodeChecked.stats.median)} p95=${fmtUs(encodeChecked.stats.p95)} ${fmtOps(encodeChecked.opsPerSec)}`);
  log(`  ${encodeSkipped.name.padEnd(42)} median=${fmtUs(encodeSkipped.stats.median)} p95=${fmtUs(encodeSkipped.stats.p95)} ${fmtOps(encodeSkipped.opsPerSec)}`);
  log(`  overhead: +${circDelta.toFixed(1)}% (circ-check vs skip)`);

  results.push({ category: 'encode', ...encodeChecked });
  results.push({ category: 'encode', ...encodeSkipped });

  // ── 2. Registry lookup: LRU (maxSize) vs unlimited ─────────────────

  log('');
  log('--- registry lookup: LRU vs unlimited ---');

  // Pre-register many schemas to make lookups realistic
  const schemas = [];
  for (let i = 0; i < 100; i++) {
    schemas.push({
      type: 'record',
      name: `Schema_${i}`,
      fields: [
        { name: 'id', type: 'int' },
        { name: 'value', type: 'string' },
        { name: `field_${i}`, type: 'double' },
      ],
    });
  }

  // Build unlimited registry
  const regUnlimited = new SchemaRegistry();
  const fps = [];
  for (const s of schemas) {
    fps.push(regUnlimited.register(s));
  }

  // Build LRU registry (large enough to hold all schemas — measures bookkeeping cost)
  const regLRU = new SchemaRegistry({ maxSize: 200 });
  for (const s of schemas) {
    regLRU.register(s);
  }

  const lookupUnlimited = measureBatch({
    name: `getByFingerprint (unlimited) x${batchSize}`,
    warmup,
    rounds,
    batchSize,
    fn: () => {
      for (let i = 0; i < batchSize; i++) {
        regUnlimited.getByFingerprint(fps[i % fps.length]);
      }
    },
  });

  const lookupLRU = measureBatch({
    name: `getByFingerprint (maxSize=200) x${batchSize}`,
    warmup,
    rounds,
    batchSize,
    fn: () => {
      for (let i = 0; i < batchSize; i++) {
        regLRU.getByFingerprint(fps[i % fps.length]);
      }
    },
  });

  const lruDelta = ((lookupLRU.stats.median - lookupUnlimited.stats.median) / lookupUnlimited.stats.median) * 100;

  log(`  ${lookupUnlimited.name.padEnd(42)} median=${fmtUs(lookupUnlimited.stats.median)} p95=${fmtUs(lookupUnlimited.stats.p95)} ${fmtOps(lookupUnlimited.opsPerSec)}`);
  log(`  ${lookupLRU.name.padEnd(42)} median=${fmtUs(lookupLRU.stats.median)} p95=${fmtUs(lookupLRU.stats.p95)} ${fmtOps(lookupLRU.opsPerSec)}`);
  log(`  LRU overhead: ${lruDelta >= 0 ? '+' : ''}${lruDelta.toFixed(1)}%`);

  results.push({ category: 'registry', ...lookupUnlimited });
  results.push({ category: 'registry', ...lookupLRU });

  // ── 3. Canonical fingerprint vs JSON.stringify ─────────────────────

  log('');
  log('--- fingerprint: canonical form vs JSON.stringify ---');

  // Canonical form (current implementation)
  const fpCanonical = measureBatch({
    name: `fingerprint (canonical) x${batchSize}`,
    warmup,
    rounds,
    batchSize,
    fn: () => {
      for (let i = 0; i < batchSize; i++) {
        fingerprint(schemas[i % schemas.length]);
      }
    },
  });

  // Simulate old JSON.stringify approach for comparison
  // (inline CRC-64 with JSON.stringify input)
  const EMPTY = 0xc15d213aa4d7a795n;
  const TABLE = (() => {
    const table = new Array(256);
    for (let i = 0; i < 256; i++) {
      let v = BigInt(i);
      for (let j = 0; j < 8; j++) {
        v = (v >> 1n) ^ (EMPTY & -(v & 1n));
      }
      table[i] = v;
    }
    return table;
  })();
  const enc = new TextEncoder();

  function fingerprintJsonStringify(schema) {
    const bytes = enc.encode(JSON.stringify(schema));
    let v = EMPTY;
    for (const b of bytes) {
      v = (v >> 8n) ^ (TABLE[Number((v ^ BigInt(b)) & 0xffn)] ?? 0n);
    }
    const result = new Uint8Array(8);
    new DataView(result.buffer).setBigUint64(0, v, false);
    return result;
  }

  const fpStringify = measureBatch({
    name: `fingerprint (JSON.stringify) x${batchSize}`,
    warmup,
    rounds,
    batchSize,
    fn: () => {
      for (let i = 0; i < batchSize; i++) {
        fingerprintJsonStringify(schemas[i % schemas.length]);
      }
    },
  });

  const fpDelta = ((fpCanonical.stats.median - fpStringify.stats.median) / fpStringify.stats.median) * 100;

  log(`  ${fpCanonical.name.padEnd(42)} median=${fmtUs(fpCanonical.stats.median)} p95=${fmtUs(fpCanonical.stats.p95)} ${fmtOps(fpCanonical.opsPerSec)}`);
  log(`  ${fpStringify.name.padEnd(42)} median=${fmtUs(fpStringify.stats.median)} p95=${fmtUs(fpStringify.stats.p95)} ${fmtOps(fpStringify.opsPerSec)}`);
  log(`  canonical overhead: ${fpDelta >= 0 ? '+' : ''}${fpDelta.toFixed(1)}% (one-time cost at schema registration)`);

  results.push({ category: 'fingerprint', ...fpCanonical });
  results.push({ category: 'fingerprint', ...fpStringify });

  // ── Summary ────────────────────────────────────────────────────────

  log('');
  log('=== Summary ===');
  log(`circ-check overhead on encode : +${circDelta.toFixed(1)}%`);
  log(`LRU bookkeeping overhead      : ${lruDelta >= 0 ? '+' : ''}${lruDelta.toFixed(1)}%`);
  log(`canonical form overhead       : ${fpDelta >= 0 ? '+' : ''}${fpDelta.toFixed(1)}% (registration-time only, not hot path)`);

  // ── Artifacts ──────────────────────────────────────────────────────

  fs.mkdirSync(outputDir, { recursive: true });

  const summaryRows = results.map((r) => ({
    name: r.name,
    category: r.category,
    median_ms: r.stats.median,
    p95_ms: r.stats.p95,
    p99_ms: r.stats.p99,
    ops_per_sec: r.opsPerSec,
  }));

  const mdLines = [];
  mdLines.push(`# ${metadata.benchmarkName}`);
  mdLines.push('');
  mdLines.push(`- Generated: ${metadata.generatedAt}`);
  mdLines.push(`- Node: ${metadata.node}`);
  mdLines.push(`- Platform: ${metadata.platform}`);
  mdLines.push(`- Warmup: ${metadata.warmupRounds}, Rounds: ${metadata.measuredRounds}, Batch: ${metadata.batchSize}`);
  mdLines.push('');
  mdLines.push('| Benchmark | Median | p95 | Ops/sec |');
  mdLines.push('|---|---:|---:|---:|');
  for (const row of summaryRows) {
    mdLines.push(
      `| ${row.name} | ${fmtUs(row.median_ms)} | ${fmtUs(row.p95_ms)} | ${fmtOps(row.ops_per_sec)} |`,
    );
  }
  mdLines.push('');
  mdLines.push('### Key Takeaways');
  mdLines.push('');
  mdLines.push(`- **Circular-ref check**: +${circDelta.toFixed(1)}% encode overhead. Use \`encode(entry, obj, true)\` on hot paths where input is trusted.`);
  mdLines.push(`- **LRU bookkeeping**: ${lruDelta >= 0 ? '+' : ''}${lruDelta.toFixed(1)}% lookup overhead. Negligible cost for bounded memory.`);
  mdLines.push(`- **Canonical form**: ${fpDelta >= 0 ? '+' : ''}${fpDelta.toFixed(1)}% fingerprint overhead. Only affects \`register()\`, not encode/decode.`);
  mdLines.push('');

  const payload = { metadata, summary: summaryRows, results };
  const jsonPath  = path.join(outputDir, 'latest.json');
  const csvPath   = path.join(outputDir, 'latest.csv');
  const mdPath    = path.join(outputDir, 'latest.md');
  const logPath   = path.join(outputDir, 'latest.log');

  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(csvPath,  toCsv(summaryRows), 'utf8');
  fs.writeFileSync(mdPath,   `${mdLines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(logPath,  `${logLines.join('\n')}\n`, 'utf8');

  log('');
  log('=== Artifacts ===');
  log(`json    : ${jsonPath}`);
  log(`csv     : ${csvPath}`);
  log(`markdown: ${mdPath}`);
  log(`log     : ${logPath}`);

  fs.writeFileSync(logPath, `${logLines.join('\n')}\n`, 'utf8');
}

await main();
