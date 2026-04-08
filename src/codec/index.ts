/**
 * Codec — Serialization & Deserialization
 *
 * Thin wrapper over avsc that adds:
 *  - Circular-reference detection before serialization
 *  - Wire framing: [8-byte fingerprint][binary data]
 *  - Descriptive error wrapping
 */

import type { WirePayload } from '../types.js';
import type { RegistryEntry } from '../schema/registry.js';
import { AvroCircularReferenceError, CodecError } from '../errors/index.js';

/**
 * Encode a JS object into an Avro binary buffer using the given registry entry.
 * Returns the raw binary data (without the fingerprint prefix).
 */
export function encode(
  entry: RegistryEntry,
  obj: Record<string, unknown>,
): Uint8Array {
  assertNoCircularRefs(obj);

  try {
    const buf = entry.type.toBuffer(obj);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } catch (err) {
    throw new CodecError(
      `Serialization failed for schema "${entry.schema.name}": ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err },
    );
  }
}

/**
 * Decode an Avro binary buffer back into a JS object.
 */
export function decode(
  entry: RegistryEntry,
  data: Uint8Array,
): Record<string, unknown> {
  try {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    return entry.type.fromBuffer(buf) as Record<string, unknown>;
  } catch (err) {
    throw new CodecError(
      `Deserialization failed for schema "${entry.schema.name}": ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err },
    );
  }
}

/**
 * Resolve payload encoded with a writer schema into a reader schema and
 * re-encode with the reader schema for transport compatibility.
 */
export function resolveToReaderSchema(
  writerEntry: RegistryEntry,
  readerEntry: RegistryEntry,
  data: Uint8Array,
): Uint8Array {
  try {
    const source = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const resolver = readerEntry.type.createResolver(writerEntry.type);
    const projected = readerEntry.type.fromBuffer(source, resolver) as Record<string, unknown>;
    const result = readerEntry.type.toBuffer(projected);
    return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
  } catch (err) {
    throw new CodecError(
      `Schema resolution failed from writer "${writerEntry.schema.name}" ` +
        `to reader "${readerEntry.schema.name}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      { cause: err },
    );
  }
}

/**
 * Frame data for the wire: [8-byte fingerprint][encoded data].
 */
export function frameForWire(payload: WirePayload): Uint8Array {
  const frame = new Uint8Array(8 + payload.data.length);
  frame.set(payload.fingerprint, 0);
  frame.set(payload.data, 8);
  return frame;
}

/**
 * Parse a wire frame back into fingerprint + data.
 */
export function parseWireFrame(frame: Uint8Array): WirePayload {
  if (frame.length < 8) {
    throw new CodecError(
      `Invalid wire frame: expected at least 8 bytes, got ${frame.length}`,
    );
  }
  return {
    fingerprint: frame.slice(0, 8),
    data: frame.slice(8),
  };
}

// ── Internal helpers ──────────────────────────────────────────────────

function assertNoCircularRefs(obj: unknown, path = '', seen = new WeakSet<object>()): void {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return;
  }

  const asObj = obj as object;

  if (seen.has(asObj)) {
    throw new AvroCircularReferenceError(path || '<root>');
  }

  seen.add(asObj);

  if (Array.isArray(asObj)) {
    for (let i = 0; i < asObj.length; i++) {
      assertNoCircularRefs(asObj[i], `${path}[${i}]`, seen);
    }
  } else {
    for (const [key, value] of Object.entries(asObj)) {
      assertNoCircularRefs(value, path ? `${path}.${key}` : key, seen);
    }
  }

  seen.delete(asObj);
}
