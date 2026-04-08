/**
 * AvroClient — Primary public API
 *
 * Composes the schema registry, codec, fetch transport, WebSocket transport,
 * streaming decoder, debug logger, and offline queue into a single cohesive
 * entry point with a clean, minimal surface area.
 */

import type {
  AvroClientConfig,
  AvroFetchOptions,
  AvroRecordSchema,
} from './types.js';
import { SchemaRegistry } from './schema/index.js';
import { FetchTransport } from './transport/fetch.js';
import { AvroSocket } from './transport/websocket.js';
import { createAvroStream } from './transport/stream.js';
import type { AvroStream } from './transport/stream.js';
import { DebugLogger } from './debug/index.js';
import { OfflineQueue, isOnline } from './offline/index.js';
import { encode, frameForWire } from './codec/index.js';
import { fingerprintToHex } from './schema/fingerprint.js';

export class AvroClient {
  private readonly _config: Required<
    Pick<AvroClientConfig, 'endpoint' | 'debug' | 'autoInfer' | 'offline'>
  >;
  private readonly _fetchImpl: typeof globalThis.fetch;
  private readonly _registry: SchemaRegistry;
  private readonly _debugLogger: DebugLogger;
  private readonly _fetchTransport: FetchTransport;
  private readonly _offlineQueue: OfflineQueue | null;

  private _onlineListener: (() => void) | null = null;

  constructor(config: AvroClientConfig) {
    this._config = {
      endpoint: config.endpoint.replace(/\/+$/, ''),
      debug: config.debug ?? false,
      autoInfer: config.autoInfer ?? true,
      offline: config.offline ?? false,
    };

    this._fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this._registry = new SchemaRegistry();
    this._debugLogger = new DebugLogger(this._config.debug);

    // Pre-register any schemas from a manifest.
    if (config.schemas) {
      for (const [key, schema] of Object.entries(config.schemas)) {
        this._registry.register(schema, key);
      }
    }

    this._fetchTransport = new FetchTransport({
      endpoint: this._config.endpoint,
      registry: this._registry,
      debug: this._debugLogger,
      autoInfer: this._config.autoInfer,
      fetchImpl: this._fetchImpl,
    });

    // Offline support
    if (this._config.offline) {
      this._offlineQueue = new OfflineQueue();
      void this._initOffline();
    } else {
      this._offlineQueue = null;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Transparent binary fetch — drop-in replacement for `fetch`.
   * Accepts a plain JS object as body, returns a plain JS object.
   */
  async fetch(
    path: string,
    options?: AvroFetchOptions,
  ): Promise<Record<string, unknown>> {
    // If offline and queue is enabled, queue the request.
    if (this._offlineQueue && !isOnline() && options?.body) {
      await this._enqueueOffline(path, options);
      return { __queued: true, __path: path };
    }

    return this._fetchTransport.fetch(path, options);
  }

  /**
   * Open a binary WebSocket connection.
   */
  connectSocket(
    url: string,
    protocols?: string | string[],
  ): AvroSocket {
    const socket = new AvroSocket({
      url,
      registry: this._registry,
      debug: this._debugLogger,
      autoInfer: this._config.autoInfer,
      protocols,
    });
    socket.connect();
    return socket;
  }

  /**
   * Fetch a large dataset as an async-iterable binary stream.
   * Records are decoded one-by-one, keeping memory usage flat.
   */
  async streamFetch(
    path: string,
    signal?: AbortSignal,
  ): Promise<AvroStream> {
    return createAvroStream(
      {
        registry: this._registry,
        debug: this._debugLogger,
        fetchImpl: this._fetchImpl,
        endpoint: this._config.endpoint,
      },
      path,
      signal,
    );
  }

  /**
   * Manually register a schema for a given path/key.
   */
  registerSchema(schema: AvroRecordSchema, key?: string): Uint8Array {
    return this._registry.register(schema, key);
  }

  /**
   * Access the underlying schema registry (advanced usage).
   */
  get registry(): SchemaRegistry {
    return this._registry;
  }

  /**
   * Tear down the client (remove event listeners, close DB).
   */
  destroy(): void {
    if (this._onlineListener && typeof window !== 'undefined') {
      window.removeEventListener('online', this._onlineListener);
      this._onlineListener = null;
    }
  }

  // ── Private ────────────────────────────────────────────────────────

  private async _initOffline(): Promise<void> {
    if (!this._offlineQueue) return;

    await this._offlineQueue.open();

    this._offlineQueue.onFlush(async (entry) => {
      try {
        const wireBody = new Uint8Array(8 + entry.data.length);
        wireBody.set(entry.fingerprint, 0);
        wireBody.set(entry.data, 8);

        const response = await this._fetchImpl(
          `${this._config.endpoint}${entry.path}`,
          {
            method: entry.method,
            headers: entry.headers,
            body: wireBody as unknown as BodyInit,
          },
        );
        return response.ok;
      } catch {
        return false;
      }
    });

    // Flush when coming back online.
    if (typeof window !== 'undefined') {
      this._onlineListener = () => {
        void this._offlineQueue?.flush();
      };
      window.addEventListener('online', this._onlineListener);
    }

    // Try an immediate flush in case we're online with pending entries.
    if (isOnline()) {
      void this._offlineQueue.flush();
    }
  }

  private async _enqueueOffline(
    path: string,
    options: AvroFetchOptions,
  ): Promise<void> {
    if (!this._offlineQueue || !options.body) return;

    const entry = this._registry.getByKey(path);
    if (!entry && !this._config.autoInfer) return;

    // Resolve schema (may auto-infer).
    const { inferSchema } = await import('./schema/inference.js');
    let resolved = entry;
    if (!resolved) {
      const schema = inferSchema(options.body);
      const fp = this._registry.register(schema, path);
      resolved = this._registry.getByFingerprint(fp);
    }

    const binary = encode(resolved, options.body);

    await this._offlineQueue.enqueue(
      path,
      options.method ?? 'POST',
      {
        ...options.headers,
        'Content-Type': 'application/avro',
        'X-Schema-ID': fingerprintToHex(resolved.fingerprint),
      },
      resolved.fingerprint,
      binary,
    );
  }
}
