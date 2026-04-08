# Avro vs JSON Benchmark Report

- Generated: 2026-04-08T08:21:02.367Z
- Node: v24.14.0
- Platform: linux x64
- Warmup rounds: 3
- Measured rounds: 10
- Scenarios: 20000, 50000, 100000

| Records | Avro Encode (ms) | JSON Encode (ms) | Avro Decode (ms) | JSON Decode (ms) | Size Reduction | Encode Faster | Decode Faster |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 20,000 | 26.42 | 38.22 | 23.56 | 28.22 | 59.54% | 30.86% | 16.53% |
| 50,000 | 58.76 | 101.36 | 58.89 | 70.60 | 59.54% | 42.03% | 16.59% |
| 100,000 | 123.88 | 254.58 | 117.83 | 140.77 | 59.54% | 51.34% | 16.29% |

Positive `Encode Faster` / `Decode Faster` means Avro is faster than JSON for that metric.

