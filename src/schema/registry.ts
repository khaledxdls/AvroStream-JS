/**
 * Schema Registry
 *
 * Thread-safe, in-memory cache that maps schema fingerprints to their
 * compiled avsc Type objects and JSON definitions.  Also stores a
 * reverse lookup from a "schema key" (e.g. endpoint path) to fingerprint.
 */

import type { AvroRecordSchema, SchemaFingerprint } from '../types.js';
import { fingerprint, fingerprintToHex } from './fingerprint.js';
import { SchemaNotFoundError } from '../errors/index.js';
import avsc from 'avsc';

export interface RegistryEntry {
  readonly schema: AvroRecordSchema;
  readonly type: avsc.Type;
  readonly fingerprint: Uint8Array;
}

export class SchemaRegistry {
  /** fingerprint hex → entry */
  private readonly _entries = new Map<string, RegistryEntry>();

  /** logical key (path / message type) → fingerprint hex */
  private readonly _keyIndex = new Map<string, string>();

  /**
   * Register a schema.  Returns the fingerprint.
   */
  register(schema: AvroRecordSchema, key?: string): Uint8Array {
    const fp = fingerprint(schema);
    const hex = fingerprintToHex(fp);

    if (!this._entries.has(hex)) {
      const type = avsc.Type.forSchema(schema as avsc.Schema);
      this._entries.set(hex, { schema, type, fingerprint: fp });
    }

    if (key) {
      this._keyIndex.set(key, hex);
    }

    return fp;
  }

  /**
   * Retrieve an entry by its fingerprint bytes.
   */
  getByFingerprint(fp: Uint8Array): RegistryEntry {
    const hex = fingerprintToHex(fp);
    const entry = this._entries.get(hex);
    if (!entry) {
      throw new SchemaNotFoundError(hex);
    }
    return entry;
  }

  /**
   * Retrieve an entry by its logical key (e.g. '/users').
   */
  getByKey(key: string): RegistryEntry | undefined {
    const hex = this._keyIndex.get(key);
    if (!hex) return undefined;
    return this._entries.get(hex);
  }

  /**
   * Check whether a fingerprint is known.
   */
  has(fp: Uint8Array): boolean {
    return this._entries.has(fingerprintToHex(fp));
  }

  /**
   * Number of registered schemas.
   */
  get size(): number {
    return this._entries.size;
  }

  /**
   * Remove all entries.
   */
  clear(): void {
    this._entries.clear();
    this._keyIndex.clear();
  }
}
