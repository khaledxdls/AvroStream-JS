import http from 'node:http';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import avsc from 'avsc';
import { WebSocketServer } from 'ws';

const { AvroClient, fingerprint } = await import('../dist/index.js');

const REQUEST_SCHEMA = {
  type: 'record',
  name: 'WsBenchEvent',
  namespace: 'benchmark.ws',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'service', type: 'string' },
    { name: 'op', type: 'string' },
    { name: 'ts', type: 'long' },
    {
      name: 'metrics',
      type: {
        type: 'record',
        name: 'WsBenchMetrics',
        fields: [
          { name: 'latencyBudgetMs', type: 'int' },
          { name: 'payloadBytes', type: 'int' },
          { name: 'attempt', type: 'int' },
        ],
      },
    },
    { name: 'tags', type: { type: 'array', items: 'string' } },
  ],
};

const RESPONSE_SCHEMA = {
  type: 'record',
  name: 'WsBenchAck',
  namespace: 'benchmark.ws',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'ok', type: 'boolean' },
    { name: 'receivedAt', type: 'long' },
    { name: 'server', type: 'string' },
  ],
};

function percentile(sorted, p) {
  const n = sorted.length;
  const idx = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return sorted[idx];
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

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function frameAvroMessage(messageType, fp, dataBytes) {
  const typeBytes = new TextEncoder().encode(messageType);
  const out = new Uint8Array(1 + typeBytes.length + 8 + dataBytes.length);
  out[0] = typeBytes.length;
  out.set(typeBytes, 1);
  out.set(fp, 1 + typeBytes.length);
  out.set(dataBytes, 1 + typeBytes.length + 8);
  return out;
}

function parseAvroMessage(bytes) {
  if (bytes.length < 10) {
    throw new Error(`invalid ws avro frame (length=${bytes.length})`);
  }

  const typeLen = bytes[0];
  const typeStart = 1;
  const typeEnd = typeStart + typeLen;
  const fpStart = typeEnd;
  const fpEnd = fpStart + 8;

  if (bytes.length < fpEnd) {
    throw new Error('invalid ws avro frame boundaries');
  }

  const messageType = new TextDecoder().decode(bytes.slice(typeStart, typeEnd));
  const fingerprintBytes = bytes.slice(fpStart, fpEnd);
  const payload = bytes.slice(fpEnd);

  return {
    messageType,
    fingerprintBytes,
    payload,
  };
}

function makePayload(index) {
  return {
    id: `msg_${index.toString(36).padStart(8, '0')}`,
    service: ['gateway', 'catalog', 'orders', 'billing'][index % 4],
    op: ['upsert', 'query', 'delete', 'merge'][index % 4],
    ts: Date.now() + index,
    metrics: {
      latencyBudgetMs: (index % 200) + 5,
      payloadBytes: ((index * 131) % 60000) + 256,
      attempt: (index % 3) + 1,
    },
    tags: [`stage_${index % 3}`, `region_${index % 4}`, `trace_${index % 9}`],
  };
}

async function startWsServer({ host, port }) {
  const requestType = avsc.Type.forSchema(REQUEST_SCHEMA);
  const responseType = avsc.Type.forSchema(RESPONSE_SCHEMA);

  const reqFp = fingerprint(REQUEST_SCHEMA);
  const resFp = fingerprint(RESPONSE_SCHEMA);
  const reqFpHex = Buffer.from(reqFp).toString('hex');

  const counters = {
    json: { reqBytes: 0, resBytes: 0, messages: 0 },
    avro: { reqBytes: 0, resBytes: 0, messages: 0 },
  };

  const server = http.createServer();
  const jsonWss = new WebSocketServer({ noServer: true });
  const avroWss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${host}:${port}`);

    if (url.pathname === '/json') {
      jsonWss.handleUpgrade(req, socket, head, (ws) => {
        jsonWss.emit('connection', ws, req);
      });
      return;
    }

    if (url.pathname === '/avro') {
      avroWss.handleUpgrade(req, socket, head, (ws) => {
        avroWss.emit('connection', ws, req);
      });
      return;
    }

    socket.destroy();
  });

  jsonWss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const text = raw.toString();
      counters.json.reqBytes += Buffer.byteLength(text);
      counters.json.messages += 1;

      const parsed = JSON.parse(text);
      const ack = {
        id: parsed.id,
        ok: true,
        receivedAt: Date.now(),
        server: process.version,
      };

      const response = JSON.stringify(ack);
      counters.json.resBytes += Buffer.byteLength(response);
      ws.send(response);
    });
  });

  avroWss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const buf = raw instanceof Buffer ? raw : Buffer.from(raw);
      const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

      counters.avro.reqBytes += bytes.length;
      counters.avro.messages += 1;

      const decoded = parseAvroMessage(bytes);
      const fpHex = Buffer.from(decoded.fingerprintBytes).toString('hex');
      if (fpHex !== reqFpHex || decoded.messageType !== 'BenchEvent') {
        ws.close(1003, 'unsupported frame');
        return;
      }

      const request = requestType.fromBuffer(Buffer.from(decoded.payload));
      const ackObj = {
        id: request.id,
        ok: true,
        receivedAt: Date.now(),
        server: process.version,
      };

      const ackData = responseType.toBuffer(ackObj);
      const frame = frameAvroMessage(
        'BenchAck',
        resFp,
        new Uint8Array(ackData.buffer, ackData.byteOffset, ackData.byteLength),
      );

      counters.avro.resBytes += frame.length;
      ws.send(frame);
    });
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
        jsonWss.clients.forEach((c) => c.terminate());
        avroWss.clients.forEach((c) => c.terminate());
        jsonWss.close();
        avroWss.close();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function snapshot(counters) {
  return {
    json: { ...counters.json },
    avro: { ...counters.avro },
  };
}

function diff(after, before, mode) {
  return {
    reqBytes: after[mode].reqBytes - before[mode].reqBytes,
    resBytes: after[mode].resBytes - before[mode].resBytes,
    messages: after[mode].messages - before[mode].messages,
  };
}

async function runJsonClient({ wsUrl, requests, concurrency, warmup }) {
  const ws = new WebSocket(wsUrl);
  const starts = new Map();
  const latencies = new Array(requests);

  let next = 0;
  let completed = 0;
  let open = false;
  let timeoutId;

  const donePromise = new Promise((resolve, reject) => {
    ws.addEventListener('error', () => reject(new Error('json websocket error')));

    ws.addEventListener('open', () => {
      open = true;

      for (let i = 0; i < warmup; i++) {
        ws.send(JSON.stringify(makePayload(i)));
      }

      for (let i = 0; i < Math.min(concurrency, requests); i++) {
        issue();
      }
    });

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      const startedAt = starts.get(msg.id);
      if (startedAt !== undefined) {
        starts.delete(msg.id);
        const idx = Number.parseInt(msg.id.slice(4), 36);
        latencies[idx] = performance.now() - startedAt;
        completed++;

        if (next < requests) {
          issue();
        }

        if (completed >= requests) {
          resolve();
        }
      }
    });

    timeoutId = setTimeout(() => {
      reject(new Error('json websocket benchmark timeout'));
    }, 180_000);
  });

  function issue() {
    const idx = next;
    next++;
    const payload = makePayload(idx);
    starts.set(payload.id, performance.now());
    ws.send(JSON.stringify(payload));
  }

  const start = performance.now();
  await donePromise;
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  const totalElapsed = performance.now() - start;

  if (open) {
    ws.close();
  }

  return { latencies, totalElapsed };
}

async function runAvroClient({ wsUrl, requests, concurrency, warmup }) {
  const client = new AvroClient({ endpoint: 'http://127.0.0.1', autoInfer: false });
  client.registerSchema(REQUEST_SCHEMA, 'ws:BenchEvent');
  client.registerSchema(RESPONSE_SCHEMA, 'ws:BenchAck');

  const socket = client.connectSocket(wsUrl);
  const starts = new Map();
  const latencies = new Array(requests);

  let next = 0;
  let completed = 0;
  let timeoutId;

  const donePromise = new Promise((resolve, reject) => {
    socket.on('error', (err) => reject(err));

    socket.on('open', () => {
      for (let i = 0; i < warmup; i++) {
        socket.send('BenchEvent', makePayload(i));
      }

      for (let i = 0; i < Math.min(concurrency, requests); i++) {
        issue();
      }
    });

    socket.on('BenchAck', (msg) => {
      const id = String(msg.id);
      const startedAt = starts.get(id);

      if (startedAt !== undefined) {
        starts.delete(id);
        const idx = Number.parseInt(id.slice(4), 36);
        latencies[idx] = performance.now() - startedAt;
        completed++;

        if (next < requests) {
          issue();
        }

        if (completed >= requests) {
          resolve();
        }
      }
    });

    timeoutId = setTimeout(() => {
      reject(new Error('avro websocket benchmark timeout'));
    }, 180_000);
  });

  function issue() {
    const idx = next;
    next++;
    const payload = makePayload(idx);
    starts.set(payload.id, performance.now());
    socket.send('BenchEvent', payload);
  }

  const start = performance.now();
  await donePromise;
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  const totalElapsed = performance.now() - start;

  socket.close();
  client.destroy();

  return { latencies, totalElapsed };
}

function writeArtifacts({ outputDir, metadata, results, logLines }) {
  fs.mkdirSync(outputDir, { recursive: true });

  const summaryRows = results.map((r) => ({
    mode: r.mode,
    messages: r.messages,
    concurrency: r.concurrency,
    median_ms: r.summary.median,
    p95_ms: r.summary.p95,
    throughput_msg_s: r.throughput,
    req_bytes_total: r.bytes.reqBytes,
    res_bytes_total: r.bytes.resBytes,
    avg_req_bytes: r.bytes.reqBytes / r.bytes.messages,
    avg_res_bytes: r.bytes.resBytes / r.bytes.messages,
  }));

  const payload = { metadata, summary: summaryRows, results };

  const md = [];
  md.push('# WebSocket E2E Benchmark (JSON vs Avro)');
  md.push('');
  md.push(`- Generated: ${metadata.generatedAt}`);
  md.push(`- Node: ${metadata.node}`);
  md.push(`- Platform: ${metadata.platform}`);
  md.push(`- Endpoint host: ${metadata.host}:${metadata.port}`);
  md.push(`- Messages per mode: ${metadata.requests}`);
  md.push(`- Warmup messages: ${metadata.warmup}`);
  md.push(`- Concurrency: ${metadata.concurrency}`);
  md.push('');
  md.push('| Mode | Median | p95 | Throughput | Avg Request Bytes | Avg Response Bytes |');
  md.push('|---|---:|---:|---:|---:|---:|');

  for (const row of summaryRows) {
    md.push(
      `| ${row.mode} | ${row.median_ms.toFixed(2)} ms | ${row.p95_ms.toFixed(2)} ms | ${Math.round(row.throughput_msg_s).toLocaleString()} msg/s | ${row.avg_req_bytes.toFixed(1)} | ${row.avg_res_bytes.toFixed(1)} |`,
    );
  }

  const json = summaryRows.find((x) => x.mode === 'json');
  const avro = summaryRows.find((x) => x.mode === 'avro');
  if (json && avro) {
    const latencyGain = ((json.median_ms - avro.median_ms) / json.median_ms) * 100;
    const throughputGain = ((avro.throughput_msg_s - json.throughput_msg_s) / json.throughput_msg_s) * 100;
    const reqReduction = ((json.avg_req_bytes - avro.avg_req_bytes) / json.avg_req_bytes) * 100;
    const resReduction = ((json.avg_res_bytes - avro.avg_res_bytes) / json.avg_res_bytes) * 100;

    md.push('');
    md.push('## Delta (Avro vs JSON)');
    md.push('');
    md.push(`- Median latency: ${latencyGain.toFixed(2)}% (${latencyGain >= 0 ? 'faster' : 'slower'})`);
    md.push(`- Throughput: ${throughputGain.toFixed(2)}% (${throughputGain >= 0 ? 'higher' : 'lower'})`);
    md.push(`- Request payload bytes: ${reqReduction.toFixed(2)}% smaller`);
    md.push(`- Response payload bytes: ${resReduction.toFixed(2)}% smaller`);
  }

  md.push('');
  md.push('This benchmark uses a real local WebSocket server and real socket messages.');

  const jsonPath = path.join(outputDir, 'latest.json');
  const csvPath = path.join(outputDir, 'latest.csv');
  const mdPath = path.join(outputDir, 'latest.md');
  const logPath = path.join(outputDir, 'latest.log');

  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(csvPath, toCsv(summaryRows), 'utf8');
  fs.writeFileSync(mdPath, `${md.join('\n')}\n`, 'utf8');
  fs.writeFileSync(logPath, `${logLines.join('\n')}\n`, 'utf8');

  return { jsonPath, csvPath, mdPath, logPath };
}

async function main() {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 43120);
  const requests = Number(process.env.REQUESTS ?? 6000);
  const warmup = Number(process.env.WARMUP ?? 600);
  const concurrency = Number(process.env.CONCURRENCY ?? 64);
  const outputDir = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'benchmark-results', 'e2e-ws', 'latest');

  const logLines = [];
  const log = (line = '') => {
    console.log(line);
    logLines.push(line);
  };

  const metadata = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    host,
    port,
    requests,
    warmup,
    concurrency,
  };

  const runtime = await startWsServer({ host, port });

  try {
    log('=== WebSocket E2E Benchmark (JSON vs Avro) ===');
    log(`node         : ${process.version}`);
    log(`platform     : ${process.platform} ${process.arch}`);
    log(`server       : ws://${host}:${port}`);
    log(`messages     : ${requests.toLocaleString()} per mode`);
    log(`warmup       : ${warmup.toLocaleString()} per mode`);
    log(`concurrency  : ${concurrency}`);

    const results = [];

    for (const mode of ['json', 'avro']) {
      const before = snapshot(runtime.counters);

      const runResult =
        mode === 'json'
          ? await runJsonClient({
              wsUrl: `ws://${host}:${port}/json`,
              requests,
              concurrency,
              warmup,
            })
          : await runAvroClient({
              wsUrl: `ws://${host}:${port}/avro`,
              requests,
              concurrency,
              warmup,
            });

      const after = snapshot(runtime.counters);
      const bytes = diff(after, before, mode);
      const summary = summarize(runResult.latencies);
      const throughput = (requests * 1000) / runResult.totalElapsed;

      results.push({
        mode,
        messages: requests,
        concurrency,
        summary,
        throughput,
        bytes,
      });

      log('');
      log(`=== ${mode.toUpperCase()} ===`);
      log(`latency   median=${formatMs(summary.median)} p95=${formatMs(summary.p95)} avg=${formatMs(summary.mean)} stddev=${formatMs(summary.stddev)}`);
      log(`throughput: ${Math.round(throughput).toLocaleString()} msg/s`);
      log(`bytes     req=${formatBytes(bytes.reqBytes)} (${(bytes.reqBytes / bytes.messages).toFixed(1)} avg)`);
      log(`          res=${formatBytes(bytes.resBytes)} (${(bytes.resBytes / bytes.messages).toFixed(1)} avg)`);
    }

    const jsonResult = results.find((r) => r.mode === 'json');
    const avroResult = results.find((r) => r.mode === 'avro');

    if (jsonResult && avroResult) {
      const latencyGain = ((jsonResult.summary.median - avroResult.summary.median) / jsonResult.summary.median) * 100;
      const throughputGain = ((avroResult.throughput - jsonResult.throughput) / jsonResult.throughput) * 100;
      const reqReduction = ((jsonResult.bytes.reqBytes / jsonResult.bytes.messages - avroResult.bytes.reqBytes / avroResult.bytes.messages) / (jsonResult.bytes.reqBytes / jsonResult.bytes.messages)) * 100;
      const resReduction = ((jsonResult.bytes.resBytes / jsonResult.bytes.messages - avroResult.bytes.resBytes / avroResult.bytes.messages) / (jsonResult.bytes.resBytes / jsonResult.bytes.messages)) * 100;

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
    await runtime.close();
  }
}

await main();
