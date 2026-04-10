# Avro vs JSON Benchmark Report

- Generated: 2026-04-10T05:51:29.158Z
- Node: v24.14.0
- Platform: linux x64
- Warmup rounds: 3
- Measured rounds: 8
- Scenarios: 5000, 20000, 50000

| Records | Avro Encode (ms) | Avro Enc p99 | JSON Encode (ms) | JSON Enc p99 | Avro Decode (ms) | Avro Dec p99 | JSON Decode (ms) | JSON Dec p99 | Size Reduction | Encode Faster | Decode Faster |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5,000 | 7.06 | 19.59 | 11.25 | 17.68 | 6.64 | 10.57 | 7.26 | 8.81 | 59.54% | 37.20% | 8.55% |
| 20,000 | 34.31 | 64.96 | 78.25 | 118.06 | 37.33 | 107.41 | 31.80 | 34.77 | 59.54% | 56.16% | -17.39% |
| 50,000 | 59.27 | 101.50 | 201.54 | 335.64 | 70.56 | 78.02 | 94.57 | 155.14 | 59.54% | 70.59% | 25.39% |

Positive `Encode Faster` / `Decode Faster` means Avro is faster than JSON for that metric.

