# E2E Web Interaction Benchmark (JSON vs Avro)

- Generated: 2026-04-10T06:31:02.633Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43110
- Requests per mode: 5000
- Warmup requests: 300
- Concurrency: 32

| Mode | Median | p95 | p99 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|---:|
| json | 14.82 ms | 59.79 ms | 96.24 ms | 1,572 req/s | 287.4 | 104.3 |
| avro | 11.46 ms | 33.79 ms | 48.88 ms | 2,304 req/s | 146.5 | 45.3 |

## Delta (Avro vs JSON)

- Median latency: 22.66% (faster)
- Throughput: 46.58% (higher)
- Request payload bytes: 49.03% smaller
- Response payload bytes: 56.59% smaller

This benchmark uses a real localhost HTTP server and real client requests (web-style interaction).
