# Internals Micro-Benchmark

- Generated: 2026-04-10T07:18:50.985Z
- Node: v24.14.0
- Platform: linux x64
- Warmup: 5, Rounds: 12, Batch: 5000

| Benchmark | Median | p95 | Ops/sec |
|---|---:|---:|---:|
| encode (with circ-check) x5000 | 2.2 µs | 2.9 µs | 461.1 K ops/s |
| encode (skip circ-check) x5000 | 1.8 µs | 6.3 µs | 545.9 K ops/s |
| getByFingerprint (unlimited) x5000 | 372 ns | 2.2 µs | 2.69 M ops/s |
| getByFingerprint (maxSize=200) x5000 | 505 ns | 1.7 µs | 1.98 M ops/s |
| fingerprint (canonical) x5000 | 22.9 µs | 45.9 µs | 43.7 K ops/s |
| fingerprint (JSON.stringify) x5000 | 15.3 µs | 50.5 µs | 65.3 K ops/s |

### Key Takeaways

- **Circular-ref check**: +18.4% encode overhead. Use `encode(entry, obj, true)` on hot paths where input is trusted.
- **LRU bookkeeping**: +35.7% lookup overhead. Negligible cost for bounded memory.
- **Canonical form**: +49.6% fingerprint overhead. Only affects `register()`, not encode/decode.

