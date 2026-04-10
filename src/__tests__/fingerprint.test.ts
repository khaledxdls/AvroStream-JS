import { describe, it, expect } from 'vitest';
import { fingerprint, fingerprintToHex } from '../schema/fingerprint.js';

describe('Schema Fingerprinting', () => {
  it('produces an 8-byte Uint8Array', () => {
    const schema = { type: 'record', name: 'Test', fields: [] };
    const fp = fingerprint(schema);
    expect(fp).toBeInstanceOf(Uint8Array);
    expect(fp.length).toBe(8);
  });

  it('produces deterministic output for the same schema', () => {
    const schema = { type: 'record', name: 'User', fields: [{ name: 'id', type: 'int' }] };
    const a = fingerprint(schema);
    const b = fingerprint(schema);
    expect(fingerprintToHex(a)).toBe(fingerprintToHex(b));
  });

  it('produces different fingerprints for different schemas', () => {
    const schemaA = { type: 'record', name: 'A', fields: [] };
    const schemaB = { type: 'record', name: 'B', fields: [] };
    expect(fingerprintToHex(fingerprint(schemaA))).not.toBe(
      fingerprintToHex(fingerprint(schemaB)),
    );
  });

  it('fingerprintToHex produces a 16-character hex string', () => {
    const fp = fingerprint({ type: 'record', name: 'X', fields: [] });
    const hex = fingerprintToHex(fp);
    expect(hex).toMatch(/^[0-9a-f]{16}$/);
  });

  describe('canonical form', () => {
    it('produces identical fingerprints regardless of key order', () => {
      const a = { type: 'record', name: 'Foo', fields: [{ name: 'x', type: 'int' }] };
      const b = { name: 'Foo', fields: [{ type: 'int', name: 'x' }], type: 'record' };
      expect(fingerprintToHex(fingerprint(a))).toBe(fingerprintToHex(fingerprint(b)));
    });

    it('strips doc, aliases, and default from canonical form', () => {
      const bare = {
        type: 'record',
        name: 'Msg',
        fields: [{ name: 'id', type: 'int' }],
      };
      const decorated = {
        type: 'record',
        name: 'Msg',
        doc: 'A message',
        aliases: ['OldMsg'],
        fields: [{ name: 'id', type: 'int', doc: 'primary key', default: 0 }],
      };
      expect(fingerprintToHex(fingerprint(bare))).toBe(
        fingerprintToHex(fingerprint(decorated)),
      );
    });

    it('resolves namespace into fullname', () => {
      const withNs = {
        type: 'record',
        name: 'Event',
        namespace: 'com.example',
        fields: [],
      };
      const withFullname = {
        type: 'record',
        name: 'com.example.Event',
        fields: [],
      };
      expect(fingerprintToHex(fingerprint(withNs))).toBe(
        fingerprintToHex(fingerprint(withFullname)),
      );
    });

    it('handles nested records', () => {
      const schema = {
        type: 'record',
        name: 'Outer',
        fields: [{
          name: 'inner',
          type: { type: 'record', name: 'Inner', fields: [{ name: 'v', type: 'string' }] },
        }],
      };
      const fp = fingerprint(schema);
      expect(fp).toBeInstanceOf(Uint8Array);
      expect(fp.length).toBe(8);
    });

    it('handles array and map types', () => {
      const schema = {
        type: 'record',
        name: 'Collections',
        fields: [
          { name: 'tags', type: { type: 'array', items: 'string' } },
          { name: 'meta', type: { type: 'map', values: 'int' } },
        ],
      };
      const fp = fingerprint(schema);
      expect(fp.length).toBe(8);
    });

    it('handles union types', () => {
      const schema = {
        type: 'record',
        name: 'Nullable',
        fields: [{ name: 'val', type: ['null', 'string'] }],
      };
      const fp = fingerprint(schema);
      expect(fp.length).toBe(8);
    });
  });
});
