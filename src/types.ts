/**
 * Core type definitions for AvroStream JS.
 *
 * These types are the public API surface — they define how consumers
 * configure and interact with the library.
 */

/** Avro schema types supported by the inference engine. */
export type AvroSchemaType =
  | 'null'
  | 'boolean'
  | 'int'
  | 'long'
  | 'float'
  | 'double'
  | 'string'
  | 'bytes'
  | AvroRecordSchema
  | AvroArraySchema
  | AvroMapSchema
  | AvroUnionSchema;

export interface AvroField {
  readonly name: string;
  readonly type: AvroSchemaType;
  readonly default?: unknown;
}

export interface AvroRecordSchema {
  readonly type: 'record';
  readonly name: string;
  readonly namespace?: string;
  readonly fields: readonly AvroField[];
}

export interface AvroArraySchema {
  readonly type: 'array';
  readonly items: AvroSchemaType;
}

export interface AvroMapSchema {
  readonly type: 'map';
  readonly values: AvroSchemaType;
}

export type AvroUnionSchema = readonly AvroSchemaType[];

/** 8-byte CRC-64 fingerprint used to identify schemas on the wire. */
export type SchemaFingerprint = Uint8Array;

/** Reconnection behaviour for AvroSocket. */
export interface ReconnectOptions {
  /** Maximum number of reconnect attempts. -1 means infinite. Default: 10. */
  readonly maxAttempts?: number;
  /** Initial delay between reconnect attempts in milliseconds. Default: 500. */
  readonly initialDelayMs?: number;
  /** Maximum delay between reconnect attempts in milliseconds. Default: 30000. */
  readonly maxDelayMs?: number;
  /** Add random jitter to the reconnect delay. Default: true. */
  readonly jitter?: boolean;
}

/** Options for `AvroClient.connectSocket()`. */
export interface ConnectSocketOptions {
  readonly protocols?: string | string[];
  readonly reconnect?: boolean;
  readonly reconnectOptions?: ReconnectOptions;
}

/** Configuration for the AvroClient. */
export interface AvroClientConfig {
  /** Base URL for all HTTP requests. */
  readonly endpoint: string;

  /** Enable console logging of decoded payloads and byte-savings metrics. */
  readonly debug?: boolean;

  /** Automatically infer Avro schemas from JS objects when no schema is registered. */
  readonly autoInfer?: boolean;

  /** Enable offline queueing via IndexedDB for PWA support. */
  readonly offline?: boolean;

  /**
   * Pre-compiled schema manifest (from avro-gen CLI).
   * Keys are path/message-type identifiers, values are Avro record schemas.
   */
  readonly schemas?: Readonly<Record<string, AvroRecordSchema>>;

  /**
   * Custom fetch implementation (useful for testing or polyfills).
   * Defaults to globalThis.fetch.
   */
  readonly fetch?: typeof globalThis.fetch;

  /**
   * Custom network listener strategy for environment-specific online detection.
   * Defaults to BrowserNetworkListener in browser contexts and NodeNetworkListener in Node.js.
   */
  readonly networkListener?: NetworkListener;

  /**
   * Runtime schema inference safety limits.
   */
  readonly inference?: InferenceConfig;

  /**
   * Optional callback invoked after every encode/decode with byte-savings metrics.
   * Fires regardless of the `debug` flag — useful for telemetry pipelines.
   */
  readonly onMetrics?: (metrics: import('./debug/index.js').DebugMetrics) => void;
}

/** Options for a single fetch call, mirroring RequestInit. */
export interface AvroFetchOptions {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: Record<string, unknown>;
  readonly signal?: AbortSignal;
}

/** Runtime safeguards for synchronous schema inference. */
export interface InferenceConfig {
  /** Maximum recursive object depth permitted during inference. */
  readonly maxDepth?: number;
  /** Maximum traversed nodes permitted during inference. */
  readonly maxNodes?: number;
}

/** Strategy interface for online/offline detection across environments. */
export interface NetworkListener {
  /** Returns the current connectivity state. */
  isOnline(): boolean;
  /** Subscribe to transitions from offline to online. Returns unsubscribe fn. */
  onOnline(listener: () => void): () => void;
  /** Optional lifecycle cleanup. */
  destroy?(): void;
}

/** Internal representation of an encoded wire payload. */
export interface WirePayload {
  /** 8-byte schema fingerprint. */
  readonly fingerprint: SchemaFingerprint;
  /** Avro-encoded binary data. */
  readonly data: Uint8Array;
}

/** Event handler types for the AvroSocket. */
export type AvroSocketEventHandler =
  | { type: 'open'; handler: () => void }
  | { type: 'close'; handler: (code: number, reason: string) => void }
  | { type: 'error'; handler: (error: Error) => void }
  | { type: 'message'; handler: (data: Record<string, unknown>) => void };

/** Stored offline request for later transmission. */
export interface OfflineEntry {
  readonly id: string;
  readonly path: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly fingerprint: Uint8Array;
  readonly data: Uint8Array;
  readonly timestamp: number;
}
