# Avro vs JSON Benchmark Report

- Generated: 2026-04-10T06:30:34.536Z
- Node: v24.14.0
- Platform: linux x64
- Warmup rounds: 3
- Measured rounds: 8
- Scenarios: 5000, 20000, 50000

| Records | Avro Encode (ms) | Avro Enc p99 | JSON Encode (ms) | JSON Enc p99 | Avro Decode (ms) | Avro Dec p99 | JSON Decode (ms) | JSON Dec p99 | Size Reduction | Encode Faster | Decode Faster |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5,000 | 7.99 | 9.67 | 10.37 | 13.02 | 6.25 | 18.36 | 7.73 | 10.15 | 59.54% | 22.96% | 19.17% |
| 20,000 | 32.13 | 52.73 | 42.74 | 103.65 | 35.29 | 63.52 | 49.34 | 73.10 | 59.54% | 24.82% | 28.48% |
| 50,000 | 59.62 | 306.20 | 143.58 | 191.36 | 62.60 | 70.41 | 76.12 | 81.96 | 59.54% | 58.47% | 17.77% |

Positive `Encode Faster` / `Decode Faster` means Avro is faster than JSON for that metric.

