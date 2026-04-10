# Benchmark Dashboard

Generated: 2026-04-10T06:50:00.000Z

This page consolidates benchmark outputs from all folders under `benchmark-results`.

### Avro vs JSON — latest
- Source: [benchmark-results/avro-vs-json/latest/latest.md](benchmark-results/avro-vs-json/latest/latest.md) · [benchmark-results/avro-vs-json/latest/latest.csv](benchmark-results/avro-vs-json/latest/latest.csv)

| Records | Encode (Avro faster) | Decode (Avro faster) | Size Reduction |
|---:|---:|---:|---:|
| 5,000 | 37.20% | 8.55% | 59.54% |
| 20,000 | 56.16% | -17.39% | 59.54% |
| 50,000 | 70.59% | 25.39% | 59.54% |

### Avro vs JSON — release
- Source: [benchmark-results/avro-vs-json/release/latest.md](benchmark-results/avro-vs-json/release/latest.md) · [benchmark-results/avro-vs-json/release/latest.csv](benchmark-results/avro-vs-json/release/latest.csv)

| Records | Encode (Avro faster) | Decode (Avro faster) | Size Reduction |
|---:|---:|---:|---:|
| 20,000 | 30.86% | 16.53% | 59.54% |
| 50,000 | 42.03% | 16.59% | 59.54% |
| 100,000 | 51.34% | 16.29% | 59.54% |

### Avro vs JSON — smoke
- Source: [benchmark-results/avro-vs-json/smoke/latest.md](benchmark-results/avro-vs-json/smoke/latest.md) · [benchmark-results/avro-vs-json/smoke/latest.csv](benchmark-results/avro-vs-json/smoke/latest.csv)

| Records | Encode (Avro faster) | Decode (Avro faster) | Size Reduction |
|---:|---:|---:|---:|
| 1,000 | 11.69% | -74.68% | 59.54% |

### Schema Pipeline — latest
- Source: [benchmark-results/schema/latest/latest.md](benchmark-results/schema/latest/latest.md) · [benchmark-results/schema/latest/latest.csv](benchmark-results/schema/latest/latest.csv)

| Operation | Shape | Median | Throughput |
|---|---|---:|---:|
| inferSchema | flat-10 | 5.1 us | 196.9 K ops/s |
| inferSchema | flat-50 | 34.8 us | 28.7 K ops/s |
| fingerprint | tiny (3 fields) | 68.3 us | 14.6 K ops/s |
| fingerprint | medium (50 fields) | 146.1 us | 6.8 K ops/s |
| forSchema | flat-10 | 82.4 us | 12.1 K ops/s |
| registry round-trip | flat-10 | 95.7 us | 10.5 K ops/s |

### E2E Web (HTTP) — latest
- Source: [benchmark-results/e2e-web/latest/latest.md](benchmark-results/e2e-web/latest/latest.md) · [benchmark-results/e2e-web/latest/latest.csv](benchmark-results/e2e-web/latest/latest.csv)

| Metric | Value |
|---|---:|
| Requests | 5,000 |
| Concurrency | 32 |
| Throughput delta (Avro vs JSON) | -11.65% |
| Median latency delta (Avro vs JSON) | -16.01% |
| Request payload bytes delta | -49.03% |
| Response payload bytes delta | -56.59% |

### E2E WebSocket — latest
- Source: [benchmark-results/e2e-ws/latest/latest.md](benchmark-results/e2e-ws/latest/latest.md) · [benchmark-results/e2e-ws/latest/latest.csv](benchmark-results/e2e-ws/latest/latest.csv)

| Metric | Value |
|---|---:|
| Messages | 6,000 |
| Concurrency | 64 |
| Throughput delta (Avro vs JSON) | -9.55% |
| Median latency delta (Avro vs JSON) | -24.27% |
| Request payload bytes delta | -52.21% |
| Response payload bytes delta | -39.74% |

### E2E WebSocket — release
- Source: [benchmark-results/e2e-ws/release/latest.md](benchmark-results/e2e-ws/release/latest.md) · [benchmark-results/e2e-ws/release/latest.csv](benchmark-results/e2e-ws/release/latest.csv)

| Metric | Value |
|---|---:|
| Messages | 20,000 |
| Concurrency | 128 |
| Throughput delta (Avro vs JSON) | -18.85% |
| Median latency delta (Avro vs JSON) | -31.75% |
| Request payload bytes delta | -52.77% |
| Response payload bytes delta | -41.03% |

### Server-to-Server HTTP — latest
- Source: [benchmark-results/s2s/latest/latest.md](benchmark-results/s2s/latest/latest.md) · [benchmark-results/s2s/latest/latest.csv](benchmark-results/s2s/latest/latest.csv)

| Metric | Value |
|---|---:|
| Requests | 4,000 |
| Concurrency | 64 |
| Throughput delta (Avro vs JSON) | 16.52% |
| Median latency delta (Avro vs JSON) | -2.05% |
| Request payload bytes delta | -49.37% |
| Response payload bytes delta | -57.55% |

### Server-to-Server HTTP — release
- Source: [benchmark-results/s2s/release/latest.md](benchmark-results/s2s/release/latest.md) · [benchmark-results/s2s/release/latest.csv](benchmark-results/s2s/release/latest.csv)

| Metric | Value |
|---|---:|
| Requests | 12,000 |
| Concurrency | 96 |
| Throughput delta (Avro vs JSON) | 1.56% |
| Median latency delta (Avro vs JSON) | -5.66% |
| Request payload bytes delta | -49.37% |
| Response payload bytes delta | -57.55% |
