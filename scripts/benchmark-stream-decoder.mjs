import { performance } from 'node:perf_hooks';

function mulberry32(seed) {
  let t = seed;
  return function rand() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function concatBuffers(a, b) {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

function generateWireBuffer(recordCount, payloadBytes, seed = 42) {
  const rand = mulberry32(seed);
  const frameSize = 4 + payloadBytes;
  const out = new Uint8Array(frameSize * recordCount);
  const view = new DataView(out.buffer);

  let offset = 0;
  for (let i = 0; i < recordCount; i++) {
    view.setUint32(offset, payloadBytes, false);
    offset += 4;

    for (let p = 0; p < payloadBytes; p++) {
      out[offset + p] = Math.floor(rand() * 256);
    }
    offset += payloadBytes;
  }

  return out;
}

function splitIntoChunks(buffer, min = 256, max = 4096, seed = 7) {
  const rand = mulberry32(seed);
  const chunks = [];
  let offset = 0;

  while (offset < buffer.length) {
    const next = Math.floor(min + rand() * (max - min + 1));
    const end = Math.min(buffer.length, offset + next);
    chunks.push(buffer.slice(offset, end));
    offset = end;
  }

  return chunks;
}

function parseWithConcat(chunks) {
  let buffer = new Uint8Array(0);
  let records = 0;
  let bytes = 0;

  for (const chunk of chunks) {
    buffer = concatBuffers(buffer, chunk);

    while (buffer.length >= 4) {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const recordLen = view.getUint32(0, false);
      if (buffer.length < 4 + recordLen) break;

      const recordData = buffer.slice(4, 4 + recordLen);
      bytes += recordData.length;
      records++;
      buffer = buffer.slice(4 + recordLen);
    }
  }

  if (buffer.length !== 0) {
    throw new Error(`concat parser ended with ${buffer.length} trailing bytes`);
  }

  return { records, bytes };
}

class ByteQueue {
  constructor() {
    this.chunks = [];
    this.offset = 0;
    this.length = 0;
  }

  push(chunk) {
    if (chunk.length === 0) return;
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  peekUint32BE() {
    if (this.length < 4) return null;
    const bytes = this.peek(4);
    const view = new DataView(bytes.buffer, bytes.byteOffset, 4);
    return view.getUint32(0, false);
  }

  shift(size) {
    if (size < 0 || size > this.length) {
      throw new Error(`cannot shift ${size} bytes from queue of ${this.length}`);
    }

    const out = new Uint8Array(size);
    let outOffset = 0;
    let remaining = size;

    while (remaining > 0) {
      const chunk = this.chunks[0];
      if (!chunk) throw new Error('unexpected queue underflow');

      const available = chunk.length - this.offset;
      const take = Math.min(remaining, available);

      out.set(chunk.subarray(this.offset, this.offset + take), outOffset);
      this.offset += take;
      outOffset += take;
      remaining -= take;
      this.length -= take;

      if (this.offset >= chunk.length) {
        this.chunks.shift();
        this.offset = 0;
      }
    }

    return out;
  }

  peek(size) {
    const first = this.chunks[0];
    if (!first) return new Uint8Array(0);

    if (first.length - this.offset >= size) {
      return first.subarray(this.offset, this.offset + size);
    }

    const out = new Uint8Array(size);
    let outOffset = 0;
    let remaining = size;
    let localOffset = this.offset;

    for (const chunk of this.chunks) {
      const available = chunk.length - localOffset;
      if (available <= 0) {
        localOffset = 0;
        continue;
      }

      const take = Math.min(remaining, available);
      out.set(chunk.subarray(localOffset, localOffset + take), outOffset);
      outOffset += take;
      remaining -= take;
      localOffset = 0;

      if (remaining === 0) break;
    }

    return out;
  }
}

function parseWithQueue(chunks) {
  const queue = new ByteQueue();
  let records = 0;
  let bytes = 0;

  for (const chunk of chunks) {
    queue.push(chunk);

    while (queue.length >= 4) {
      const recordLen = queue.peekUint32BE();
      if (recordLen === null) break;
      if (queue.length < 4 + recordLen) break;

      queue.shift(4);
      const recordData = queue.shift(recordLen);
      bytes += recordData.length;
      records++;
    }
  }

  if (queue.length !== 0) {
    throw new Error(`queue parser ended with ${queue.length} trailing bytes`);
  }

  return { records, bytes };
}

function bench(name, fn, iterations = 5) {
  const durations = [];
  let result;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    result = fn();
    const end = performance.now();
    durations.push(end - start);
  }

  durations.sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)];
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;

  return { name, medianMs: median, avgMs: avg, result };
}

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function main() {
  const RECORD_COUNT = Number(process.env.RECORD_COUNT ?? 100_000);
  const PAYLOAD_BYTES = Number(process.env.PAYLOAD_BYTES ?? 128);
  const CHUNK_MIN = Number(process.env.CHUNK_MIN ?? 256);
  const CHUNK_MAX = Number(process.env.CHUNK_MAX ?? 4096);
  const ITERATIONS = Number(process.env.ITERATIONS ?? 7);

  const wire = generateWireBuffer(RECORD_COUNT, PAYLOAD_BYTES);
  const chunks = splitIntoChunks(wire, CHUNK_MIN, CHUNK_MAX);

  // Warm-up (3 rounds to ensure JIT is settled before timing)
  for (let w = 0; w < 3; w++) {
    parseWithConcat(chunks);
    parseWithQueue(chunks);
  }

  const oldBench = bench('concat/slice parser', () => parseWithConcat(chunks), ITERATIONS);
  const newBench = bench('byte-queue parser', () => parseWithQueue(chunks), ITERATIONS);

  const speedup = oldBench.medianMs / newBench.medianMs;

  console.log('=== Stream Decoder Micro-Benchmark ===');
  console.log(`records       : ${RECORD_COUNT.toLocaleString()}`);
  console.log(`payload bytes : ${PAYLOAD_BYTES}`);
  console.log(`wire size     : ${formatMB(wire.length)} MB`);
  console.log(`chunks        : ${chunks.length.toLocaleString()} (${CHUNK_MIN}-${CHUNK_MAX} bytes)`);
  console.log(`iterations    : ${ITERATIONS}`);
  console.log('');
  console.log(`${oldBench.name.padEnd(22)} median=${oldBench.medianMs.toFixed(2)}ms avg=${oldBench.avgMs.toFixed(2)}ms`);
  console.log(`${newBench.name.padEnd(22)} median=${newBench.medianMs.toFixed(2)}ms avg=${newBench.avgMs.toFixed(2)}ms`);
  console.log('');
  console.log(`speedup (median): ${speedup.toFixed(2)}x`);
  console.log(`decoded records : ${newBench.result.records.toLocaleString()}`);
}

main();
