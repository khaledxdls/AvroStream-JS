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
    let buffer = new Uint8Array(0);

    try {
      for (;;) {
        const { done, value } = await reader.read();

        if (value) {
          buffer = concatBuffers(buffer, new Uint8Array(value));
        }

        // Try to drain complete records from the buffer.
        while (buffer.length >= 4) {
          const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
          const recordLen = view.getUint32(0, false);

          if (buffer.length < 4 + recordLen) {
            break; // Need more data.
          }

          const recordData = buffer.slice(4, 4 + recordLen);
          buffer = buffer.slice(4 + recordLen);

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
      if (buffer.length > 0) {
        throw new CodecError(
          `Stream ended with ${buffer.length} trailing bytes — data may be corrupt.`,
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
  let headerBuf = new Uint8Array(0);

  while (headerBuf.length < 8) {
    const { done, value } = await reader.read();
    if (done) {
      throw new CodecError('Stream ended before schema fingerprint was received.');
    }
    if (value) {
      headerBuf = concatBuffers(headerBuf, new Uint8Array(value));
    }
  }

  const fp = headerBuf.slice(0, 8);
  const remainder = headerBuf.slice(8);
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

function concatBuffers(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}
