# Schema Pipeline Benchmark

- Generated: 2026-04-10T05:51:44.214Z
- Node: v24.14.0
- Platform: linux x64
- Warmup rounds: 5
- Measured rounds: 10

| Benchmark | Median | p95 | p99 | Ops/sec |
|---|---:|---:|---:|---:|
| inferSchema(flat-10) | 5.1 µs | 22.9 µs | 22.9 µs | 196.9 K ops/s |
| inferSchema(flat-50) | 34.8 µs | 125.3 µs | 125.3 µs | 28.7 K ops/s |
| inferSchema(nested-3-deep) | 14.6 µs | 22.4 µs | 22.4 µs | 68.7 K ops/s |
| inferSchema(nested-5-deep) | 12.8 µs | 17.4 µs | 17.4 µs | 78.4 K ops/s |
| fingerprint(tiny (3 fields)) | 68.3 µs | 557.2 µs | 557.2 µs | 14.6 K ops/s |
| fingerprint(medium (50 fields)) | 146.1 µs | 535.4 µs | 535.4 µs | 6.8 K ops/s |
| fingerprint(nested-3) | 59.7 µs | 255.3 µs | 255.3 µs | 16.8 K ops/s |
| fingerprint(nested-5) | 55.7 µs | 174.4 µs | 174.4 µs | 18.0 K ops/s |
| forSchema(flat-10) | 82.4 µs | 126.4 µs | 126.4 µs | 12.1 K ops/s |
| forSchema(flat-50) | 147.6 µs | 593.7 µs | 593.7 µs | 6.8 K ops/s |
| forSchema(nested-3-deep) | 141.7 µs | 679.5 µs | 679.5 µs | 7.1 K ops/s |
| forSchema(nested-5-deep) | 215.0 µs | 541.3 µs | 541.3 µs | 4.7 K ops/s |
| registry(flat-10) | 95.7 µs | 189.3 µs | 189.3 µs | 10.5 K ops/s |
| registry(flat-50) | 353.4 µs | 801.3 µs | 801.3 µs | 2.8 K ops/s |
| registry(nested-3-deep) | 338.8 µs | 771.5 µs | 771.5 µs | 3.0 K ops/s |
| registry(nested-5-deep) | 195.3 µs | 635.5 µs | 635.5 µs | 5.1 K ops/s |

