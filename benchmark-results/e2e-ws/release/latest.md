# WebSocket E2E Benchmark (JSON vs Avro)

- Generated: 2026-04-10T07:20:24.164Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43120
- Messages per mode: 20000
- Warmup messages: 2000
- Concurrency: 128

| Mode | Median | p95 | p99 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|---:|
| json | 6.25 ms | 25.65 ms | 109.08 ms | 11,448 msg/s | 179.6 | 78.0 |
| avro | 5.27 ms | 15.53 ms | 39.51 ms | 17,677 msg/s | 85.8 | 47.0 |

## Delta (Avro vs JSON)

- Median latency: 15.68% (faster)
- Throughput: 54.41% (higher)
- Request payload bytes: 52.21% smaller
- Response payload bytes: 39.74% smaller

This benchmark uses a real local WebSocket server and real socket messages.
