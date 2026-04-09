# WebSocket E2E Benchmark (JSON vs Avro)

- Generated: 2026-04-09T10:18:51.132Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43120
- Messages per mode: 20000
- Warmup messages: 2000
- Concurrency: 128

| Mode | Median | p95 | p99 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|---:|
| json | 8.01 ms | 37.01 ms | 112.28 ms | 7,806 msg/s | 179.6 | 78.0 |
| avro | 7.32 ms | 23.52 ms | 76.98 ms | 10,645 msg/s | 85.8 | 47.0 |

## Delta (Avro vs JSON)

- Median latency: 8.56% (faster)
- Throughput: 36.36% (higher)
- Request payload bytes: 52.21% smaller
- Response payload bytes: 39.74% smaller

This benchmark uses a real local WebSocket server and real socket messages.
