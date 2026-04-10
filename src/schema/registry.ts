/**
 * Schema Registry
 *
 * In-memory cache that maps schema fingerprints to their compiled avsc
 * Type objects and JSON definitions.  Also stores a reverse lookup from
 * a "schema key" (e.g. endpoint path) to fingerprint.
 *
 * Supports optional LRU eviction via `maxSize` to bound memory in
 * long-lived processes.  When `maxSize` is unset the registry grows
 * without limit (suitable for short-lived scripts and CLIs).
 */

import type { AvroRecordSchema, SchemaFingerprint } from '../types.js';
import { fingerprint, fingerprintToHex, fingerprintToBigInt } from './fingerprint.js';
import { SchemaNotFoundError } from '../errors/index.js';
import avsc from 'avsc';

export interface RegistryEntry {
  readonly schema: AvroRecordSchema;
  readonly type: avsc.Type;
  readonly fingerprint: Uint8Array;
}

export interface SchemaRegistryOptions {
  /**
   * Maximum number of schemas to keep in the registry.
   * When exceeded, the least-recently-used entry is evicted.
   * Unset or 0 means no limit.
   */
  readonly maxSize?: number;
}

export class SchemaRegistry {
  /** fingerprint bigint → entry (insertion-order = LRU order) */
  private readonly _entries = new Map<bigint, RegistryEntry>();

  /** logical key (path / message type) → fingerprint bigint */
  private readonly _keyIndex = new Map<string, bigint>();

  /** reverse: fingerprint bigint → set of logical keys pointing to it */
  private readonly _reverseKeys = new Map<bigint, Set<string>>();

  private readonly _maxSize: number;

  constructor(options?: SchemaRegistryOptions) {
    this._maxSize = options?.maxSize && options.maxSize > 0 ? options.maxSize : 0;
  }

  /**
   * Register a schema.  Returns the fingerprint.
   */
  register(schema: AvroRecordSchema, key?: string): Uint8Array {
    const fp = fingerprint(schema);
    const id = fingerprintToBigInt(fp);

    if (this._entries.has(id)) {
      // Touch: move to end of insertion order (most recently used).
      this._touch(id);
    } else {
      if (this._maxSize > 0 && this._entries.size >= this._maxSize) {
        this._evictLRU();
      }
      const type = avsc.Type.forSchema(schema as avsc.Schema);
      this._entries.set(id, { schema, type, fingerprint: fp });
    }

    if (key) {
      // Remove key from any previous fingerprint's reverse set.
      const prev = this._keyIndex.get(key);
      if (prev !== undefined && prev !== id) {
        this._reverseKeys.get(prev)?.delete(key);
      }

      this._keyIndex.set(key, id);
      let keys = this._reverseKeys.get(id);
      if (!keys) {
        keys = new Set();
        this._reverseKeys.set(id, keys);
      }
      keys.add(key);
    }

    return fp;
  }

  /**
   * Retrieve an entry by its fingerprint bytes.
   */
  getByFingerprint(fp: Uint8Array): RegistryEntry {
    const id = fingerprintToBigInt(fp);
    const entry = this._entries.get(id);
    if (!entry) {
      throw new SchemaNotFoundError(fingerprintToHex(fp));
    }
    this._touch(id);
    return entry;
  }

  /**
   * Retrieve an entry by its logical key (e.g. '/users').
   */
  getByKey(key: string): RegistryEntry | undefined {
    const id = this._keyIndex.get(key);
    if (id === undefined) return undefined;
    const entry = this._entries.get(id);
    if (entry) this._touch(id);
    return entry;
  }

  /**
   * Check whether a fingerprint is known.
   */
  has(fp: Uint8Array): boolean {
    return this._entries.has(fingerprintToBigInt(fp));
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
    this._reverseKeys.clear();
  }

  // ── LRU internals ──────────────────────────────────────────────────

  /**
   * Move an entry to the end of the Map (most recently used).
   * JS Maps iterate in insertion order — delete + re-set moves to tail.
   */
  private _touch(id: bigint): void {
    if (this._maxSize === 0) return; // No eviction — skip the bookkeeping.
    const entry = this._entries.get(id);
    if (!entry) return;
    this._entries.delete(id);
    this._entries.set(id, entry);
  }

  /**
   * Evict the least-recently-used entry (first in Map iteration order).
   */
  private _evictLRU(): void {
    const oldest = this._entries.keys().next();
    if (oldest.done) return;
    const id = oldest.value;

    this._entries.delete(id);

    // Clean up associated logical keys.
    const keys = this._reverseKeys.get(id);
    if (keys) {
      for (const key of keys) {
        this._keyIndex.delete(key);
      }
      this._reverseKeys.delete(id);
    }
  }
}
