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
  ConnectSocketOptions,
} from './types.js';
import { SchemaRegistry } from './schema/index.js';
import { FetchTransport } from './transport/fetch.js';
import { AvroSocket } from './transport/websocket.js';
import { createAvroStream } from './transport/stream.js';
import type { AvroStream } from './transport/stream.js';
import { DebugLogger } from './debug/index.js';
import { OfflineQueue } from './offline/index.js';
import { encode, frameForWire, resolveToReaderSchema, WIRE_VERSION_STANDARD } from './codec/index.js';
import { fingerprintToHex } from './schema/fingerprint.js';
import { createDefaultNetworkListener } from './network/index.js';
import type { NetworkListener } from './types.js';

export class AvroClient {
  private readonly _config: Required<
    Pick<AvroClientConfig, 'endpoint' | 'debug' | 'autoInfer' | 'offline'>
  >;
  private readonly _fetchImpl: typeof globalThis.fetch;
  private readonly _registry: SchemaRegistry;
  private readonly _debugLogger: DebugLogger;
  private readonly _fetchTransport: FetchTransport;
  private readonly _offlineQueue: OfflineQueue | null;
  private readonly _networkListener: NetworkListener;

  private readonly _inferenceConfig: Required<
    Pick<NonNullable<AvroClientConfig['inference']>, 'maxDepth' | 'maxNodes'>
  >;

  private _onlineUnsubscribe: (() => void) | null = null;

  constructor(config: AvroClientConfig) {
    this._config = {
      endpoint: stripTrailingSlashes(config.endpoint),
      debug: config.debug ?? false,
      autoInfer: config.autoInfer ?? true,
      offline: config.offline ?? false,
    };
    this._inferenceConfig = {
      maxDepth: config.inference?.maxDepth ?? 32,
      maxNodes: config.inference?.maxNodes ?? 50_000,
    };

    this._fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this._networkListener =
      config.networkListener ?? createDefaultNetworkListener(this._config.endpoint);
    this._registry = new SchemaRegistry({
      maxSize: config.registryMaxSize,
    });
    this._debugLogger = new DebugLogger(this._config.debug, config.onMetrics);

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
      inference: this._inferenceConfig,
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
    const requestOptions = cloneFetchOptions(options);

    // If offline and queue is enabled, queue the request.
    if (this._offlineQueue && !this._networkListener.isOnline() && requestOptions?.body) {
      await this._enqueueOffline(path, requestOptions);
      return { __queued: true, __path: path };
    }

    return this._fetchTransport.fetch(path, requestOptions);
  }

  /**
   * Open a binary WebSocket connection.
   */
  connectSocket(
    url: string,
    options?: ConnectSocketOptions,
  ): AvroSocket {
    const socket = new AvroSocket({
      url,
      registry: this._registry,
      debug: this._debugLogger,
      autoInfer: this._config.autoInfer,
      protocols: options?.protocols,
      inference: this._inferenceConfig,
      reconnect: options?.reconnect,
      reconnectOptions: options?.reconnectOptions,
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
    this._onlineUnsubscribe?.();
    this._onlineUnsubscribe = null;
    this._networkListener.destroy?.();
  }

  // ── Private ────────────────────────────────────────────────────────

  private async _initOffline(): Promise<void> {
    if (!this._offlineQueue) return;

    await this._offlineQueue.open();

    this._offlineQueue.onFlush(async (entry) => {
      try {
        const wireBody = new Uint8Array(1 + 8 + entry.data.length);
        wireBody[0] = WIRE_VERSION_STANDARD;
        const latest = this._registry.getByKey(entry.path);

        if (latest && !buffersEqual(latest.fingerprint, entry.fingerprint)) {
          try {
            const writer = this._registry.getByFingerprint(entry.fingerprint);
            const reencoded = resolveToReaderSchema(writer, latest, entry.data);
            wireBody.set(latest.fingerprint, 1);
            wireBody.set(reencoded, 9);
          } catch {
            wireBody.set(entry.fingerprint, 1);
            wireBody.set(entry.data, 9);
          }
        } else {
          wireBody.set(entry.fingerprint, 1);
          wireBody.set(entry.data, 9);
        }

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
    this._onlineUnsubscribe = this._networkListener.onOnline(() => {
      void this._offlineQueue?.flush();
    });

    // Try an immediate flush in case we're online with pending entries.
    if (this._networkListener.isOnline()) {
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
      const schema = inferSchema(options.body, undefined, this._inferenceConfig);
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

function cloneFetchOptions(options?: AvroFetchOptions): AvroFetchOptions | undefined {
  if (!options) return undefined;

  return {
    method: options.method,
    signal: options.signal,
    body: options.body,   // no structuredClone — avsc never mutates the input
    headers: options.headers ? { ...options.headers } : undefined,
  };
}

function stripTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 0x2f /* '/' */) {
    end--;
  }
  return end === url.length ? url : url.slice(0, end);
}

function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}
