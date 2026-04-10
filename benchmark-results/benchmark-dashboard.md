# Benchmark Dashboard

Generated: 2026-04-10T08:00:00.000Z

This page consolidates benchmark outputs from all folders under `benchmark-results`.

### Avro vs JSON — latest
- Source: [avro-vs-json/latest/latest.md](avro-vs-json/latest/latest.md) · [avro-vs-json/latest/latest.csv](avro-vs-json/latest/latest.csv)

| Records | Encode (Avro faster) | Decode (Avro faster) | Size Reduction |
|---:|---:|---:|---:|
| 5,000 | 22.96% | 19.17% | 59.54% |
| 20,000 | 24.82% | 28.48% | 59.54% |
| 50,000 | 58.47% | 17.77% | 59.54% |

### Avro vs JSON — release
- Source: [avro-vs-json/release/latest.md](avro-vs-json/release/latest.md) · [avro-vs-json/release/latest.csv](avro-vs-json/release/latest.csv)

| Records | Encode (Avro faster) | Decode (Avro faster) | Size Reduction |
|---:|---:|---:|---:|
| 20,000 | -25.83% | 18.63% | 59.54% |
| 50,000 | 51.87% | -27.96% | 59.54% |
| 100,000 | 56.36% | -52.47% | 59.54% |

### Avro vs JSON — smoke
- Source: [avro-vs-json/smoke/latest.md](avro-vs-json/smoke/latest.md) · [avro-vs-json/smoke/latest.csv](avro-vs-json/smoke/latest.csv)

| Records | Encode (Avro faster) | Decode (Avro faster) | Size Reduction |
|---:|---:|---:|---:|
| 1,000 | 11.69% | -74.68% | 59.54% |

### Schema Pipeline — latest
- Source: [schema/latest/latest.md](schema/latest/latest.md) · [schema/latest/latest.csv](schema/latest/latest.csv)

| Operation | Shape | Median | Throughput |
|---|---|---:|---:|
| inferSchema | flat-10 | 5.0 us | 201.5 K ops/s |
| inferSchema | flat-50 | 23.3 us | 43.0 K ops/s |
| fingerprint | tiny (3 fields) | 100.9 us | 9.9 K ops/s |
| fingerprint | medium (50 fields) | 193.5 us | 5.2 K ops/s |
| forSchema | flat-10 | 76.9 us | 13.0 K ops/s |
| registry round-trip | flat-10 | 137.4 us | 7.3 K ops/s |

### Internals Micro-Benchmark — latest
- Source: [internals/latest/latest.md](internals/latest/latest.md) · [internals/latest/latest.csv](internals/latest/latest.csv)

| Feature | Overhead | Ops/sec |
|---|---:|---:|
| encode circular-ref check | +18.4% | 461.1 K (checked) vs 545.9 K (skipped) |
| LRU bookkeeping | +35.7% | 1.98 M (LRU) vs 2.69 M (unlimited) |
| Canonical fingerprint form | +49.6% | 43.7 K (canonical) vs 65.3 K (JSON.stringify) |

### E2E Web (HTTP) — latest
- Source: [e2e-web/latest/latest.md](e2e-web/latest/latest.md) · [e2e-web/latest/latest.csv](e2e-web/latest/latest.csv)

| Metric | Value |
|---|---:|
| Requests | 5,000 |
| Concurrency | 32 |
| Throughput delta (Avro vs JSON) | **+46.58%** |
| Median latency delta (Avro vs JSON) | **+22.66%** |
| Request payload bytes delta | -49.03% |
| Response payload bytes delta | -56.59% |

### E2E Web (HTTP) — release
- Source: [e2e-web/release/latest.md](e2e-web/release/latest.md) · [e2e-web/release/latest.csv](e2e-web/release/latest.csv)

| Metric | Value |
|---|---:|
| Requests | 10,000 |
| Concurrency | 48 |
| Throughput delta (Avro vs JSON) | **+36.46%** |
| Median latency delta (Avro vs JSON) | **+26.60%** |
| Request payload bytes delta | -49.03% |
| Response payload bytes delta | -56.59% |

### E2E WebSocket — latest
- Source: [e2e-ws/latest/latest.md](e2e-ws/latest/latest.md) · [e2e-ws/latest/latest.csv](e2e-ws/latest/latest.csv)

| Metric | Value |
|---|---:|
| Messages | 6,000 |
| Concurrency | 64 |
| Throughput delta (Avro vs JSON) | **+16.08%** |
| Median latency delta (Avro vs JSON) | -6.48% |
| Request payload bytes delta | -52.21% |
| Response payload bytes delta | -39.74% |

### E2E WebSocket — release
- Source: [e2e-ws/release/latest.md](e2e-ws/release/latest.md) · [e2e-ws/release/latest.csv](e2e-ws/release/latest.csv)

| Metric | Value |
|---|---:|
| Messages | 20,000 |
| Concurrency | 128 |
| Throughput delta (Avro vs JSON) | **+54.41%** |
| Median latency delta (Avro vs JSON) | **+15.68%** |
| Request payload bytes delta | -52.21% |
| Response payload bytes delta | -39.74% |

### Server-to-Server HTTP — latest
- Source: [s2s/latest/latest.md](s2s/latest/latest.md) · [s2s/latest/latest.csv](s2s/latest/latest.csv)

| Metric | Value |
|---|---:|
| Requests | 4,000 |
| Concurrency | 64 |
| Throughput delta (Avro vs JSON) | 16.52% |
| Median latency delta (Avro vs JSON) | -2.05% |
| Request payload bytes delta | -49.37% |
| Response payload bytes delta | -57.55% |

### Server-to-Server HTTP — release
- Source: [s2s/release/latest.md](s2s/release/latest.md) · [s2s/release/latest.csv](s2s/release/latest.csv)

| Metric | Value |
|---|---:|
| Requests | 12,000 |
| Concurrency | 96 |
| Throughput delta (Avro vs JSON) | **+15.23%** |
| Median latency delta (Avro vs JSON) | **+6.79%** |
| Request payload bytes delta | -49.03% |
| Response payload bytes delta | -56.59% |
