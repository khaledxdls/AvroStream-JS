/**
 * Schema Benchmark
 *
 * Measures:
 *  - inferSchema() latency across 4 object shapes
 *  - fingerprint() on schemas of 4 sizes
 *  - avsc.Type.forSchema() compilation cost
 *  - Schema registry register() + getByFingerprint() round-trip
 *
 * Methodology: warmup rounds followed by measured rounds.
 * Outputs median, p95, p99, ops/sec.
 * Saves JSON/CSV/MD/log to benchmark-results/schema/latest/.
 */

import avsc from 'avsc';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';

const { inferSchema, fingerprint, SchemaRegistry } = await import('../dist/index.js');

// ── Percentile / stats helpers ────────────────────────────────────────

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

// ── Object shape generators ───────────────────────────────────────────

function makeFlat10() {
  return {
    id: 'flat_10_record',
    name: 'Alice',
    age: 30,
    email: 'alice@example.com',
    city: 'Paris',
    country: 'France',
    score: 9.5,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeFlat50() {
  const obj = {};
  for (let i = 0; i < 50; i++) {
    obj[`field_${i}`] = i % 3 === 0 ? `value_${i}` : i % 3 === 1 ? i : i % 2 === 0;
  }
  return obj;
}

function makeNested3() {
  return {
    id: 'nested_3',
    level1: {
      name: 'L1',
      value: 42,
      level2: {
        name: 'L2',
        score: 3.14,
        level3: {
          name: 'L3',
          active: true,
          tags: ['a', 'b', 'c'],
        },
      },
    },
    metadata: {
      createdAt: Date.now(),
      source: 'benchmark',
    },
  };
}

function makeNested5() {
  return {
    id: 'nested_5',
    a: {
      value: 1,
      b: {
        value: 2,
        c: {
          value: 3,
          d: {
            value: 4,
            e: {
              value: 5,
              leaf: 'deep',
            },
          },
        },
      },
    },
    meta: { ts: Date.now() },
  };
}

// ── Measure helper ────────────────────────────────────────────────────

function measure({ name, warmup, rounds, fn }) {
  // Warmup
  for (let i = 0; i < warmup; i++) fn();

  const times = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const s = stats(times);
  const opsPerSec = 1000 / s.median;
  return { name, stats: s, opsPerSec };
}

// ── Format helpers ────────────────────────────────────────────────────

function fmtUs(ms) {
  return ms < 1 ? `${(ms * 1000).toFixed(1)} µs` : `${ms.toFixed(3)} ms`;
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

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const rounds = Number(process.env.ROUNDS ?? 10);
  const warmup = Number(process.env.WARMUP_ROUNDS ?? 5);
  const outputDir = process.env.OUTPUT_DIR
    ?? path.join(process.cwd(), 'benchmark-results', 'schema', 'latest');

  const logLines = [];
  const log = (line = '') => {
    console.log(line);
    logLines.push(line);
  };

  const metadata = {
    benchmarkName: 'Schema Pipeline Benchmark',
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    warmupRounds: warmup,
    measuredRounds: rounds,
  };

  log(`=== ${metadata.benchmarkName} ===`);
  log(`node     : ${process.version}`);
  log(`platform : ${process.platform} ${process.arch}`);
  log(`warmup   : ${warmup}  rounds   : ${rounds}`);

  const results = [];

  // ── 1. inferSchema() latency ────────────────────────────────────────
  log('');
  log('--- inferSchema() ---');

  const inferShapes = [
    { name: 'flat-10',      fn: makeFlat10  },
    { name: 'flat-50',      fn: makeFlat50  },
    { name: 'nested-3-deep', fn: makeNested3 },
    { name: 'nested-5-deep', fn: makeNested5 },
  ];

  for (const shape of inferShapes) {
    const obj = shape.fn();
    const r = measure({
      name: `inferSchema(${shape.name})`,
      warmup,
      rounds,
      fn: () => inferSchema(obj),
    });
    log(`  ${r.name.padEnd(30)} median=${fmtUs(r.stats.median)} p95=${fmtUs(r.stats.p95)} p99=${fmtUs(r.stats.p99)} ${fmtOps(r.opsPerSec)}`);
    results.push({ category: 'inferSchema', ...r });
  }

  // ── 2. fingerprint() latency ─────────────────────────────────────────
  log('');
  log('--- fingerprint() ---');

  const fingerprintSchemas = [
    {
      label: 'tiny (3 fields)',
      schema: inferSchema(makeFlat10()),
    },
    {
      label: 'medium (50 fields)',
      schema: inferSchema(makeFlat50()),
    },
    {
      label: 'nested-3',
      schema: inferSchema(makeNested3()),
    },
    {
      label: 'nested-5',
      schema: inferSchema(makeNested5()),
    },
  ];

  for (const s of fingerprintSchemas) {
    const r = measure({
      name: `fingerprint(${s.label})`,
      warmup,
      rounds,
      fn: () => fingerprint(s.schema),
    });
    log(`  ${r.name.padEnd(30)} median=${fmtUs(r.stats.median)} p95=${fmtUs(r.stats.p95)} p99=${fmtUs(r.stats.p99)} ${fmtOps(r.opsPerSec)}`);
    results.push({ category: 'fingerprint', ...r });
  }

  // ── 3. avsc.Type.forSchema() compilation cost ─────────────────────────
  log('');
  log('--- avsc.Type.forSchema() ---');

  for (const shape of inferShapes) {
    const schema = inferSchema(shape.fn());
    const r = measure({
      name: `forSchema(${shape.name})`,
      warmup,
      rounds,
      fn: () => avsc.Type.forSchema(schema),
    });
    log(`  ${r.name.padEnd(30)} median=${fmtUs(r.stats.median)} p95=${fmtUs(r.stats.p95)} p99=${fmtUs(r.stats.p99)} ${fmtOps(r.opsPerSec)}`);
    results.push({ category: 'forSchema', ...r });
  }

  // ── 4. Registry register() + getByFingerprint() round-trip ───────────
  log('');
  log('--- SchemaRegistry round-trip ---');

  for (const shape of inferShapes) {
    const schema = inferSchema(shape.fn());
    const r = measure({
      name: `registry(${shape.name})`,
      warmup,
      rounds,
      fn: () => {
        const reg = new SchemaRegistry();
        const fp = reg.register(schema);
        return reg.getByFingerprint(fp);
      },
    });
    log(`  ${r.name.padEnd(30)} median=${fmtUs(r.stats.median)} p95=${fmtUs(r.stats.p95)} p99=${fmtUs(r.stats.p99)} ${fmtOps(r.opsPerSec)}`);
    results.push({ category: 'registry', ...r });
  }

  // ── Artifacts ──────────────────────────────────────────────────────────
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
  mdLines.push(`- Warmup rounds: ${metadata.warmupRounds}`);
  mdLines.push(`- Measured rounds: ${metadata.measuredRounds}`);
  mdLines.push('');
  mdLines.push('| Benchmark | Median | p95 | p99 | Ops/sec |');
  mdLines.push('|---|---:|---:|---:|---:|');
  for (const row of summaryRows) {
    mdLines.push(
      `| ${row.name} | ${fmtUs(row.median_ms)} | ${fmtUs(row.p95_ms)} | ${fmtUs(row.p99_ms)} | ${fmtOps(row.ops_per_sec)} |`,
    );
  }
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
