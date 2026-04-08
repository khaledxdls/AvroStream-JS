import { describe, it, expect } from 'vitest';
import { encode, decode, frameForWire, parseWireFrame } from '../codec/index.js';
import { SchemaRegistry } from '../schema/registry.js';
import { AvroCircularReferenceError, CodecError } from '../errors/index.js';
import type { AvroRecordSchema } from '../types.js';

const schema: AvroRecordSchema = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'age', type: 'int' },
  ],
};

function getEntry() {
  const registry = new SchemaRegistry();
  const fp = registry.register(schema);
  return registry.getByFingerprint(fp);
}

describe('Codec', () => {
  describe('encode / decode roundtrip', () => {
    it('encodes and decodes a simple record', () => {
      const entry = getEntry();
      const original = { name: 'Alice', age: 30 };
      const binary = encode(entry, original);
      expect(binary).toBeInstanceOf(Uint8Array);
      expect(binary.length).toBeGreaterThan(0);

      const decoded = decode(entry, binary);
      expect(decoded).toEqual(original);
    });

    it('binary is smaller than JSON for typical objects', () => {
      const entry = getEntry();
      const obj = { name: 'Bob', age: 25 };
      const binary = encode(entry, obj);
      const json = new TextEncoder().encode(JSON.stringify(obj));
      expect(binary.length).toBeLessThan(json.length);
    });
  });

  describe('circular reference detection', () => {
    it('throws AvroCircularReferenceError', () => {
      const entry = getEntry();
      const obj: Record<string, unknown> = { name: 'loop', age: 1 };
      obj['self'] = obj;
      expect(() => encode(entry, obj)).toThrow(AvroCircularReferenceError);
    });
  });

  describe('wire framing', () => {
    it('frames and parses correctly', () => {
      const fp = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const data = new Uint8Array([10, 20, 30]);
      const framed = frameForWire({ fingerprint: fp, data });

      expect(framed.length).toBe(11); // 8 + 3

      const parsed = parseWireFrame(framed);
      expect(Array.from(parsed.fingerprint)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(Array.from(parsed.data)).toEqual([10, 20, 30]);
    });

    it('throws on frames shorter than 8 bytes', () => {
      expect(() => parseWireFrame(new Uint8Array(5))).toThrow(CodecError);
    });

    it('handles empty data portion', () => {
      const fp = new Uint8Array(8);
      const framed = frameForWire({ fingerprint: fp, data: new Uint8Array(0) });
      const parsed = parseWireFrame(framed);
      expect(parsed.data.length).toBe(0);
    });
  });
});
