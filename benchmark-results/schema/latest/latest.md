# Schema Pipeline Benchmark

- Generated: 2026-04-10T06:31:16.847Z
- Node: v24.14.0
- Platform: linux x64
- Warmup rounds: 5
- Measured rounds: 10

| Benchmark | Median | p95 | p99 | Ops/sec |
|---|---:|---:|---:|---:|
| inferSchema(flat-10) | 5.0 µs | 9.2 µs | 9.2 µs | 201.5 K ops/s |
| inferSchema(flat-50) | 23.3 µs | 52.0 µs | 52.0 µs | 43.0 K ops/s |
| inferSchema(nested-3-deep) | 10.1 µs | 13.8 µs | 13.8 µs | 99.4 K ops/s |
| inferSchema(nested-5-deep) | 11.5 µs | 20.0 µs | 20.0 µs | 87.1 K ops/s |
| fingerprint(tiny (3 fields)) | 100.9 µs | 1.946 ms | 1.946 ms | 9.9 K ops/s |
| fingerprint(medium (50 fields)) | 193.5 µs | 310.3 µs | 310.3 µs | 5.2 K ops/s |
| fingerprint(nested-3) | 61.2 µs | 286.7 µs | 286.7 µs | 16.3 K ops/s |
| fingerprint(nested-5) | 61.7 µs | 269.5 µs | 269.5 µs | 16.2 K ops/s |
| forSchema(flat-10) | 76.9 µs | 160.8 µs | 160.8 µs | 13.0 K ops/s |
| forSchema(flat-50) | 145.2 µs | 2.281 ms | 2.281 ms | 6.9 K ops/s |
| forSchema(nested-3-deep) | 177.2 µs | 1.704 ms | 1.704 ms | 5.6 K ops/s |
| forSchema(nested-5-deep) | 190.3 µs | 946.9 µs | 946.9 µs | 5.3 K ops/s |
| registry(flat-10) | 137.4 µs | 7.145 ms | 7.145 ms | 7.3 K ops/s |
| registry(flat-50) | 506.7 µs | 2.884 ms | 2.884 ms | 2.0 K ops/s |
| registry(nested-3-deep) | 300.2 µs | 2.002 ms | 2.002 ms | 3.3 K ops/s |
| registry(nested-5-deep) | 194.4 µs | 299.2 µs | 299.2 µs | 5.1 K ops/s |

