# Avro vs JSON Benchmark Report

- Generated: 2026-04-08T08:17:03.824Z
- Node: v24.14.0
- Platform: linux x64
- Warmup rounds: 1
- Measured rounds: 2
- Scenarios: 5000, 20000, 50000

| Records | Avro Encode (ms) | JSON Encode (ms) | Avro Decode (ms) | JSON Decode (ms) | Size Reduction | Encode Faster | Decode Faster |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5,000 | 8.21 | 11.23 | 6.54 | 7.31 | 59.54% | 26.92% | 10.57% |
| 20,000 | 22.93 | 40.10 | 26.95 | 29.30 | 59.54% | 42.82% | 8.02% |
| 50,000 | 55.82 | 99.50 | 60.17 | 74.92 | 59.54% | 43.89% | 19.69% |

Positive `Encode Faster` / `Decode Faster` means Avro is faster than JSON for that metric.

