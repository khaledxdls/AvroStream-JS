# Benchmark Dashboard

Generated: 2026-04-08T08:48:26.301Z

This page consolidates benchmark outputs from all folders under `benchmark-results`.

### Avro vs JSON — latest
- Source: [benchmark-results/avro-vs-json/latest/latest.md](benchmark-results/avro-vs-json/latest/latest.md) · [benchmark-results/avro-vs-json/latest/latest.csv](benchmark-results/avro-vs-json/latest/latest.csv)

| Records | Encode (Avro faster) | Decode (Avro faster) | Size Reduction |
|---:|---:|---:|---:|
| 5,000 | 26.92% | 10.57% | 59.54% |
| 20,000 | 42.82% | 8.02% | 59.54% |
| 50,000 | 43.89% | 19.69% | 59.54% |

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

### E2E Web — latest
- Source: [benchmark-results/e2e-web/latest/latest.md](benchmark-results/e2e-web/latest/latest.md) · [benchmark-results/e2e-web/latest/latest.csv](benchmark-results/e2e-web/latest/latest.csv)

| Metric | Value |
|---|---:|
| Requests/Messages | 1,500 |
| Concurrency | 24 |
| Throughput delta (Avro vs JSON) | 11.12% |
| Median latency delta (Avro vs JSON) | -10.26% |
| Request payload bytes delta | 49.38% |
| Response payload bytes delta | 57.55% |

### E2E WebSocket — latest
- Source: [benchmark-results/e2e-ws/latest/latest.md](benchmark-results/e2e-ws/latest/latest.md) · [benchmark-results/e2e-ws/latest/latest.csv](benchmark-results/e2e-ws/latest/latest.csv)

| Metric | Value |
|---|---:|
| Requests/Messages | 1,200 |
| Concurrency | 32 |
| Throughput delta (Avro vs JSON) | 4.69% |
| Median latency delta (Avro vs JSON) | -16.00% |
| Request payload bytes delta | 52.78% |
| Response payload bytes delta | 41.03% |

### E2E WebSocket — release
- Source: [benchmark-results/e2e-ws/release/latest.md](benchmark-results/e2e-ws/release/latest.md) · [benchmark-results/e2e-ws/release/latest.csv](benchmark-results/e2e-ws/release/latest.csv)

| Metric | Value |
|---|---:|
| Requests/Messages | 20,000 |
| Concurrency | 128 |
| Throughput delta (Avro vs JSON) | -18.85% |
| Median latency delta (Avro vs JSON) | -31.75% |
| Request payload bytes delta | 52.77% |
| Response payload bytes delta | 41.03% |

### Server-to-Server HTTP — latest
- Source: [benchmark-results/s2s/latest/latest.md](benchmark-results/s2s/latest/latest.md) · [benchmark-results/s2s/latest/latest.csv](benchmark-results/s2s/latest/latest.csv)

| Metric | Value |
|---|---:|
| Requests/Messages | 4,000 |
| Concurrency | 64 |
| Throughput delta (Avro vs JSON) | 16.52% |
| Median latency delta (Avro vs JSON) | -2.05% |
| Request payload bytes delta | 49.37% |
| Response payload bytes delta | 57.55% |

### Server-to-Server HTTP — release
- Source: [benchmark-results/s2s/release/latest.md](benchmark-results/s2s/release/latest.md) · [benchmark-results/s2s/release/latest.csv](benchmark-results/s2s/release/latest.csv)

| Metric | Value |
|---|---:|
| Requests/Messages | 12,000 |
| Concurrency | 96 |
| Throughput delta (Avro vs JSON) | 1.56% |
| Median latency delta (Avro vs JSON) | -5.66% |
| Request payload bytes delta | 49.37% |
| Response payload bytes delta | 57.55% |

