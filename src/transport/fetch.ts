/**
 * Fetch Transport
 *
 * Drop-in binary fetch wrapper that:
 *  1. Serializes request bodies to Avro binary.
 *  2. Injects Content-Type and X-Schema-ID headers.
 *  3. Handles 406 schema-negotiation retries transparently.
 *  4. Deserializes Avro binary responses back to JS objects.
 */

import type { AvroFetchOptions, AvroRecordSchema } from '../types.js';
import type { SchemaRegistry } from '../schema/registry.js';
import type { DebugLogger } from '../debug/index.js';
import { inferSchema } from '../schema/inference.js';
import { encode, decode, frameForWire, parseWireFrame } from '../codec/index.js';
import { fingerprintToHex } from '../schema/fingerprint.js';
import { SchemaNegotiationError, CodecError } from '../errors/index.js';

export interface FetchTransportConfig {
  readonly endpoint: string;
  readonly registry: SchemaRegistry;
  readonly debug: DebugLogger;
  readonly autoInfer: boolean;
  readonly fetchImpl: typeof globalThis.fetch;
  readonly inference?: {
    readonly maxDepth?: number;
    readonly maxNodes?: number;
  };
}

export class FetchTransport {
  private readonly _config: FetchTransportConfig;

  constructor(config: FetchTransportConfig) {
    this._config = config;
  }

  /**
   * Execute a binary-encoded fetch request.
   */
  async fetch(
    path: string,
    options: AvroFetchOptions = {},
  ): Promise<Record<string, unknown>> {
    const safeOptions = cloneFetchOptions(options);
    const url = `${this._config.endpoint}${path}`;
    const method = safeOptions.method?.toUpperCase() ?? 'GET';
    const headers: Record<string, string> = { ...safeOptions.headers };

    let wireBody: Uint8Array | undefined;
    let schemaName = '';

    // ── Encode the request body ──────────────────────────────────────
    if (safeOptions.body && method !== 'GET' && method !== 'HEAD') {
      const { entry, fp } = this._resolveSchema(path, safeOptions.body);
      schemaName = entry.schema.name;
      const binary = encode(entry, safeOptions.body);

      headers['Content-Type'] = 'application/avro';
      headers['X-Schema-ID'] = fingerprintToHex(fp);

      wireBody = frameForWire({ fingerprint: fp, data: binary });

      this._config.debug.log('outgoing', path, schemaName, safeOptions.body, binary.length);
    }

    // ── First attempt ────────────────────────────────────────────────
    const requestInit: RequestInit = {
      method,
      headers,
      signal: safeOptions.signal,
    };
    if (wireBody) {
      requestInit.body = wireBody as unknown as BodyInit;
    }
    let response = await this._config.fetchImpl(url, requestInit);

    // ── Handle 406 negotiation ───────────────────────────────────────
    if (response.status === 406 && response.headers.get('X-Avro-Missing-Schema') === 'true') {
      response = await this._retryWithFullSchema(url, method, headers, safeOptions, path);
    }

    if (!response.ok) {
      throw new SchemaNegotiationError(
        response.status,
        `Request to ${path} failed with status ${response.status}`,
      );
    }

    // ── Decode the response body ─────────────────────────────────────
    return this._decodeResponse(response, path);
  }

  // ── Private helpers ────────────────────────────────────────────────

  private _resolveSchema(
    path: string,
    body: Record<string, unknown>,
  ): { entry: ReturnType<SchemaRegistry['getByFingerprint']>; fp: Uint8Array } {
    const existing = this._config.registry.getByKey(path);
    if (existing) {
      return { entry: existing, fp: existing.fingerprint };
    }

    if (!this._config.autoInfer) {
      throw new CodecError(
        `No schema registered for "${path}" and autoInfer is disabled.`,
      );
    }

    const schema = inferSchema(body, undefined, this._config.inference);
    const fp = this._config.registry.register(schema, path);
    const entry = this._config.registry.getByFingerprint(fp);
    return { entry, fp };
  }

  private async _retryWithFullSchema(
    url: string,
    method: string,
    baseHeaders: Record<string, string>,
    options: AvroFetchOptions,
    path: string,
  ): Promise<Response> {
    if (!options.body) {
      throw new SchemaNegotiationError(406, 'Cannot retry without a body.');
    }

    const { entry, fp } = this._resolveSchema(path, options.body);
    const binary = encode(entry, options.body);
    const schemaJson = JSON.stringify(entry.schema);

    // Build the retry payload: [schema-length (4 bytes)][schema JSON][fingerprint][data]
    const schemaBytes = new TextEncoder().encode(schemaJson);
    const retryPayload = new Uint8Array(
      4 + schemaBytes.length + 8 + binary.length,
    );
    const view = new DataView(retryPayload.buffer);
    view.setUint32(0, schemaBytes.length, false);
    retryPayload.set(schemaBytes, 4);
    retryPayload.set(fp, 4 + schemaBytes.length);
    retryPayload.set(binary, 4 + schemaBytes.length + 8);

    const retryHeaders = {
      ...baseHeaders,
      'Content-Type': 'application/avro',
      'X-Schema-ID': fingerprintToHex(fp),
      'X-Avro-Full-Schema': 'true',
    };

    return this._config.fetchImpl(url, {
      method,
      headers: retryHeaders,
      body: retryPayload,
      signal: options.signal,
    });
  }

  private async _decodeResponse(
    response: Response,
    path: string,
  ): Promise<Record<string, unknown>> {
    const contentType = response.headers.get('Content-Type') ?? '';
    const isAvro = contentType.includes('application/avro');

    if (!isAvro) {
      // Fall back to JSON parsing for non-Avro responses.
      return (await response.json()) as Record<string, unknown>;
    }

    const buffer = await response.arrayBuffer();
    const frame = new Uint8Array(buffer);
    const { fingerprint: fp, data } = parseWireFrame(frame);
    const entry = this._config.registry.getByFingerprint(fp);
    const decoded = decode(entry, data);

    this._config.debug.log('incoming', path, entry.schema.name, decoded, data.length);

    return decoded;
  }
}

function cloneFetchOptions(options: AvroFetchOptions): AvroFetchOptions {
  return {
    method: options.method,
    signal: options.signal,
    headers: options.headers ? { ...options.headers } : undefined,
    body: options.body
      ? (structuredClone(options.body) as Record<string, unknown>)
      : undefined,
  };
}
