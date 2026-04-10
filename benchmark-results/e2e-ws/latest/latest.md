# WebSocket E2E Benchmark (JSON vs Avro)

- Generated: 2026-04-10T06:30:52.365Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43120
- Messages per mode: 6000
- Warmup messages: 600
- Concurrency: 64

| Mode | Median | p95 | p99 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|---:|
| json | 1.93 ms | 5.11 ms | 31.53 ms | 18,026 msg/s | 179.6 | 78.0 |
| avro | 2.06 ms | 5.10 ms | 27.37 ms | 20,923 msg/s | 85.8 | 47.0 |

## Delta (Avro vs JSON)

- Median latency: -6.48% (slower)
- Throughput: 16.08% (higher)
- Request payload bytes: 52.21% smaller
- Response payload bytes: 39.74% smaller

This benchmark uses a real local WebSocket server and real socket messages.
