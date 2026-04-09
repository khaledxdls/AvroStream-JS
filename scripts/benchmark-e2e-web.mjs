import http from 'node:http';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import avsc from 'avsc';

const {
  AvroClient,
  fingerprint,
} = await import('../dist/index.js');

const encoder = new TextEncoder();

const REQUEST_SCHEMA = {
  type: 'record',
  name: 'WebEvent',
  namespace: 'benchmark.e2e',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'userId', type: 'string' },
    { name: 'page', type: 'string' },
    { name: 'action', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'ts', type: 'long' },
    {
      name: 'metrics',
      type: {
        type: 'record',
        name: 'WebMetrics',
        fields: [
          { name: 'durationMs', type: 'int' },
          { name: 'bytes', type: 'int' },
          { name: 'success', type: 'boolean' },
        ],
      },
    },
    { name: 'tags', type: { type: 'array', items: 'string' } },
    { name: 'meta', type: { type: 'map', values: 'string' } },
  ],
};

const RESPONSE_SCHEMA = {
  type: 'record',
  name: 'WebEventAck',
  namespace: 'benchmark.e2e',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'ok', type: 'boolean' },
    { name: 'receivedAt', type: 'long' },
    { name: 'serverNode', type: 'string' },
    { name: 'echoAction', type: 'string' },
  ],
};

function percentile(sorted, p) {
  const n = sorted.length;
  const index = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return sorted[index];
}

function summarize(samples) {
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

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
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

function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function makePayload(index) {
  return {
    id: `evt_${index.toString(36).padStart(8, '0')}`,
    userId: `user_${(index * 13).toString(36).padStart(7, '0')}`,
    page: ['/home', '/pricing', '/docs', '/checkout'][index % 4],
    action: ['click', 'scroll', 'submit', 'navigate'][index % 4],
    sessionId: `sess_${(index * 31).toString(36).padStart(7, '0')}`,
    ts: Date.now() + index,
    metrics: {
      durationMs: (index % 250) + 1,
      bytes: ((index * 101) % 100000) + 128,
      success: index % 10 !== 0,
    },
    tags: [`ab_${index % 2}`, `campaign_${index % 7}`, `region_${index % 4}`],
    meta: {
      locale: index % 2 === 0 ? 'en-US' : 'fr-FR',
      browser: ['chrome', 'firefox', 'safari'][index % 3],
      device: ['desktop', 'mobile'][index % 2],
    },
  };
}

function frame(fp, payloadBytes) {
  const out = new Uint8Array(1 + 8 + payloadBytes.length);
  out[0] = 0x01; // WIRE_VERSION_STANDARD
  out.set(fp, 1);
  out.set(payloadBytes, 9);
  return out;
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    const asUint8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    size += asUint8.length;
    if (size > maxBytes) {
      throw new Error(`payload exceeds max bytes (${maxBytes})`);
    }
    chunks.push(asUint8);
  }

  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

function writeJson(res, status, obj, counters) {
  const body = encoder.encode(JSON.stringify(obj));
  counters.resBytes += body.length;
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': String(body.length),
  });
  res.end(body);
}

function writeAvro(res, status, fp, type, obj, counters) {
  const dataBuf = type.toBuffer(obj);
  const wire = frame(fp, new Uint8Array(dataBuf.buffer, dataBuf.byteOffset, dataBuf.byteLength));
  counters.resBytes += wire.length;
  res.writeHead(status, {
    'Content-Type': 'application/avro',
    'Content-Length': String(wire.length),
  });
  res.end(wire);
}

async function startServer({ port, host, maxBodyBytes }) {
  const requestType = avsc.Type.forSchema(REQUEST_SCHEMA);
  const responseType = avsc.Type.forSchema(RESPONSE_SCHEMA);

  const requestFp = fingerprint(REQUEST_SCHEMA);
  const responseFp = fingerprint(RESPONSE_SCHEMA);

  const requestFpHex = Buffer.from(requestFp).toString('hex');

  const counters = {
    json: { reqBytes: 0, resBytes: 0, requests: 0 },
    avro: { reqBytes: 0, resBytes: 0, requests: 0 },
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST') {
        writeJson(res, 405, { error: 'method not allowed' }, counters.json);
        return;
      }

      if (req.url === '/api/json') {
        const bodyBytes = await readBody(req, maxBodyBytes);
        counters.json.reqBytes += bodyBytes.length;
        counters.json.requests += 1;

        const input = JSON.parse(Buffer.from(bodyBytes).toString('utf8'));
        const output = {
          id: input.id,
          ok: true,
          receivedAt: Date.now(),
          serverNode: process.version,
          echoAction: input.action,
        };

        writeJson(res, 200, output, counters.json);
        return;
      }

      if (req.url === '/api/avro') {
        const wire = await readBody(req, maxBodyBytes);
        counters.avro.reqBytes += wire.length;
        counters.avro.requests += 1;

        if (wire.length < 9) {
          writeJson(res, 400, { error: 'invalid avro frame' }, counters.avro);
          return;
        }

        // wire[0] is the version byte; fp is at [1..9]
        const fpHex = Buffer.from(wire.slice(1, 9)).toString('hex');
        if (fpHex !== requestFpHex) {
          res.writeHead(406, {
            'X-Avro-Missing-Schema': 'true',
            'Content-Length': '0',
          });
          res.end();
          return;
        }

        const payload = wire.slice(9);
        const decoded = requestType.fromBuffer(Buffer.from(payload));

        const output = {
          id: decoded.id,
          ok: true,
          receivedAt: Date.now(),
          serverNode: process.version,
          echoAction: decoded.action,
        };

        writeAvro(res, 200, responseFp, responseType, output, counters.avro);
        return;
      }

      writeJson(res, 404, { error: 'not found' }, counters.json);
    } catch (error) {
      writeJson(
        res,
        500,
        { error: error instanceof Error ? error.message : String(error) },
        counters.json,
      );
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  return {
    server,
    counters,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function runLoad({ totalRequests, concurrency, requester }) {
  const latencies = new Array(totalRequests);
  let index = 0;

  async function worker() {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= totalRequests) return;

      const start = performance.now();
      await requester(current);
      const elapsed = performance.now() - start;
      latencies[current] = elapsed;
    }
  }

  const start = performance.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const totalElapsed = performance.now() - start;

  return {
    latencies,
    totalElapsed,
  };
}

function snapshotCounters(counters) {
  return {
    json: { ...counters.json },
    avro: { ...counters.avro },
  };
}

function diffCounters(after, before, key) {
  return {
    reqBytes: after[key].reqBytes - before[key].reqBytes,
    resBytes: after[key].resBytes - before[key].resBytes,
    requests: after[key].requests - before[key].requests,
  };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function writeArtifacts({ outputDir, metadata, results, logLines }) {
  fs.mkdirSync(outputDir, { recursive: true });

  const summaryRows = results.map((r) => ({
    mode: r.mode,
    requests: r.requests,
    concurrency: r.concurrency,
    median_ms: r.summary.median,
    p95_ms: r.summary.p95,
    p99_ms: r.summary.p99,
    throughput_req_s: r.throughput,
    req_bytes_total: r.bytes.reqBytes,
    res_bytes_total: r.bytes.resBytes,
    avg_req_bytes: r.bytes.reqBytes / r.bytes.requests,
    avg_res_bytes: r.bytes.resBytes / r.bytes.requests,
  }));

  const payload = {
    metadata,
    summary: summaryRows,
    results,
  };

  const mdLines = [];
  mdLines.push(`# ${metadata.benchmarkName}`);
  mdLines.push('');
  mdLines.push(`- Generated: ${metadata.generatedAt}`);
  mdLines.push(`- Node: ${metadata.node}`);
  mdLines.push(`- Platform: ${metadata.platform}`);
  mdLines.push(`- Endpoint host: ${metadata.host}:${metadata.port}`);
  mdLines.push(`- Requests per mode: ${metadata.requests}`);
  mdLines.push(`- Warmup requests: ${metadata.warmup}`);
  mdLines.push(`- Concurrency: ${metadata.concurrency}`);
  mdLines.push('');
  mdLines.push('| Mode | Median | p95 | p99 | Throughput | Avg Request Bytes | Avg Response Bytes |');
  mdLines.push('|---|---:|---:|---:|---:|---:|---:|');

  for (const row of summaryRows) {
    mdLines.push(
      `| ${row.mode} | ${row.median_ms.toFixed(2)} ms | ${row.p95_ms.toFixed(2)} ms | ${row.p99_ms.toFixed(2)} ms | ${Math.round(row.throughput_req_s).toLocaleString()} req/s | ${row.avg_req_bytes.toFixed(1)} | ${row.avg_res_bytes.toFixed(1)} |`,
    );
  }

  if (summaryRows.length === 2) {
    const json = summaryRows.find((r) => r.mode === 'json');
    const avro = summaryRows.find((r) => r.mode === 'avro');

    if (json && avro) {
      const latencyGain = ((json.median_ms - avro.median_ms) / json.median_ms) * 100;
      const throughputGain = ((avro.throughput_req_s - json.throughput_req_s) / json.throughput_req_s) * 100;
      const requestReduction = ((json.avg_req_bytes - avro.avg_req_bytes) / json.avg_req_bytes) * 100;
      const responseReduction = ((json.avg_res_bytes - avro.avg_res_bytes) / json.avg_res_bytes) * 100;

      mdLines.push('');
      mdLines.push('## Delta (Avro vs JSON)');
      mdLines.push('');
      mdLines.push(`- Median latency: ${latencyGain.toFixed(2)}% (${latencyGain >= 0 ? 'faster' : 'slower'})`);
      mdLines.push(`- Throughput: ${throughputGain.toFixed(2)}% (${throughputGain >= 0 ? 'higher' : 'lower'})`);
      mdLines.push(`- Request payload bytes: ${requestReduction.toFixed(2)}% smaller`);
      mdLines.push(`- Response payload bytes: ${responseReduction.toFixed(2)}% smaller`);
    }
  }

  mdLines.push('');
  mdLines.push('This benchmark uses a real localhost HTTP server and real client requests (web-style interaction).');

  const jsonPath = path.join(outputDir, 'latest.json');
  const csvPath = path.join(outputDir, 'latest.csv');
  const mdPath = path.join(outputDir, 'latest.md');
  const logPath = path.join(outputDir, 'latest.log');

  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(csvPath, toCsv(summaryRows), 'utf8');
  fs.writeFileSync(mdPath, `${mdLines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(logPath, `${logLines.join('\n')}\n`, 'utf8');

  return { jsonPath, csvPath, mdPath, logPath };
}

async function main() {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 43110);
  const requests = Number(process.env.REQUESTS ?? 5000);
  const warmup = Number(process.env.WARMUP ?? 300);
  const concurrency = Number(process.env.CONCURRENCY ?? 32);
  const maxBodyBytes = Number(process.env.MAX_BODY_BYTES ?? 2 * 1024 * 1024);
  const outputDir = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'benchmark-results', 'e2e-web', 'latest');

  const logLines = [];
  const log = (line = '') => {
    console.log(line);
    logLines.push(line);
  };

  const metadata = {
    benchmarkName: process.env.BENCHMARK_NAME ?? 'E2E Web Interaction Benchmark (JSON vs Avro)',
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    host,
    port,
    requests,
    warmup,
    concurrency,
  };

  const server = await startServer({ port, host, maxBodyBytes });

  try {
    const baseUrl = `http://${host}:${port}`;

    const avroClient = new AvroClient({
      endpoint: baseUrl,
      autoInfer: false,
      schemas: {
        '/api/avro': REQUEST_SCHEMA,
        '/api/json': REQUEST_SCHEMA,
        '/api/ack': RESPONSE_SCHEMA,
      },
    });

    const rawFetch = globalThis.fetch.bind(globalThis);

    async function jsonRequest(index) {
      const payload = makePayload(index);
      const response = await rawFetch(`${baseUrl}/api/json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`JSON request failed with status ${response.status}`);
      }

      const body = await response.json();
      assert(body.ok === true, 'JSON response not ok');
      assert(body.id === payload.id, 'JSON response id mismatch');
    }

    async function avroRequest(index) {
      const payload = makePayload(index);
      const body = await avroClient.fetch('/api/avro', {
        method: 'POST',
        body: payload,
      });

      assert(body.ok === true, 'Avro response not ok');
      assert(body.id === payload.id, 'Avro response id mismatch');
    }

    log(`=== ${metadata.benchmarkName} ===`);
    log(`node         : ${process.version}`);
    log(`platform     : ${process.platform} ${process.arch}`);
    log(`server       : ${baseUrl}`);
    log(`requests     : ${requests.toLocaleString()} per mode`);
    log(`warmup       : ${warmup.toLocaleString()} per mode`);
    log(`concurrency  : ${concurrency}`);

    for (let i = 0; i < warmup; i++) {
      await jsonRequest(i);
      await avroRequest(i);
    }

    const results = [];

    for (const mode of ['json', 'avro']) {
      const before = snapshotCounters(server.counters);

      const { latencies, totalElapsed } = await runLoad({
        totalRequests: requests,
        concurrency,
        requester: mode === 'json' ? jsonRequest : avroRequest,
      });

      const after = snapshotCounters(server.counters);
      const bytes = diffCounters(after, before, mode);
      const summary = summarize(latencies);
      const throughput = (requests * 1000) / totalElapsed;

      results.push({
        mode,
        requests,
        concurrency,
        summary,
        throughput,
        bytes,
      });

      log('');
      log(`=== ${mode.toUpperCase()} ===`);
      log(`latency   median=${formatMs(summary.median)} p95=${formatMs(summary.p95)} p99=${formatMs(summary.p99)} avg=${formatMs(summary.mean)} stddev=${formatMs(summary.stddev)}`);
      log(`throughput: ${Math.round(throughput).toLocaleString()} req/s`);
      log(`bytes     req=${formatBytes(bytes.reqBytes)} (${(bytes.reqBytes / bytes.requests).toFixed(1)} avg)`);
      log(`          res=${formatBytes(bytes.resBytes)} (${(bytes.resBytes / bytes.requests).toFixed(1)} avg)`);
    }

    const jsonResult = results.find((r) => r.mode === 'json');
    const avroResult = results.find((r) => r.mode === 'avro');

    if (jsonResult && avroResult) {
      const latencyGain = ((jsonResult.summary.median - avroResult.summary.median) / jsonResult.summary.median) * 100;
      const throughputGain = ((avroResult.throughput - jsonResult.throughput) / jsonResult.throughput) * 100;
      const reqReduction = ((jsonResult.bytes.reqBytes / jsonResult.bytes.requests - avroResult.bytes.reqBytes / avroResult.bytes.requests) / (jsonResult.bytes.reqBytes / jsonResult.bytes.requests)) * 100;
      const resReduction = ((jsonResult.bytes.resBytes / jsonResult.bytes.requests - avroResult.bytes.resBytes / avroResult.bytes.requests) / (jsonResult.bytes.resBytes / jsonResult.bytes.requests)) * 100;

      log('');
      log('=== Delta (Avro vs JSON) ===');
      log(`median latency : ${latencyGain.toFixed(2)}% (${latencyGain >= 0 ? 'faster' : 'slower'})`);
      log(`throughput     : ${throughputGain.toFixed(2)}% (${throughputGain >= 0 ? 'higher' : 'lower'})`);
      log(`request bytes  : ${reqReduction.toFixed(2)}% smaller`);
      log(`response bytes : ${resReduction.toFixed(2)}% smaller`);
    }

    const artifacts = writeArtifacts({
      outputDir,
      metadata,
      results,
      logLines,
    });

    log('');
    log('=== Artifacts ===');
    log(`json    : ${artifacts.jsonPath}`);
    log(`csv     : ${artifacts.csvPath}`);
    log(`markdown: ${artifacts.mdPath}`);
    log(`log     : ${artifacts.logPath}`);

    fs.writeFileSync(artifacts.logPath, `${logLines.join('\n')}\n`, 'utf8');
  } finally {
    await server.close();
  }
}

await main();
