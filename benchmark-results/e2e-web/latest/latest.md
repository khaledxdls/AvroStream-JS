# E2E Web Interaction Benchmark (JSON vs Avro)

- Generated: 2026-04-10T05:51:14.745Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43110
- Requests per mode: 5000
- Warmup requests: 300
- Concurrency: 32

| Mode | Median | p95 | p99 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|---:|
| json | 9.83 ms | 26.66 ms | 45.33 ms | 2,462 req/s | 287.4 | 104.3 |
| avro | 11.41 ms | 36.27 ms | 58.33 ms | 2,175 req/s | 146.5 | 45.3 |

## Delta (Avro vs JSON)

- Median latency: -16.01% (slower)
- Throughput: -11.65% (lower)
- Request payload bytes: 49.03% smaller
- Response payload bytes: 56.59% smaller

This benchmark uses a real localhost HTTP server and real client requests (web-style interaction).
