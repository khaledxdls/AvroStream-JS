# WebSocket E2E Benchmark (JSON vs Avro)

- Generated: 2026-04-08T08:40:24.643Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43120
- Messages per mode: 1200
- Warmup messages: 120
- Concurrency: 32

| Mode | Median | p95 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|
| json | 1.34 ms | 5.88 ms | 14,934 msg/s | 179.5 | 78.0 |
| avro | 1.56 ms | 4.66 ms | 15,634 msg/s | 84.8 | 46.0 |

## Delta (Avro vs JSON)

- Median latency: -16.00% (slower)
- Throughput: 4.69% (higher)
- Request payload bytes: 52.78% smaller
- Response payload bytes: 41.03% smaller

This benchmark uses a real local WebSocket server and real socket messages.
