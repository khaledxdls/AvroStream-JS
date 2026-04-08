# WebSocket E2E Benchmark (JSON vs Avro)

- Generated: 2026-04-08T08:42:56.179Z
- Node: v24.14.0
- Platform: linux x64
- Endpoint host: 127.0.0.1:43120
- Messages per mode: 20000
- Warmup messages: 2000
- Concurrency: 128

| Mode | Median | p95 | Throughput | Avg Request Bytes | Avg Response Bytes |
|---|---:|---:|---:|---:|---:|
| json | 2.66 ms | 4.00 ms | 37,240 msg/s | 179.6 | 78.0 |
| avro | 3.50 ms | 6.40 ms | 30,221 msg/s | 84.8 | 46.0 |

## Delta (Avro vs JSON)

- Median latency: -31.75% (slower)
- Throughput: -18.85% (lower)
- Request payload bytes: 52.77% smaller
- Response payload bytes: 41.03% smaller

This benchmark uses a real local WebSocket server and real socket messages.
