# Avro vs JSON Benchmark Report

- Generated: 2026-04-08T08:16:02.667Z
- Node: v24.14.0
- Platform: linux x64
- Warmup rounds: 1
- Measured rounds: 2
- Scenarios: 1000

| Records | Avro Encode (ms) | JSON Encode (ms) | Avro Decode (ms) | JSON Decode (ms) | Size Reduction | Encode Faster | Decode Faster |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 1.70 | 1.92 | 2.63 | 1.50 | 59.54% | 11.69% | -74.68% |

Positive `Encode Faster` / `Decode Faster` means Avro is faster than JSON for that metric.

