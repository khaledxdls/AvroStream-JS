/**
 * Custom error hierarchy for AvroStream.
 *
 * All errors extend a common base so consumers can catch
 * `AvroStreamError` for blanket handling, or catch specific subclasses.
 */

export class AvroStreamError extends Error {
  override name = 'AvroStreamError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    // Maintain proper prototype chain for instanceof checks.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a circular reference is detected during schema inference
 * or serialization.  The `path` property indicates the object key path
 * where the cycle was found.
 */
export class AvroCircularReferenceError extends AvroStreamError {
  override name = 'AvroCircularReferenceError' as const;

  constructor(
    public readonly path: string,
  ) {
    super(
      `Circular reference detected at path: "${path}". ` +
        'Avro cannot serialize circular structures. ' +
        'Remove the circular reference or exclude the field.',
    );
  }
}

/**
 * Thrown when an object fails validation against its Avro schema
 * (e.g. a required field is missing or has the wrong type).
 */
export class SchemaValidationError extends AvroStreamError {
  override name = 'SchemaValidationError' as const;

  constructor(
    message: string,
    public readonly schemaName?: string,
    public readonly fieldPath?: string,
  ) {
    super(
      `Schema validation failed${schemaName ? ` for "${schemaName}"` : ''}` +
        `${fieldPath ? ` at "${fieldPath}"` : ''}: ${message}`,
    );
  }
}

/**
 * Thrown when the codec cannot find a schema for a given fingerprint.
 */
export class SchemaNotFoundError extends AvroStreamError {
  override name = 'SchemaNotFoundError' as const;

  constructor(public readonly fingerprint: string) {
    super(
      `No schema registered for fingerprint "${fingerprint}". ` +
        'Ensure the schema is registered or enable autoInfer.',
    );
  }
}

/**
 * Thrown when the server responds with 406, indicating it does not
 * recognize the schema ID.  The transport layer catches this internally
 * and retries with the full schema, but if the retry also fails this
 * error surfaces to the caller.
 */
export class SchemaNegotiationError extends AvroStreamError {
  override name = 'SchemaNegotiationError' as const;

  constructor(
    public readonly statusCode: number,
    message?: string,
  ) {
    super(
      message ??
        `Schema negotiation failed (HTTP ${statusCode}). ` +
          'The server could not resolve the schema after retry.',
    );
  }
}

/**
 * Thrown when serialization or deserialization fails at the codec level.
 */
export class CodecError extends AvroStreamError {
  override name = 'CodecError' as const;
}

/**
 * Thrown when the type inference engine encounters a value it cannot
 * map to an Avro primitive (e.g. Symbol, WeakRef).
 */
export class InferenceError extends AvroStreamError {
  override name = 'InferenceError' as const;

  constructor(
    public readonly path: string,
    public readonly value: unknown,
  ) {
    super(
      `Cannot infer Avro type for value at "${path}": ` +
        `${typeof value} is not representable in Avro.`,
    );
  }
}
