# WebSocket E2E Benchmark (JSON vs Avro)

- Generated: 2026-04-10T05:51:05.966Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43120
- Messages per mode: 6000
- Warmup messages: 600
- Concurrency: 64

| Mode | Median | p95 | p99 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|---:|
| json | 1.62 ms | 3.43 ms | 18.82 ms | 26,780 msg/s | 179.6 | 78.0 |
| avro | 2.01 ms | 4.10 ms | 16.13 ms | 24,224 msg/s | 85.8 | 47.0 |

## Delta (Avro vs JSON)

- Median latency: -24.27% (slower)
- Throughput: -9.55% (lower)
- Request payload bytes: 52.21% smaller
- Response payload bytes: 39.74% smaller

This benchmark uses a real local WebSocket server and real socket messages.
