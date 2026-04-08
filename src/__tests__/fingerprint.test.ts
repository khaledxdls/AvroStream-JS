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
});
