# E2E Web Interaction Benchmark (JSON vs Avro)

- Generated: 2026-04-09T10:19:43.792Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43110
- Requests per mode: 3000
- Warmup requests: 300
- Concurrency: 24

| Mode | Median | p95 | p99 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|---:|
| json | 15.78 ms | 80.72 ms | 134.29 ms | 936 req/s | 287.4 | 104.3 |
| avro | 8.97 ms | 24.96 ms | 36.50 ms | 2,292 req/s | 146.5 | 45.3 |

## Delta (Avro vs JSON)

- Median latency: 43.15% (faster)
- Throughput: 144.81% (higher)
- Request payload bytes: 49.03% smaller
- Response payload bytes: 56.59% smaller

This benchmark uses a real localhost HTTP server and real client requests (web-style interaction).
