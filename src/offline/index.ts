/**
 * Offline Queue
 *
 * Stores encoded binary payloads in IndexedDB when the device is offline.
 * When connectivity returns, the queue is flushed in order.
 *
 * This module is environment-aware: it is a no-op in non-browser contexts
 * where IndexedDB is unavailable.
 */

import type { OfflineEntry } from '../types.js';
import { fingerprintToHex } from '../schema/fingerprint.js';
import { CodecError } from '../errors/index.js';

const DB_NAME = 'avrostream_offline';
const STORE_NAME = 'queue';
const DB_VERSION = 1;

export class OfflineQueue {
  private _db: IDBDatabase | null = null;
  private _flushing = false;
  private _flushCallback:
    | ((entry: OfflineEntry) => Promise<boolean>)
    | null = null;

  /**
   * Open the IndexedDB database.  Must be called before enqueue/flush.
   */
  async open(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      return; // No IndexedDB — silently degrade.
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this._db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(new CodecError(`Failed to open IndexedDB: ${String(request.error)}`));
      };
    });
  }

  /**
   * Store a binary payload for later transmission.
   */
  async enqueue(
    path: string,
    method: string,
    headers: Record<string, string>,
    fingerprint: Uint8Array,
    data: Uint8Array,
  ): Promise<void> {
    if (!this._db) return;

    const entry: OfflineEntry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      path,
      method,
      headers,
      fingerprint: new Uint8Array(fingerprint),
      data: new Uint8Array(data),
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(entry);

      request.onsuccess = () => { resolve(); };
      request.onerror = () => {
        reject(new CodecError(`Failed to enqueue offline entry: ${String(request.error)}`));
      };
    });
  }

  /**
   * Register a callback that is invoked for each queued entry during flush.
   * The callback should return `true` if the entry was successfully sent.
   */
  onFlush(callback: (entry: OfflineEntry) => Promise<boolean>): void {
    this._flushCallback = callback;
  }

  /**
   * Flush all queued entries in FIFO order.
   * Failed entries remain in the queue.
   */
  async flush(): Promise<number> {
    if (!this._db || this._flushing || !this._flushCallback) return 0;

    this._flushing = true;
    let flushed = 0;

    try {
      const entries = await this._getAll();

      for (const entry of entries) {
        const ok = await this._flushCallback(entry);
        if (ok) {
          await this._delete(entry.id);
          flushed++;
        } else {
          break; // Stop on first failure to maintain ordering.
        }
      }
    } finally {
      this._flushing = false;
    }

    return flushed;
  }

  /**
   * Number of entries currently queued.
   */
  async count(): Promise<number> {
    if (!this._db) return 0;

    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => { resolve(request.result); };
      request.onerror = () => { reject(new CodecError('Count failed')); };
    });
  }

  /**
   * Remove all queued entries.
   */
  async clear(): Promise<void> {
    if (!this._db) return;

    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => { resolve(); };
      request.onerror = () => { reject(new CodecError('Clear failed')); };
    });
  }

  // ── Private ────────────────────────────────────────────────────────

  private async _getAll(): Promise<OfflineEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => { resolve(request.result as OfflineEntry[]); };
      request.onerror = () => { reject(new CodecError('getAll failed')); };
    });
  }

  private async _delete(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => { resolve(); };
      request.onerror = () => { reject(new CodecError('Delete failed')); };
    });
  }
}

/** Utility: is the current environment online? */
export function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return navigator.onLine;
  }
  return true; // Assume online in non-browser environments.
}
