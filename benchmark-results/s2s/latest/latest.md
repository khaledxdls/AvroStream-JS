# Server-to-Server HTTP Benchmark (JSON vs Avro)

- Generated: 2026-04-08T08:41:06.126Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43110
- Requests per mode: 4000
- Warmup requests: 400
- Concurrency: 64

| Mode | Median | p95 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|
| json | 15.99 ms | 31.57 ms | 2,956 req/s | 287.4 | 104.3 |
| avro | 16.31 ms | 28.09 ms | 3,445 req/s | 145.5 | 44.3 |

## Delta (Avro vs JSON)

- Median latency: -2.05% (slower)
- Throughput: 16.52% (higher)
- Request payload bytes: 49.37% smaller
- Response payload bytes: 57.55% smaller

This benchmark uses a real localhost HTTP server and real client requests (web-style interaction).
