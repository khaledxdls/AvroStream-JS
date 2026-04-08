import { describe, it, expect } from 'vitest';
import {
  AvroStreamError,
  AvroCircularReferenceError,
  SchemaValidationError,
  SchemaNotFoundError,
  SchemaNegotiationError,
  CodecError,
  InferenceError,
} from '../errors/index.js';

describe('Error hierarchy', () => {
  it('all errors are instances of AvroStreamError', () => {
    const errors = [
      new AvroCircularReferenceError('a.b'),
      new SchemaValidationError('missing field'),
      new SchemaNotFoundError('abc123'),
      new SchemaNegotiationError(406),
      new CodecError('codec failure'),
      new InferenceError('a.b', Symbol()),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(AvroStreamError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('AvroCircularReferenceError contains the path', () => {
    const err = new AvroCircularReferenceError('user.manager');
    expect(err.path).toBe('user.manager');
    expect(err.message).toContain('user.manager');
    expect(err.name).toBe('AvroCircularReferenceError');
  });

  it('SchemaValidationError includes schema name and field path', () => {
    const err = new SchemaValidationError('wrong type', 'User', 'email');
    expect(err.schemaName).toBe('User');
    expect(err.fieldPath).toBe('email');
    expect(err.message).toContain('User');
    expect(err.message).toContain('email');
  });

  it('SchemaNotFoundError includes fingerprint', () => {
    const err = new SchemaNotFoundError('deadbeef');
    expect(err.fingerprint).toBe('deadbeef');
  });

  it('SchemaNegotiationError includes status code', () => {
    const err = new SchemaNegotiationError(406);
    expect(err.statusCode).toBe(406);
  });

  it('InferenceError includes path and value', () => {
    const sym = Symbol('x');
    const err = new InferenceError('obj.field', sym);
    expect(err.path).toBe('obj.field');
    expect(err.value).toBe(sym);
  });
});
