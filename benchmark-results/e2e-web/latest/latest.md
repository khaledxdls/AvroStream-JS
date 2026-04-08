# E2E Web Interaction Benchmark (JSON vs Avro)

- Generated: 2026-04-08T08:30:18.195Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43110
- Requests per mode: 1500
- Warmup requests: 150
- Concurrency: 24

| Mode | Median | p95 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|
| json | 7.70 ms | 19.55 ms | 2,257 req/s | 287.4 | 104.3 |
| avro | 8.49 ms | 18.92 ms | 2,508 req/s | 145.5 | 44.3 |

## Delta (Avro vs JSON)

- Median latency: -10.26% (slower)
- Throughput: 11.12% (higher)
- Request payload bytes: 49.38% smaller
- Response payload bytes: 57.55% smaller

This benchmark uses a real localhost HTTP server and real client requests (web-style interaction).
