import { describe, it, expect, beforeEach } from 'vitest';
import { inferSchema, resetInferenceCounter } from '../schema/inference.js';
import { AvroCircularReferenceError, InferenceError } from '../errors/index.js';

describe('Schema Inference', () => {
  beforeEach(() => {
    resetInferenceCounter();
  });

  it('infers a flat object with primitive types', () => {
    const schema = inferSchema({ name: 'Alice', age: 30, active: true });

    expect(schema.type).toBe('record');
    expect(schema.fields).toHaveLength(3);
    expect(schema.fields[0]).toEqual({ name: 'name', type: 'string' });
    expect(schema.fields[1]).toEqual({ name: 'age', type: 'int' });
    expect(schema.fields[2]).toEqual({ name: 'active', type: 'boolean' });
  });

  it('infers double for non-integer numbers', () => {
    const schema = inferSchema({ temperature: 36.6 });
    expect(schema.fields[0]!.type).toBe('double');
  });

  it('infers long for bigint values', () => {
    const schema = inferSchema({ big: BigInt(9007199254740991) });
    expect(schema.fields[0]!.type).toBe('long');
  });

  it('infers nullable union for null values', () => {
    const schema = inferSchema({ missing: null });
    expect(schema.fields[0]!.type).toEqual(['null', 'string']);
  });

  it('infers nullable union for undefined values', () => {
    const schema = inferSchema({ undef: undefined });
    expect(schema.fields[0]!.type).toEqual(['null', 'string']);
  });

  it('infers nested records', () => {
    const schema = inferSchema({
      user: { name: 'Alice', email: 'alice@example.com' },
    });
    const nestedType = schema.fields[0]!.type;
    expect(nestedType).toMatchObject({
      type: 'record',
      name: 'UserRecord',
      fields: [
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' },
      ],
    });
  });

  it('infers array types from the first element', () => {
    const schema = inferSchema({ tags: ['a', 'b'] });
    expect(schema.fields[0]!.type).toEqual({ type: 'array', items: 'string' });
  });

  it('defaults empty arrays to array of strings', () => {
    const schema = inferSchema({ items: [] });
    expect(schema.fields[0]!.type).toEqual({ type: 'array', items: 'string' });
  });

  it('infers bytes for Uint8Array values', () => {
    const schema = inferSchema({ data: new Uint8Array([1, 2, 3]) });
    expect(schema.fields[0]!.type).toBe('bytes');
  });

  it('uses the provided name', () => {
    const schema = inferSchema({ x: 1 }, 'MyRecord');
    expect(schema.name).toBe('MyRecord');
  });

  it('auto-generates unique names', () => {
    const a = inferSchema({ x: 1 });
    const b = inferSchema({ y: 2 });
    expect(a.name).toBe('AutoRecord_0');
    expect(b.name).toBe('AutoRecord_1');
  });

  it('throws AvroCircularReferenceError on circular refs', () => {
    const obj: Record<string, unknown> = { name: 'root' };
    obj['self'] = obj;

    expect(() => inferSchema(obj)).toThrow(AvroCircularReferenceError);
  });

  it('throws InferenceError for symbols', () => {
    const obj = { s: Symbol('test') };
    expect(() => inferSchema(obj as unknown as Record<string, unknown>)).toThrow(
      InferenceError,
    );
  });
});
