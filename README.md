# AvroStream JS

Transparent Avro binary transport layer for JavaScript. Drop-in `fetch` and WebSocket replacement that serializes JSON as compact Avro binary on the wire — **30-60% smaller payloads** with **zero DX friction**.

## Features

- **Transparent Fetch Wrapper** — pass plain objects, get plain objects back. Binary encoding happens under the hood.
- **Automatic Schema Inference** — no upfront schema definitions needed. Inferred, hashed, and cached automatically.
- **406 Schema Negotiation** — if the server loses its schema cache, the client retries with the full schema. Invisible to the caller.
- **WebSocket Support** — binary framing with message-type multiplexing over a single socket.
- **Streaming Decoder** — decode 100K+ record responses via `for await` without loading everything into RAM.
- **Offline Queue** — PWA-ready IndexedDB queue that flushes binary payloads when connectivity returns.
- **Debug Mode** — human-readable console output with exact byte-savings metrics.
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

## Wire Format

Every HTTP payload is framed as:

```
[8 bytes: CRC-64 schema fingerprint][N bytes: Avro binary data]
```

WebSocket frames add a message-type prefix:

```
[1 byte: type-length][N bytes: UTF-8 type string][8 bytes: fingerprint][data]
```

## License

MIT
