# E2E Web Interaction Benchmark (JSON vs Avro)

- Generated: 2026-04-10T07:21:22.594Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43110
- Requests per mode: 10000
- Warmup requests: 1000
- Concurrency: 48

| Mode | Median | p95 | p99 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|---:|
| json | 32.31 ms | 153.17 ms | 232.08 ms | 885 req/s | 287.4 | 104.3 |
| avro | 23.71 ms | 133.10 ms | 260.14 ms | 1,208 req/s | 146.5 | 45.3 |

## Delta (Avro vs JSON)

- Median latency: 26.60% (faster)
- Throughput: 36.46% (higher)
- Request payload bytes: 49.03% smaller
- Response payload bytes: 56.59% smaller

This benchmark uses a real localhost HTTP server and real client requests (web-style interaction).
