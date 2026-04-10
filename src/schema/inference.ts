/**
 * Schema Inference Engine
 *
 * Scans a plain JavaScript object and produces an Avro record schema.
 * Handles nested objects, arrays, maps, nullables (via unions), and
 * detects circular references via a WeakSet tracker.
 */

import type { AvroField, AvroRecordSchema, AvroSchemaType } from '../types.js';
import { AvroCircularReferenceError, InferenceError } from '../errors/index.js';

interface InferenceState {
  readonly seen: WeakSet<object>;
  readonly maxDepth: number;
  readonly maxNodes: number;
  nodesVisited: number;
}

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
  options?: {
    readonly maxDepth?: number;
    readonly maxNodes?: number;
  },
): AvroRecordSchema {
  const state: InferenceState = {
    seen: new WeakSet<object>(),
    maxDepth: options?.maxDepth ?? 32,
    maxNodes: options?.maxNodes ?? 50_000,
    nodesVisited: 0,
  };

  return inferRecord(obj, name ?? `AutoRecord_${recordCounter++}`, '', 0, state);
}

function inferRecord(
  obj: Record<string, unknown>,
  name: string,
  parentPath: string,
  depth: number,
  state: InferenceState,
): AvroRecordSchema {
  if (state.seen.has(obj)) {
    throw new AvroCircularReferenceError(parentPath || name);
  }
  enforceInferenceLimits(parentPath || name, depth, state);
  state.seen.add(obj);

  const fields: AvroField[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = parentPath ? `${parentPath}.${key}` : key;
    const type = inferType(value, key, fieldPath, depth + 1, state);
    fields.push({ name: key, type });
  }

  state.seen.delete(obj);
  return { type: 'record', name, fields };
}

function inferType(
  value: unknown,
  fieldName: string,
  path: string,
  depth: number,
  state: InferenceState,
): AvroSchemaType {
  enforceInferenceLimits(path, depth, state);

  if (value === null || value === undefined) {
    // Nullable — we default to nullable string since we can't know the real type.
    return ['null', 'string'];
  }

  switch (typeof value) {
    case 'boolean':
      return 'boolean';

    case 'number':
      if (!Number.isInteger(value)) return 'double';
      if (value >= -2147483648 && value <= 2147483647) return 'int';
      return 'long';

    case 'bigint':
      return 'long';

    case 'string':
      return 'string';

    case 'object': {
      if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
        return 'bytes';
      }

      if (Array.isArray(value)) {
        return inferArrayType(value, fieldName, path, depth + 1, state);
      }

      // Plain object → nested record
      return inferRecord(
        value as Record<string, unknown>,
        `${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}Record`,
        path,
        depth + 1,
        state,
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
  depth: number,
  state: InferenceState,
): AvroSchemaType {
  enforceInferenceLimits(path, depth, state);

  if (arr.length === 0) {
    // Empty array — default to array of strings.
    return { type: 'array', items: 'string' };
  }

  // Infer from the first element.
  const items = inferType(arr[0], `${fieldName}Item`, `${path}[0]`, depth + 1, state);
  return { type: 'array', items };
}

function enforceInferenceLimits(
  path: string,
  depth: number,
  state: InferenceState,
): void {
  state.nodesVisited++;

  if (depth > state.maxDepth) {
    throw new InferenceError(
      path,
      `Maximum inference depth exceeded (${state.maxDepth}). ` +
        'Use precompiled schemas from avro-gen for large payloads.',
    );
  }

  if (state.nodesVisited > state.maxNodes) {
    throw new InferenceError(
      path,
      `Maximum inference node limit exceeded (${state.maxNodes}). ` +
        'Use precompiled schemas from avro-gen or infer in a worker thread.',
    );
  }
}
