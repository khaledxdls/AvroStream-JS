# Server-to-Server HTTP Benchmark (JSON vs Avro)

- Generated: 2026-04-08T08:44:47.526Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43110
- Requests per mode: 12000
- Warmup requests: 1200
- Concurrency: 96

| Mode | Median | p95 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|
| json | 22.47 ms | 49.31 ms | 3,488 req/s | 287.4 | 104.3 |
| avro | 23.74 ms | 42.66 ms | 3,543 req/s | 145.5 | 44.3 |

## Delta (Avro vs JSON)

- Median latency: -5.66% (slower)
- Throughput: 1.56% (higher)
- Request payload bytes: 49.37% smaller
- Response payload bytes: 57.55% smaller

This benchmark uses a real localhost HTTP server and real client requests (web-style interaction).
