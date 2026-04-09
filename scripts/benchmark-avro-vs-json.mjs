import avsc from 'avsc';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';

const encoder = new TextEncoder();

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((acc, x) => acc + (x - mean) ** 2, 0) / n;

  const percentile = (p) => {
    const index = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
    return sorted[index];
  };

  return {
    min: sorted[0],
    median: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    max: sorted[n - 1],
    mean,
    stddev: Math.sqrt(variance),
  };
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

function formatOpsPerSec(ops) {
  return `${Math.round(ops).toLocaleString()} ops/s`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function csvEscape(value) {
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function deepEqual(a, b) {
  if (a === b) return true;

  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

function checksumObject(record) {
  return (
    record.id.length +
    record.user.id.length +
    record.metrics.items +
    Math.floor(record.metrics.amountCents) +
    record.tags.length
  );
}

function makeSchema() {
  return {
    type: 'record',
    name: 'CheckoutEvent',
    namespace: 'benchmark.avrostream',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'ts', type: 'long' },
      {
        name: 'user',
        type: {
          type: 'record',
          name: 'UserInfo',
          fields: [
            { name: 'id', type: 'string' },
            { name: 'region', type: 'string' },
            { name: 'tier', type: { type: 'enum', name: 'Tier', symbols: ['free', 'pro', 'enterprise'] } },
          ],
        },
      },
      {
        name: 'metrics',
        type: {
          type: 'record',
          name: 'Metrics',
          fields: [
            { name: 'items', type: 'int' },
            { name: 'amountCents', type: 'int' },
            { name: 'discountCents', type: 'int' },
            { name: 'success', type: 'boolean' },
          ],
        },
      },
      {
        name: 'tags',
        type: { type: 'array', items: 'string' },
      },
      {
        name: 'attributes',
        type: { type: 'map', values: 'string' },
      },
      {
        name: 'session',
        type: {
          type: 'record',
          name: 'SessionInfo',
          fields: [
            { name: 'ip', type: 'string' },
            { name: 'device', type: 'string' },
            { name: 'browser', type: 'string' },
          ],
        },
      },
    ],
  };
}

function makeRecords(count) {
  const regions = ['us-east', 'us-west', 'eu-central', 'ap-south'];
  const tiers = ['free', 'pro', 'enterprise'];
  const devices = ['desktop', 'mobile', 'tablet'];
  const browsers = ['chrome', 'firefox', 'safari', 'edge'];

  const records = new Array(count);

  for (let i = 0; i < count; i++) {
    records[i] = {
      id: `evt_${i.toString(36).padStart(8, '0')}`,
      ts: 1_710_000_000_000 + i,
      user: {
        id: `usr_${(i * 17).toString(36).padStart(7, '0')}`,
        region: regions[i % regions.length],
        tier: tiers[i % tiers.length],
      },
      metrics: {
        items: (i % 12) + 1,
        amountCents: ((i * 97) % 20_000) + 500,
        discountCents: (i * 13) % 600,
        success: i % 9 !== 0,
      },
      tags: [`campaign_${i % 15}`, `channel_${i % 4}`, `ab_${i % 2}`],
      attributes: {
        locale: i % 2 === 0 ? 'en-US' : 'fr-FR',
        currency: i % 3 === 0 ? 'USD' : 'EUR',
        source: `src_${i % 7}`,
      },
      session: {
        ip: `10.${i % 255}.${(i * 7) % 255}.${(i * 13) % 255}`,
        device: devices[i % devices.length],
        browser: browsers[i % browsers.length],
      },
    };
  }

  return records;
}

function measureOperation({ name, rounds, warmupRounds, fn, itemCount }) {
  for (let i = 0; i < warmupRounds; i++) {
    fn();
  }

  const times = [];
  let sink = 0;

  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    sink ^= fn();
    const elapsed = performance.now() - start;
    times.push(elapsed);
  }

  const summary = stats(times);
  const opsPerSec = (itemCount * 1000) / summary.median;

  return {
    name,
    sink,
    samples: times,
    summary,
    opsPerSec,
  };
}

function runScenario({ name, records, rounds, warmupRounds }) {
  const schema = makeSchema();
  const type = avsc.Type.forSchema(schema);

  const encodedAvro = new Array(records.length);
  const encodedJson = new Array(records.length);

  const avroEncode = measureOperation({
    name: 'avro encode',
    rounds,
    warmupRounds,
    itemCount: records.length,
    fn: () => {
      let checksum = 0;
      for (let i = 0; i < records.length; i++) {
        const buf = type.toBuffer(records[i]);
        encodedAvro[i] = buf;
        checksum ^= buf.length;
      }
      return checksum;
    },
  });

  const jsonEncode = measureOperation({
    name: 'json stringify',
    rounds,
    warmupRounds,
    itemCount: records.length,
    fn: () => {
      let checksum = 0;
      for (let i = 0; i < records.length; i++) {
        const json = JSON.stringify(records[i]);
        const bytes = encoder.encode(json);
        encodedJson[i] = json;
        checksum ^= bytes.length;
      }
      return checksum;
    },
  });

  const avroDecode = measureOperation({
    name: 'avro decode',
    rounds,
    warmupRounds,
    itemCount: records.length,
    fn: () => {
      let checksum = 0;
      for (let i = 0; i < encodedAvro.length; i++) {
        const rec = type.fromBuffer(encodedAvro[i]);
        checksum ^= checksumObject(rec);
      }
      return checksum;
    },
  });

  const jsonDecode = measureOperation({
    name: 'json parse',
    rounds,
    warmupRounds,
    itemCount: records.length,
    fn: () => {
      let checksum = 0;
      for (let i = 0; i < encodedJson.length; i++) {
        const rec = JSON.parse(encodedJson[i]);
        checksum ^= checksumObject(rec);
      }
      return checksum;
    },
  });

  // Correctness spot checks
  const sampleIndices = [0, Math.floor(records.length / 2), records.length - 1];
  for (const idx of sampleIndices) {
    const source = records[idx];
    const avroRoundtrip = type.fromBuffer(type.toBuffer(source));
    const jsonRoundtrip = JSON.parse(JSON.stringify(source));

    assert(deepEqual(source, avroRoundtrip), `Avro roundtrip mismatch at index ${idx}`);
    assert(deepEqual(source, jsonRoundtrip), `JSON roundtrip mismatch at index ${idx}`);
  }

  // Size comparison
  let avroBytes = 0;
  let jsonBytes = 0;

  for (let i = 0; i < records.length; i++) {
    avroBytes += encodedAvro[i].length;
    jsonBytes += encoder.encode(encodedJson[i]).length;
  }

  const reduction = ((jsonBytes - avroBytes) / jsonBytes) * 100;

  return {
    name,
    count: records.length,
    avroEncode,
    jsonEncode,
    avroDecode,
    jsonDecode,
    avroBytes,
    jsonBytes,
    reduction,
  };
}

function printResult(result) {
  const { avroEncode, jsonEncode, avroDecode, jsonDecode } = result;

  console.log('');
  console.log(`=== ${result.name} (${result.count.toLocaleString()} records) ===`);

  console.log(
    `encode  avro=${formatMs(avroEncode.summary.median)} (${formatOpsPerSec(avroEncode.opsPerSec)}) ` +
      `json=${formatMs(jsonEncode.summary.median)} (${formatOpsPerSec(jsonEncode.opsPerSec)}) ` +
      `avro-vs-json=${(jsonEncode.summary.median / avroEncode.summary.median).toFixed(2)}x`,
  );

  console.log(
    `decode  avro=${formatMs(avroDecode.summary.median)} (${formatOpsPerSec(avroDecode.opsPerSec)}) ` +
      `json=${formatMs(jsonDecode.summary.median)} (${formatOpsPerSec(jsonDecode.opsPerSec)}) ` +
      `avro-vs-json=${(jsonDecode.summary.median / avroDecode.summary.median).toFixed(2)}x`,
  );

  console.log(
    `sizes   avro=${formatBytes(result.avroBytes)} json=${formatBytes(result.jsonBytes)} ` +
      `reduction=${result.reduction.toFixed(2)}%`,
  );

  console.log(
    `stdev   avro-enc=${formatMs(avroEncode.summary.stddev)} json-enc=${formatMs(jsonEncode.summary.stddev)} ` +
      `avro-dec=${formatMs(avroDecode.summary.stddev)} json-dec=${formatMs(jsonDecode.summary.stddev)}`,
  );

  console.log(
    `p95     avro-enc=${formatMs(avroEncode.summary.p95)} json-enc=${formatMs(jsonEncode.summary.p95)} ` +
      `avro-dec=${formatMs(avroDecode.summary.p95)} json-dec=${formatMs(jsonDecode.summary.p95)}`,
  );
}

function toSerializableResult(result) {
  return {
    name: result.name,
    count: result.count,
    avroBytes: result.avroBytes,
    jsonBytes: result.jsonBytes,
    reductionPercent: Number(result.reduction.toFixed(4)),
    operations: {
      avroEncode: {
        opsPerSec: result.avroEncode.opsPerSec,
        summary: result.avroEncode.summary,
        samplesMs: result.avroEncode.samples,
      },
      jsonEncode: {
        opsPerSec: result.jsonEncode.opsPerSec,
        summary: result.jsonEncode.summary,
        samplesMs: result.jsonEncode.samples,
      },
      avroDecode: {
        opsPerSec: result.avroDecode.opsPerSec,
        summary: result.avroDecode.summary,
        samplesMs: result.avroDecode.samples,
      },
      jsonDecode: {
        opsPerSec: result.jsonDecode.opsPerSec,
        summary: result.jsonDecode.summary,
        samplesMs: result.jsonDecode.samples,
      },
    },
  };
}

function createSummaryRows(results) {
  return results.map((result) => {
    const encodeDelta = ((result.jsonEncode.summary.median - result.avroEncode.summary.median) / result.jsonEncode.summary.median) * 100;
    const decodeDelta = ((result.jsonDecode.summary.median - result.avroDecode.summary.median) / result.jsonDecode.summary.median) * 100;

    return {
      scenario: result.name,
      records: result.count,
      avro_encode_median_ms: result.avroEncode.summary.median,
      avro_encode_p99_ms: result.avroEncode.summary.p99,
      json_encode_median_ms: result.jsonEncode.summary.median,
      json_encode_p99_ms: result.jsonEncode.summary.p99,
      avro_decode_median_ms: result.avroDecode.summary.median,
      avro_decode_p99_ms: result.avroDecode.summary.p99,
      json_decode_median_ms: result.jsonDecode.summary.median,
      json_decode_p99_ms: result.jsonDecode.summary.p99,
      avro_encode_ops_s: result.avroEncode.opsPerSec,
      json_encode_ops_s: result.jsonEncode.opsPerSec,
      avro_decode_ops_s: result.avroDecode.opsPerSec,
      json_decode_ops_s: result.jsonDecode.opsPerSec,
      avro_bytes: result.avroBytes,
      json_bytes: result.jsonBytes,
      size_reduction_percent: result.reduction,
      encode_avro_faster_percent: encodeDelta,
      decode_avro_faster_percent: decodeDelta,
    };
  });
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

function toMarkdownReport(meta, rows) {
  const lines = [];
  lines.push('# Avro vs JSON Benchmark Report');
  lines.push('');
  lines.push(`- Generated: ${meta.generatedAt}`);
  lines.push(`- Node: ${meta.node}`);
  lines.push(`- Platform: ${meta.platform}`);
  lines.push(`- Warmup rounds: ${meta.warmupRounds}`);
  lines.push(`- Measured rounds: ${meta.rounds}`);
  lines.push(`- Scenarios: ${meta.scenarios.join(', ')}`);
  lines.push('');
  lines.push('| Records | Avro Encode (ms) | Avro Enc p99 | JSON Encode (ms) | JSON Enc p99 | Avro Decode (ms) | Avro Dec p99 | JSON Decode (ms) | JSON Dec p99 | Size Reduction | Encode Faster | Decode Faster |');
  lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');

  for (const row of rows) {
    lines.push(
      `| ${row.records.toLocaleString()} | ${row.avro_encode_median_ms.toFixed(2)} | ${row.avro_encode_p99_ms.toFixed(2)} | ${row.json_encode_median_ms.toFixed(2)} | ${row.json_encode_p99_ms.toFixed(2)} | ${row.avro_decode_median_ms.toFixed(2)} | ${row.avro_decode_p99_ms.toFixed(2)} | ${row.json_decode_median_ms.toFixed(2)} | ${row.json_decode_p99_ms.toFixed(2)} | ${row.size_reduction_percent.toFixed(2)}% | ${row.encode_avro_faster_percent.toFixed(2)}% | ${row.decode_avro_faster_percent.toFixed(2)}% |`,
    );
  }

  lines.push('');
  lines.push('Positive `Encode Faster` / `Decode Faster` means Avro is faster than JSON for that metric.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeArtifacts({ outputDir, meta, results, summaryRows, logLines }) {
  fs.mkdirSync(outputDir, { recursive: true });

  const payload = {
    metadata: meta,
    summary: summaryRows,
    results: results.map(toSerializableResult),
  };

  const jsonPath = path.join(outputDir, 'latest.json');
  const csvPath = path.join(outputDir, 'latest.csv');
  const mdPath = path.join(outputDir, 'latest.md');
  const logPath = path.join(outputDir, 'latest.log');

  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(csvPath, toCsv(summaryRows), 'utf8');
  fs.writeFileSync(mdPath, toMarkdownReport(meta, summaryRows), 'utf8');
  fs.writeFileSync(logPath, `${logLines.join('\n')}\n`, 'utf8');

  return {
    jsonPath,
    csvPath,
    mdPath,
    logPath,
  };
}

function main() {
  const rounds = Number(process.env.ROUNDS ?? 8);
  const warmupRounds = Number(process.env.WARMUP_ROUNDS ?? 3);
  const outputDir = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'benchmark-results', 'avro-vs-json', 'latest');

  const sizes = (process.env.SCENARIOS ?? '5000,20000,50000')
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const logLines = [];
  const log = (line = '') => {
    console.log(line);
    logLines.push(line);
  };

  const metadata = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    warmupRounds,
    rounds,
    scenarios: sizes,
    gcEnabled: typeof global.gc === 'function',
  };

  log('=== AvroStream Real Benchmark: Avro vs JSON ===');
  log(`node         : ${process.version}`);
  log(`platform     : ${process.platform} ${process.arch}`);
  log(`warmupRounds : ${warmupRounds}`);
  log(`rounds       : ${rounds}`);
  log(`scenarios    : ${sizes.map((x) => x.toLocaleString()).join(', ')}`);

  if (typeof global.gc !== 'function') {
    log('gc           : unavailable (run with --expose-gc for tighter memory stability)');
  }

  const results = [];

  for (const size of sizes) {
    if (typeof global.gc === 'function') {
      global.gc();
    }

    const records = makeRecords(size);
    const result = runScenario({
      name: 'CheckoutEvent workload',
      records,
      rounds,
      warmupRounds,
    });

    const operationLines = [];
    const originalLog = console.log;
    console.log = (...args) => {
      const line = args.map((a) => String(a)).join(' ');
      operationLines.push(line);
      originalLog(...args);
    };

    try {
      printResult(result);
    } finally {
      console.log = originalLog;
    }

    logLines.push(...operationLines);
    results.push(result);
  }

  log('');
  log('=== Summary ===');

  for (const result of results) {
    const encodeDelta = ((result.jsonEncode.summary.median - result.avroEncode.summary.median) / result.jsonEncode.summary.median) * 100;
    const decodeDelta = ((result.jsonDecode.summary.median - result.avroDecode.summary.median) / result.jsonDecode.summary.median) * 100;

    log(
      `${result.count.toLocaleString()} recs: size ${result.reduction.toFixed(2)}% smaller (avro vs json), ` +
        `encode ${encodeDelta.toFixed(2)}%, decode ${decodeDelta.toFixed(2)}% (positive means Avro faster)`,
    );
  }

  const summaryRows = createSummaryRows(results);
  const artifacts = writeArtifacts({
    outputDir,
    meta: metadata,
    results,
    summaryRows,
    logLines,
  });

  log('');
  log('=== Artifacts ===');
  log(`json    : ${artifacts.jsonPath}`);
  log(`csv     : ${artifacts.csvPath}`);
  log(`markdown: ${artifacts.mdPath}`);
  log(`log     : ${artifacts.logPath}`);

  fs.writeFileSync(artifacts.logPath, `${logLines.join('\n')}\n`, 'utf8');
}

main();
