/**
 * Streaming Decoder
 *
 * Implements chunked binary decoding over ReadableStream (Fetch Streaming).
 * Instead of buffering the entire response, it decodes Avro blocks as they
 * arrive and yields JS objects via an async iterator — keeping RAM flat.
 *
 * Wire format (per chunk):
 *   [4 bytes: record length (big-endian)]
 *   [N bytes: Avro-encoded record]
 *   ... repeating ...
 *
 * The stream header is:
 *   [8 bytes: schema fingerprint]
 */

import type { SchemaRegistry } from '../schema/registry.js';
import type { DebugLogger } from '../debug/index.js';
import type { RegistryEntry } from '../schema/registry.js';
import { decode } from '../codec/index.js';
import { CodecError } from '../errors/index.js';

export interface StreamDecoderConfig {
  readonly registry: SchemaRegistry;
  readonly debug: DebugLogger;
  readonly fetchImpl: typeof globalThis.fetch;
  readonly endpoint: string;
}

/**
 * Async-iterable stream that decodes Avro records on the fly.
 */
export class AvroStream implements AsyncIterable<Record<string, unknown>> {
  private readonly _response: Response;
  private readonly _entry: RegistryEntry;
  private readonly _debug: DebugLogger;
  private readonly _path: string;

  constructor(
    response: Response,
    entry: RegistryEntry,
    debug: DebugLogger,
    path: string,
  ) {
    this._response = response;
    this._entry = entry;
    this._debug = debug;
    this._path = path;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Record<string, unknown>> {
    const body = this._response.body;
    if (!body) {
      throw new CodecError('Response body is null — cannot stream.');
    }

    const reader = body.getReader();
    const queue = new ByteQueue();

    try {
      for (;;) {
        const { done, value } = await reader.read();

        if (value) {
          queue.push(value);
        }

        // Try to drain complete records from the buffer.
        while (queue.length >= 4) {
          const recordLen = queue.peekUint32BE();
          if (recordLen === null) {
            break;
          }

          if (queue.length < 4 + recordLen) {
            break; // Need more data.
          }

          queue.shift(4);
          const recordData = queue.shift(recordLen);

          const decoded = decode(this._entry, recordData);

          this._debug.log(
            'incoming',
            this._path,
            this._entry.schema.name,
            decoded,
            recordData.length,
          );

          yield decoded;
        }

        if (done) break;
      }

      // If there's leftover data, it's a protocol violation.
      if (queue.length > 0) {
        throw new CodecError(
          `Stream ended with ${queue.length} trailing bytes — data may be corrupt.`,
        );
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * Initiate a streaming fetch and return an async-iterable AvroStream.
 */
export async function createAvroStream(
  config: StreamDecoderConfig,
  path: string,
  signal?: AbortSignal,
): Promise<AvroStream> {
  const url = `${config.endpoint}${path}`;

  const response = await config.fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/avro-stream' },
    signal,
  });

  if (!response.ok) {
    throw new CodecError(
      `Stream request to ${path} failed with status ${response.status}`,
    );
  }

  if (!response.body) {
    throw new CodecError('Response has no readable body for streaming.');
  }

  // Read the 8-byte schema fingerprint from the start of the stream.
  const reader = response.body.getReader();
  const headerQueue = new ByteQueue();

  while (headerQueue.length < 8) {
    const { done, value } = await reader.read();
    if (done) {
      throw new CodecError('Stream ended before schema fingerprint was received.');
    }
    if (value) {
      headerQueue.push(value);
    }
  }

  const fp = headerQueue.shift(8);
  const remainder = headerQueue.shift(headerQueue.length);
  const entry = config.registry.getByFingerprint(fp);

  // Reconstruct a ReadableStream that starts with the remainder bytes.
  const reconstructed = new ReadableStream<Uint8Array>({
    start(controller) {
      if (remainder.length > 0) {
        controller.enqueue(remainder);
      }
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      if (value) {
        controller.enqueue(value);
      }
    },
    cancel() {
      reader.releaseLock();
    },
  });

  const syntheticResponse = new Response(reconstructed, {
    headers: response.headers,
  });

  return new AvroStream(syntheticResponse, entry, config.debug, path);
}

// ── Utility ──────────────────────────────────────────────────────────

class ByteQueue {
  private _chunks: Uint8Array[] = [];
  private _offset = 0;
  private _length = 0;

  get length(): number {
    return this._length;
  }

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    this._chunks.push(chunk);
    this._length += chunk.length;
  }

  peekUint32BE(): number | null {
    if (this._length < 4) {
      return null;
    }

    const bytes = this._peek(4);
    const view = new DataView(bytes.buffer, bytes.byteOffset, 4);
    return view.getUint32(0, false);
  }

  shift(size: number): Uint8Array {
    if (size < 0 || size > this._length) {
      throw new CodecError(`Cannot consume ${size} bytes from stream buffer of length ${this._length}.`);
    }

    const out = new Uint8Array(size);
    let outOffset = 0;
    let remaining = size;

    while (remaining > 0) {
      const chunk = this._chunks[0];
      if (!chunk) {
        throw new CodecError('Unexpected empty stream buffer state.');
      }

      const availableInChunk = chunk.length - this._offset;
      const take = Math.min(remaining, availableInChunk);

      out.set(chunk.subarray(this._offset, this._offset + take), outOffset);

      this._offset += take;
      outOffset += take;
      remaining -= take;
      this._length -= take;

      if (this._offset >= chunk.length) {
        this._chunks.shift();
        this._offset = 0;
      }
    }

    return out;
  }

  private _peek(size: number): Uint8Array {
    if (this._chunks.length === 0) {
      return new Uint8Array(0);
    }

    const first = this._chunks[0]!;
    if (first.length - this._offset >= size) {
      return first.subarray(this._offset, this._offset + size);
    }

    const out = new Uint8Array(size);
    let outOffset = 0;
    let remaining = size;
    let localOffset = this._offset;

    for (const chunk of this._chunks) {
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

      if (remaining === 0) {
        break;
      }
    }

    return out;
  }
}
