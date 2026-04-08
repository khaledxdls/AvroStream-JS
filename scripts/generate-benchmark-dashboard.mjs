import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RESULTS_DIR = path.join(ROOT, 'benchmark-results');
const OUTPUT_PATH = path.join(RESULTS_DIR, 'benchmark-dashboard.md');

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function toPct(value) {
  return `${value.toFixed(2)}%`;
}

function toNum(value) {
  return Number(value).toLocaleString();
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function emitAvroVsJsonSection(lines, filePath, json) {
  const summary = Array.isArray(json?.summary) ? json.summary : [];
  if (summary.length === 0) return;

  const mdRel = rel(filePath).replace('/latest.json', '/latest.md');
  const csvRel = rel(filePath).replace('/latest.json', '/latest.csv');

  lines.push(`### Avro vs JSON — ${path.basename(path.dirname(filePath))}`);
  lines.push(`- Source: [${mdRel}](${mdRel}) · [${csvRel}](${csvRel})`);
  lines.push('');
  lines.push('| Records | Encode (Avro faster) | Decode (Avro faster) | Size Reduction |');
  lines.push('|---:|---:|---:|---:|');

  for (const row of summary) {
    lines.push(
      `| ${toNum(row.records)} | ${toPct(row.encode_avro_faster_percent)} | ${toPct(row.decode_avro_faster_percent)} | ${toPct(row.size_reduction_percent)} |`,
    );
  }

  lines.push('');
}

function extractPair(summary, modeKey, modeA = 'json', modeB = 'avro') {
  if (!Array.isArray(summary) || summary.length < 2) return null;
  const a = summary.find((x) => x.mode === modeA);
  const b = summary.find((x) => x.mode === modeB);
  if (!a || !b) return null;

  const throughputKey =
    Object.prototype.hasOwnProperty.call(a, 'throughput_req_s')
      ? 'throughput_req_s'
      : Object.prototype.hasOwnProperty.call(a, 'throughput_msg_s')
        ? 'throughput_msg_s'
        : null;

  if (!throughputKey) return null;

  const medianDelta = ((a.median_ms - b.median_ms) / a.median_ms) * 100;
  const throughputDelta = ((b[throughputKey] - a[throughputKey]) / a[throughputKey]) * 100;
  const reqDelta = ((a.avg_req_bytes - b.avg_req_bytes) / a.avg_req_bytes) * 100;
  const resDelta = ((a.avg_res_bytes - b.avg_res_bytes) / a.avg_res_bytes) * 100;

  return {
    requests: a.requests ?? a.messages,
    concurrency: a.concurrency,
    medianDelta,
    throughputDelta,
    reqDelta,
    resDelta,
    throughputKey,
    a,
    b,
    modeKey,
  };
}

function emitPairSection(lines, title, filePath, json, modeKey) {
  const summary = Array.isArray(json?.summary) ? json.summary : [];
  const pair = extractPair(summary, modeKey);
  if (!pair) return;

  const mdRel = rel(filePath).replace('/latest.json', '/latest.md');
  const csvRel = rel(filePath).replace('/latest.json', '/latest.csv');

  lines.push(`### ${title} — ${path.basename(path.dirname(filePath))}`);
  lines.push(`- Source: [${mdRel}](${mdRel}) · [${csvRel}](${csvRel})`);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(`| Requests/Messages | ${toNum(pair.requests)} |`);
  lines.push(`| Concurrency | ${toNum(pair.concurrency)} |`);
  lines.push(`| Throughput delta (Avro vs JSON) | ${toPct(pair.throughputDelta)} |`);
  lines.push(`| Median latency delta (Avro vs JSON) | ${toPct(pair.medianDelta)} |`);
  lines.push(`| Request payload bytes delta | ${toPct(pair.reqDelta)} |`);
  lines.push(`| Response payload bytes delta | ${toPct(pair.resDelta)} |`);
  lines.push('');
}

function collectJsonFiles() {
  const files = [];
  const categories = listDirs(RESULTS_DIR);

  for (const category of categories) {
    const categoryDir = path.join(RESULTS_DIR, category);
    const profiles = listDirs(categoryDir);
    for (const profile of profiles) {
      const jsonPath = path.join(categoryDir, profile, 'latest.json');
      if (fs.existsSync(jsonPath)) {
        files.push({ category, profile, jsonPath });
      }
    }
  }

  return files;
}

function main() {
  const files = collectJsonFiles();

  const lines = [];
  lines.push('# Benchmark Dashboard');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('This page consolidates benchmark outputs from all folders under `benchmark-results`.');
  lines.push('');

  for (const file of files) {
    const json = safeReadJson(file.jsonPath);
    if (!json) continue;

    if (file.category === 'avro-vs-json') {
      emitAvroVsJsonSection(lines, file.jsonPath, json);
      continue;
    }

    if (file.category === 'e2e-web') {
      emitPairSection(lines, 'E2E Web', file.jsonPath, json, 'req');
      continue;
    }

    if (file.category === 'e2e-ws') {
      emitPairSection(lines, 'E2E WebSocket', file.jsonPath, json, 'msg');
      continue;
    }

    if (file.category === 's2s') {
      emitPairSection(lines, 'Server-to-Server HTTP', file.jsonPath, json, 'req');
      continue;
    }
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${lines.join('\n')}\n`, 'utf8');

  console.log(`Wrote benchmark dashboard: ${rel(OUTPUT_PATH)}`);
}

main();
