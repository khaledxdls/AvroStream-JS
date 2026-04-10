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

  describe('LRU eviction', () => {
    const schemaA: AvroRecordSchema = {
      type: 'record', name: 'A', fields: [{ name: 'x', type: 'int' }],
    };
    const schemaB: AvroRecordSchema = {
      type: 'record', name: 'B', fields: [{ name: 'y', type: 'int' }],
    };
    const schemaC: AvroRecordSchema = {
      type: 'record', name: 'C', fields: [{ name: 'z', type: 'int' }],
    };

    it('evicts least recently used entry when maxSize is exceeded', () => {
      const registry = new SchemaRegistry({ maxSize: 2 });
      const fpA = registry.register(schemaA, '/a');
      registry.register(schemaB, '/b');

      // A is oldest, should be evicted when C is added.
      registry.register(schemaC, '/c');

      expect(registry.size).toBe(2);
      expect(registry.has(fpA)).toBe(false);
      expect(registry.getByKey('/a')).toBeUndefined();
      expect(registry.getByKey('/b')).toBeDefined();
      expect(registry.getByKey('/c')).toBeDefined();
    });

    it('touching via getByFingerprint prevents eviction', () => {
      const registry = new SchemaRegistry({ maxSize: 2 });
      const fpA = registry.register(schemaA, '/a');
      const fpB = registry.register(schemaB, '/b');

      // Touch A — now B is the oldest.
      registry.getByFingerprint(fpA);
      registry.register(schemaC, '/c');

      expect(registry.size).toBe(2);
      expect(registry.has(fpA)).toBe(true);
      expect(registry.has(fpB)).toBe(false);
      expect(registry.getByKey('/b')).toBeUndefined();
    });

    it('touching via getByKey prevents eviction', () => {
      const registry = new SchemaRegistry({ maxSize: 2 });
      registry.register(schemaA, '/a');
      const fpB = registry.register(schemaB, '/b');

      // Touch A via key lookup — now B is oldest.
      registry.getByKey('/a');
      registry.register(schemaC, '/c');

      expect(registry.has(fpB)).toBe(false);
      expect(registry.getByKey('/a')).toBeDefined();
      expect(registry.getByKey('/c')).toBeDefined();
    });

    it('does not evict when maxSize is unset', () => {
      const registry = new SchemaRegistry();
      registry.register(schemaA);
      registry.register(schemaB);
      registry.register(schemaC);
      expect(registry.size).toBe(3);
    });
  });
});
