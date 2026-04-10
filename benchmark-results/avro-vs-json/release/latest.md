# Avro vs JSON Benchmark Report

- Generated: 2026-04-10T07:19:07.512Z
- Node: v24.14.0
- Platform: linux x64
- Warmup rounds: 3
- Measured rounds: 10
- Scenarios: 20000, 50000, 100000

| Records | Avro Encode (ms) | Avro Enc p99 | JSON Encode (ms) | JSON Enc p99 | Avro Decode (ms) | Avro Dec p99 | JSON Decode (ms) | JSON Dec p99 | Size Reduction | Encode Faster | Decode Faster |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 20,000 | 79.00 | 209.58 | 62.78 | 114.92 | 27.59 | 46.32 | 33.90 | 51.23 | 59.54% | -25.83% | 18.63% |
| 50,000 | 124.23 | 313.33 | 258.12 | 388.15 | 106.71 | 451.61 | 83.40 | 110.64 | 59.54% | 51.87% | -27.96% |
| 100,000 | 235.54 | 911.13 | 539.80 | 1240.68 | 258.21 | 552.84 | 169.35 | 346.35 | 59.54% | 56.36% | -52.47% |

Positive `Encode Faster` / `Decode Faster` means Avro is faster than JSON for that metric.

