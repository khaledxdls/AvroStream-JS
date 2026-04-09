# Schema Pipeline Benchmark

- Generated: 2026-04-09T10:16:58.632Z
- Node: v24.14.0
- Platform: linux x64
- Warmup rounds: 2
- Measured rounds: 3

| Benchmark | Median | p95 | p99 | Ops/sec |
|---|---:|---:|---:|---:|
| inferSchema(flat-10) | 5.3 µs | 42.7 µs | 42.7 µs | 187.8 K ops/s |
| inferSchema(flat-50) | 18.7 µs | 29.3 µs | 29.3 µs | 53.6 K ops/s |
| inferSchema(nested-3-deep) | 7.7 µs | 18.7 µs | 18.7 µs | 129.7 K ops/s |
| inferSchema(nested-5-deep) | 8.1 µs | 77.2 µs | 77.2 µs | 123.4 K ops/s |
| fingerprint(tiny (3 fields)) | 196.9 µs | 208.6 µs | 208.6 µs | 5.1 K ops/s |
| fingerprint(medium (50 fields)) | 259.0 µs | 1.281 ms | 1.281 ms | 3.9 K ops/s |
| fingerprint(nested-3) | 143.8 µs | 159.2 µs | 159.2 µs | 7.0 K ops/s |
| fingerprint(nested-5) | 144.6 µs | 1.009 ms | 1.009 ms | 6.9 K ops/s |
| forSchema(flat-10) | 86.2 µs | 126.0 µs | 126.0 µs | 11.6 K ops/s |
| forSchema(flat-50) | 147.7 µs | 172.5 µs | 172.5 µs | 6.8 K ops/s |
| forSchema(nested-3-deep) | 202.6 µs | 303.3 µs | 303.3 µs | 4.9 K ops/s |
| forSchema(nested-5-deep) | 438.9 µs | 586.9 µs | 586.9 µs | 2.3 K ops/s |
| registry(flat-10) | 190.2 µs | 599.3 µs | 599.3 µs | 5.3 K ops/s |
| registry(flat-50) | 952.2 µs | 2.035 ms | 2.035 ms | 1.1 K ops/s |
| registry(nested-3-deep) | 288.5 µs | 599.9 µs | 599.9 µs | 3.5 K ops/s |
| registry(nested-5-deep) | 304.7 µs | 335.2 µs | 335.2 µs | 3.3 K ops/s |

