/**
 * Schema Inference Engine
 *
 * Scans a plain JavaScript object and produces an Avro record schema.
 * Handles nested objects, arrays, maps, nullables (via unions), and
 * detects circular references via a WeakSet tracker.
 */

import type { AvroField, AvroRecordSchema, AvroSchemaType } from '../types.js';
import { AvroCircularReferenceError, InferenceError } from '../errors/index.js';

let recordCounter = 0;

/** Reset the internal counter (useful in tests). */
export function resetInferenceCounter(): void {
  recordCounter = 0;
}

/**
 * Infer an Avro record schema from a plain JS object.
 *
 * @param obj  - The object to inspect.
 * @param name - Name of the root record (defaults to 'AutoRecord_N').
 */
export function inferSchema(
  obj: Record<string, unknown>,
  name?: string,
): AvroRecordSchema {
  const seen = new WeakSet<object>();
  return inferRecord(obj, name ?? `AutoRecord_${recordCounter++}`, '', seen);
}

function inferRecord(
  obj: Record<string, unknown>,
  name: string,
  parentPath: string,
  seen: WeakSet<object>,
): AvroRecordSchema {
  if (seen.has(obj)) {
    throw new AvroCircularReferenceError(parentPath || name);
  }
  seen.add(obj);

  const fields: AvroField[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = parentPath ? `${parentPath}.${key}` : key;
    const type = inferType(value, key, fieldPath, seen);
    fields.push({ name: key, type });
  }

  seen.delete(obj);
  return { type: 'record', name, fields };
}

function inferType(
  value: unknown,
  fieldName: string,
  path: string,
  seen: WeakSet<object>,
): AvroSchemaType {
  if (value === null || value === undefined) {
    // Nullable — we default to nullable string since we can't know the real type.
    return ['null', 'string'];
  }

  switch (typeof value) {
    case 'boolean':
      return 'boolean';

    case 'number':
      return Number.isInteger(value) ? 'int' : 'double';

    case 'bigint':
      return 'long';

    case 'string':
      return 'string';

    case 'object': {
      if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
        return 'bytes';
      }

      if (Array.isArray(value)) {
        return inferArrayType(value, fieldName, path, seen);
      }

      // Plain object → nested record
      return inferRecord(
        value as Record<string, unknown>,
        `${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}Record`,
        path,
        seen,
      );
    }

    default:
      throw new InferenceError(path, value);
  }
}

function inferArrayType(
  arr: unknown[],
  fieldName: string,
  path: string,
  seen: WeakSet<object>,
): AvroSchemaType {
  if (arr.length === 0) {
    // Empty array — default to array of strings.
    return { type: 'array', items: 'string' };
  }

  // Infer from the first element.
  const items = inferType(arr[0], `${fieldName}Item`, `${path}[0]`, seen);
  return { type: 'array', items };
}
