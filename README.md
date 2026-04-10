# AvroStream JS

Transparent Avro binary transport layer for JavaScript. Drop-in `fetch` and WebSocket replacement that serializes JSON as compact Avro binary on the wire — **~50% smaller payloads** with **zero DX friction**.

## Features

- **Transparent Fetch Wrapper** — pass plain objects, get plain objects back. Binary encoding happens under the hood.
- **Automatic Schema Inference** — no upfront schema definitions needed. Inferred, hashed, and cached automatically.
- **406 Schema Negotiation** — if the server loses its schema cache, the client retries with the full schema. Invisible to the caller.
- **WebSocket Support** — binary framing with message-type multiplexing over a single socket; optional auto-reconnect with exponential backoff.
- **Streaming Decoder** — decode 100K+ record responses via `for await` without loading everything into RAM.
- **Offline Queue** — PWA-ready IndexedDB queue that flushes binary payloads when connectivity returns.
- **Debug Mode** — human-readable console output with exact byte-savings metrics.
- **Metrics Hook** — `onMetrics` callback for telemetry pipelines, fires on every encode/decode regardless of debug flag.
- **CLI Tool (`avro-gen`)** — pre-compile TypeScript interfaces into a schema manifest at build time.

## Install

```bash
npm install avrostream-js
```

## Quick Start

```ts
import { AvroClient } from 'avrostream-js';

const client = new AvroClient({
  endpoint: 'https://api.example.com',
  debug: true,
  autoInfer: true,
});

// Binary request — looks identical to using fetch with JSON
const user = await client.fetch('/users', {
  method: 'POST',
  body: { name: 'Alice', role: 'Admin' },
});

console.log(user); // { name: 'Alice', role: 'Admin' }
```

## Streaming Large Datasets

```ts
const stream = await client.streamFetch('/large-dataset');

for await (const record of stream) {
  process(record); // Memory stays flat — records decoded one by one
}
```

## WebSocket

```ts
const socket = client.connectSocket('wss://api.example.com');

socket.send('UpdateLocation', { lat: 34.05, lon: -118.24 });

socket.on('NewMessage', (msg) => {
  console.log(msg.text);
});
```

Auto-reconnect with exponential backoff:

```ts
const socket = client.connectSocket('wss://api.example.com', {
  reconnect: true,
  reconnectOptions: {
    maxAttempts: 10,      // -1 for infinite
    initialDelayMs: 500,
    maxDelayMs: 30_000,
    jitter: true,
  },
});
```

## Pre-compiled Schemas (CLI)

```bash
npx avro-gen --input src/types --output avro-manifest.json
```

```ts
import manifest from './avro-manifest.json';

const client = new AvroClient({
  endpoint: 'https://api.example.com',
  schemas: manifest,
});
```

## Configuration

| Option      | Type      | Default | Description                                       |
|-------------|-----------|---------|---------------------------------------------------|
| `endpoint`  | `string`  | —       | Base URL for HTTP requests                        |
| `debug`     | `boolean` | `false` | Log decoded payloads and byte-savings to console  |
| `autoInfer` | `boolean` | `true`  | Generate schemas from objects when not registered |
| `offline`   | `boolean` | `false` | Queue requests in IndexedDB when offline          |
| `schemas`   | `object`  | —       | Pre-compiled schema manifest                      |
| `fetch`     | `function`| —       | Custom fetch implementation (for tests/polyfills) |
| `inference` | `object`  | `{ maxDepth: 32, maxNodes: 50000 }` | Runtime inference guardrails for large payloads |
| `networkListener` | `NetworkListener` | env default | Inject custom online/offline detection strategy |
| `onMetrics` | `(m: DebugMetrics) => void` | — | Telemetry callback — fires on every encode/decode regardless of `debug` flag |

### Production Guidance

- For large/deep payloads, prefer precompiled schemas via `avro-gen` to bypass synchronous runtime inference.
- Browser and Node.js connectivity checks are abstracted behind `NetworkListener`; inject your own strategy for custom runtimes.

### Schema Pipeline Benchmark

Measures `inferSchema()`, `fingerprint()`, `avsc.Type.forSchema()`, and registry round-trip latency across flat and nested object shapes:

```bash
npm run bench:schema
```

Release-grade profile (more rounds):

```bash
npm run bench:schema:release
```

Controls:

- `ROUNDS` measured rounds (default `10`)
- `WARMUP_ROUNDS` warmup rounds (default `5`)
- `OUTPUT_DIR` artifacts path (default `benchmark-results/schema/latest`)

Artifacts:

- [benchmark-results/schema/latest/latest.log](benchmark-results/schema/latest/latest.log)
- [benchmark-results/schema/latest/latest.json](benchmark-results/schema/latest/latest.json)
- [benchmark-results/schema/latest/latest.csv](benchmark-results/schema/latest/latest.csv)
- [benchmark-results/schema/latest/latest.md](benchmark-results/schema/latest/latest.md)

### Stream Decoder Benchmark

Use the stream decoder micro-benchmark to compare parsing strategies:

```bash
npm run bench:stream
```

Optional tuning variables:

- `RECORD_COUNT` (default `100000`)
- `PAYLOAD_BYTES` (default `128`)
- `CHUNK_MIN` / `CHUNK_MAX` (defaults `256` / `4096`)
- `ITERATIONS` (default `7`)

### Avro vs JSON Benchmark

Run a deterministic, multi-scenario benchmark comparing Avro encode/decode against JSON stringify/parse:

```bash
npm run bench:avro-vs-json
```

For tighter memory stability (manual GC between scenarios):

```bash
npm run bench:avro-vs-json:gc
```

For release-grade validation (larger scenarios + more rounds):

```bash
npm run bench:avro-vs-json:release
```

Benchmark controls:

- `SCENARIOS` CSV record counts (default `5000,20000,50000`)
- `WARMUP_ROUNDS` (default `3`)
- `ROUNDS` measured rounds (default `8`)

Methodology notes:

- Uses a fixed schema and deterministic record generator (no random per-run shape drift).
- Reports median, p95, p99, stddev, throughput, and payload size reduction.
- Validates Avro and JSON roundtrip correctness on sampled records before reporting.

Latest full benchmark artifacts (generated by `npm run bench:avro-vs-json:gc`):

- Full console report: [benchmark-results/avro-vs-json/latest/latest.log](benchmark-results/avro-vs-json/latest/latest.log)
- Machine-readable JSON: [benchmark-results/avro-vs-json/latest/latest.json](benchmark-results/avro-vs-json/latest/latest.json)
- Spreadsheet-friendly CSV: [benchmark-results/avro-vs-json/latest/latest.csv](benchmark-results/avro-vs-json/latest/latest.csv)
- Markdown summary report: [benchmark-results/avro-vs-json/latest/latest.md](benchmark-results/avro-vs-json/latest/latest.md)

Release-profile artifacts (generated by `npm run bench:avro-vs-json:release`):

- Full console report: [benchmark-results/avro-vs-json/release/latest.log](benchmark-results/avro-vs-json/release/latest.log)
- Machine-readable JSON: [benchmark-results/avro-vs-json/release/latest.json](benchmark-results/avro-vs-json/release/latest.json)
- Spreadsheet-friendly CSV: [benchmark-results/avro-vs-json/release/latest.csv](benchmark-results/avro-vs-json/release/latest.csv)
- Markdown summary report: [benchmark-results/avro-vs-json/release/latest.md](benchmark-results/avro-vs-json/release/latest.md)

Current baseline summary:

| Records | Encode (Avro faster) | Decode (Avro faster) | Size Reduction |
|---:|---:|---:|---:|
| 5,000 | 37.20% | 8.55% | 59.54% |
| 20,000 | 56.16% | -17.39% | 59.54% |
| 50,000 | 70.59% | 25.39% | 59.54% |

These values are from the latest recorded run in this repository and are hardware/runtime dependent.

### Benchmark Interpretation

**Pure codec**: Avro encode is consistently 37-71% faster than `JSON.stringify` and produces ~60% smaller payloads. Decode is comparable to `JSON.parse` (sometimes faster at scale, sometimes slower on small batches due to GC variance).

**E2E (HTTP/WS)**: On localhost, Avro adds ~10-25% median latency vs JSON. This is expected — binary encode/decode is extra CPU work on both sides that doesn't pay for itself on a zero-latency link. The value shows up on real networks: **~50% smaller payloads** translate directly to lower transfer time on bandwidth-constrained paths (mobile, edge, inter-region).

When Avro wins:

- Bandwidth-constrained paths (mobile, edge, inter-region, metered connections).
- High-volume pipelines where ~50% smaller payloads compound into significant savings.
- Structured, repetitive records with high key-name overhead in JSON.
- Bulk/streaming workloads where codec speed dominates over per-request overhead.

When JSON is the better choice:

- Localhost or same-datacenter with sub-millisecond RTT where CPU overhead exceeds transfer savings.
- Systems requiring human-readable payloads in logs without tooling.
- Prototyping or low-volume APIs where schema management isn't worth it.

How to read benchmark outputs:

- `Throughput delta` > 0 means Avro handles more requests/messages per second.
- `Median latency delta` > 0 means Avro is faster; < 0 means Avro is slower (expected on localhost).
- `Payload bytes delta` shows bandwidth savings — Avro's primary value proposition.
- Use release profiles for publish decisions, not quick smoke runs.

Consolidated dashboard:

- [benchmark-results/benchmark-dashboard.md](benchmark-results/benchmark-dashboard.md)

Generate/update dashboard:

```bash
npm run bench:dashboard
```

### Real Client/Server E2E Benchmark

This benchmark runs a real local HTTP server and real client requests (web-style interaction) to compare JSON vs Avro end-to-end behavior, including serialization, transport framing, parsing, and latency.

```bash
npm run bench:e2e:web
```

Release-grade profile:

```bash
npm run bench:e2e:web:release
```

Controls:

- `REQUESTS` requests per mode (default `5000`)
- `WARMUP` warmup requests per mode (default `300`)
- `CONCURRENCY` concurrent in-flight requests (default `32`)
- `HOST` / `PORT` (defaults `127.0.0.1` / `43110`)
- `OUTPUT_DIR` artifacts path (default `benchmark-results/e2e-web/latest`)

Artifacts:

- [benchmark-results/e2e-web/latest/latest.log](benchmark-results/e2e-web/latest/latest.log)
- [benchmark-results/e2e-web/latest/latest.json](benchmark-results/e2e-web/latest/latest.json)
- [benchmark-results/e2e-web/latest/latest.csv](benchmark-results/e2e-web/latest/latest.csv)
- [benchmark-results/e2e-web/latest/latest.md](benchmark-results/e2e-web/latest/latest.md)

### WebSocket E2E Benchmark

This benchmark uses a real local WebSocket server and compares JSON string messages vs Avro-framed messages using `AvroSocket`.

```bash
npm run bench:e2e:ws
```

Release-grade profile:

```bash
npm run bench:e2e:ws:release
```

Controls:

- `REQUESTS` messages per mode (default `6000`)
- `WARMUP` warmup messages per mode (default `600`)
- `CONCURRENCY` in-flight messages (default `64`)
- `HOST` / `PORT` (defaults `127.0.0.1` / `43120`)
- `OUTPUT_DIR` artifacts path (default `benchmark-results/e2e-ws/latest`)

Artifacts:

- [benchmark-results/e2e-ws/latest/latest.log](benchmark-results/e2e-ws/latest/latest.log)
- [benchmark-results/e2e-ws/latest/latest.json](benchmark-results/e2e-ws/latest/latest.json)
- [benchmark-results/e2e-ws/latest/latest.csv](benchmark-results/e2e-ws/latest/latest.csv)
- [benchmark-results/e2e-ws/latest/latest.md](benchmark-results/e2e-ws/latest/latest.md)

Release artifacts:

- [benchmark-results/e2e-ws/release/latest.log](benchmark-results/e2e-ws/release/latest.log)
- [benchmark-results/e2e-ws/release/latest.json](benchmark-results/e2e-ws/release/latest.json)
- [benchmark-results/e2e-ws/release/latest.csv](benchmark-results/e2e-ws/release/latest.csv)
- [benchmark-results/e2e-ws/release/latest.md](benchmark-results/e2e-ws/release/latest.md)

Latest baseline (`REQUESTS=6000`, `WARMUP=600`, `CONCURRENCY=64`):

| Metric | Result |
|---|---:|
| Throughput delta (Avro vs JSON) | -9.55% |
| Median latency delta (Avro vs JSON) | -24.27% |
| Request payload bytes delta | **-52.21%** |
| Response payload bytes delta | **-39.74%** |

### Server-to-Server Benchmark

This profile measures Node service-to-service HTTP interaction (JSON vs Avro) using the same real request path but with higher default throughput settings.

```bash
npm run bench:s2s
```

Release-grade profile:

```bash
npm run bench:s2s:release
```

Artifacts:

- [benchmark-results/s2s/latest/latest.log](benchmark-results/s2s/latest/latest.log)
- [benchmark-results/s2s/latest/latest.json](benchmark-results/s2s/latest/latest.json)
- [benchmark-results/s2s/latest/latest.csv](benchmark-results/s2s/latest/latest.csv)
- [benchmark-results/s2s/latest/latest.md](benchmark-results/s2s/latest/latest.md)

Release artifacts:

- [benchmark-results/s2s/release/latest.log](benchmark-results/s2s/release/latest.log)
- [benchmark-results/s2s/release/latest.json](benchmark-results/s2s/release/latest.json)
- [benchmark-results/s2s/release/latest.csv](benchmark-results/s2s/release/latest.csv)
- [benchmark-results/s2s/release/latest.md](benchmark-results/s2s/release/latest.md)

Latest baseline (`REQUESTS=5000`, `WARMUP=300`, `CONCURRENCY=32`):

| Metric | Result |
|---|---:|
| Throughput delta (Avro vs JSON) | -11.65% |
| Median latency delta (Avro vs JSON) | -16.01% |
| Request payload bytes delta | **-49.03%** |
| Response payload bytes delta | **-56.59%** |

## Error Handling

All errors extend `AvroStreamError`:

```ts
import {
  AvroCircularReferenceError,
  SchemaValidationError,
  SchemaNotFoundError,
  SchemaNegotiationError,
  CodecError,
  InferenceError,
} from 'avrostream-js';
```

## Wire Format (v0.1)

Every HTTP payload is framed as:

```
[1 byte: version (0x01)][8 bytes: CRC-64 schema fingerprint][N bytes: Avro binary data]
```

On a 406 schema-negotiation retry, the client sends the full schema inline:

```
[1 byte: version (0x02)][4 bytes: schema JSON length][schema JSON][8 bytes: fingerprint][data]
```

WebSocket frames add a message-type prefix:

```
[1 byte: version (0x01)][1 byte: type-length][N bytes: UTF-8 type string][8 bytes: fingerprint][data]
```

Streaming responses use a header + chunked record format:

```
Header:  [1 byte: version (0x01)][8 bytes: fingerprint]
Records: [4 bytes: record length (big-endian)][N bytes: Avro data] ... repeating
```

The leading version byte reserves space for future wire-format evolution without a breaking change. `parseWireFrame` rejects unknown versions and enforces that schema-inline frames (`0x02`) are only handled by the transport layer.

## License

MIT
