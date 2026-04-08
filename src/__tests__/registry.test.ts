import { describe, it, expect } from 'vitest';
import { SchemaRegistry } from '../schema/registry.js';
import { SchemaNotFoundError } from '../errors/index.js';
import type { AvroRecordSchema } from '../types.js';

const testSchema: AvroRecordSchema = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'age', type: 'int' },
  ],
};

describe('SchemaRegistry', () => {
  it('registers a schema and returns a fingerprint', () => {
    const registry = new SchemaRegistry();
    const fp = registry.register(testSchema);
    expect(fp).toBeInstanceOf(Uint8Array);
    expect(fp.length).toBe(8);
  });

  it('retrieves by fingerprint', () => {
    const registry = new SchemaRegistry();
    const fp = registry.register(testSchema);
    const entry = registry.getByFingerprint(fp);
    expect(entry.schema.name).toBe('User');
  });

  it('retrieves by key', () => {
    const registry = new SchemaRegistry();
    registry.register(testSchema, '/users');
    const entry = registry.getByKey('/users');
    expect(entry).toBeDefined();
    expect(entry!.schema.name).toBe('User');
  });

  it('returns undefined for unknown keys', () => {
    const registry = new SchemaRegistry();
    expect(registry.getByKey('/unknown')).toBeUndefined();
  });

  it('throws SchemaNotFoundError for unknown fingerprints', () => {
    const registry = new SchemaRegistry();
    const fake = new Uint8Array(8);
    expect(() => registry.getByFingerprint(fake)).toThrow(SchemaNotFoundError);
  });

  it('has() returns correct boolean', () => {
    const registry = new SchemaRegistry();
    const fp = registry.register(testSchema);
    expect(registry.has(fp)).toBe(true);
    expect(registry.has(new Uint8Array(8))).toBe(false);
  });

  it('deduplicates identical schemas', () => {
    const registry = new SchemaRegistry();
    registry.register(testSchema, '/a');
    registry.register(testSchema, '/b');
    expect(registry.size).toBe(1);
  });

  it('clear() removes all entries', () => {
    const registry = new SchemaRegistry();
    registry.register(testSchema, '/users');
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.getByKey('/users')).toBeUndefined();
  });
});
