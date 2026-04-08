/**
 * WebSocket Transport
 *
 * Wraps the native WebSocket with Avro binary framing.
 *
 * Wire frame per message:
 *   [1 byte: message-type length N]
 *   [N bytes: UTF-8 message type string]
 *   [8 bytes: schema fingerprint]
 *   [rest: Avro binary data]
 *
 * This allows multiplexing different message types over a single socket.
 */

import type { SchemaRegistry } from '../schema/registry.js';
import type { DebugLogger } from '../debug/index.js';
import { inferSchema } from '../schema/inference.js';
import { encode, decode } from '../codec/index.js';
import { CodecError } from '../errors/index.js';

type MessageHandler = (data: Record<string, unknown>) => void;
type VoidHandler = () => void;
type ErrorHandler = (error: Error) => void;
type CloseHandler = (code: number, reason: string) => void;

export interface AvroSocketConfig {
  readonly url: string;
  readonly registry: SchemaRegistry;
  readonly debug: DebugLogger;
  readonly autoInfer: boolean;
  readonly protocols?: string | string[];
}

export class AvroSocket {
  private _ws: WebSocket | null = null;
  private readonly _config: AvroSocketConfig;

  private readonly _messageHandlers = new Map<string, Set<MessageHandler>>();
  private readonly _openHandlers = new Set<VoidHandler>();
  private readonly _closeHandlers = new Set<CloseHandler>();
  private readonly _errorHandlers = new Set<ErrorHandler>();

  constructor(config: AvroSocketConfig) {
    this._config = config;
  }

  /**
   * Open the WebSocket connection.
   */
  connect(): void {
    const ws = new WebSocket(this._config.url, this._config.protocols);
    ws.binaryType = 'arraybuffer';

    ws.addEventListener('open', () => {
      for (const handler of this._openHandlers) handler();
    });

    ws.addEventListener('close', (event) => {
      for (const handler of this._closeHandlers) handler(event.code, event.reason);
    });

    ws.addEventListener('error', () => {
      const error = new CodecError('WebSocket connection error');
      for (const handler of this._errorHandlers) handler(error);
    });

    ws.addEventListener('message', (event: MessageEvent) => {
      this._handleIncoming(event.data as ArrayBuffer);
    });

    this._ws = ws;
  }

  /**
   * Send a typed message over the socket.
   */
  send(messageType: string, data: Record<string, unknown>): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new CodecError('WebSocket is not connected.');
    }

    const schemaKey = `ws:${messageType}`;
    let entry = this._config.registry.getByKey(schemaKey);

    if (!entry) {
      if (!this._config.autoInfer) {
        throw new CodecError(
          `No schema registered for message type "${messageType}" and autoInfer is disabled.`,
        );
      }
      const schema = inferSchema(data, `${messageType}Message`);
      this._config.registry.register(schema, schemaKey);
      entry = this._config.registry.getByKey(schemaKey);
      if (!entry) {
        throw new CodecError(`Failed to register schema for "${messageType}".`);
      }
    }

    const binary = encode(entry, data);
    const typeBytes = new TextEncoder().encode(messageType);

    if (typeBytes.length > 255) {
      throw new CodecError(
        `Message type "${messageType}" exceeds 255 bytes when UTF-8 encoded.`,
      );
    }

    // Frame: [1 type-len][N type][8 fp][data]
    const frame = new Uint8Array(1 + typeBytes.length + 8 + binary.length);
    frame[0] = typeBytes.length;
    frame.set(typeBytes, 1);
    frame.set(entry.fingerprint, 1 + typeBytes.length);
    frame.set(binary, 1 + typeBytes.length + 8);

    this._ws.send(frame.buffer);

    this._config.debug.log('outgoing', `ws://${messageType}`, entry.schema.name, data, binary.length);
  }

  /**
   * Register a handler for a specific message type.
   */
  on(event: 'open', handler: VoidHandler): void;
  on(event: 'close', handler: CloseHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(event: string, handler: MessageHandler): void;
  on(
    event: string,
    handler: VoidHandler | CloseHandler | ErrorHandler | MessageHandler,
  ): void {
    switch (event) {
      case 'open':
        this._openHandlers.add(handler as VoidHandler);
        break;
      case 'close':
        this._closeHandlers.add(handler as CloseHandler);
        break;
      case 'error':
        this._errorHandlers.add(handler as ErrorHandler);
        break;
      default: {
        let handlers = this._messageHandlers.get(event);
        if (!handlers) {
          handlers = new Set();
          this._messageHandlers.set(event, handlers);
        }
        handlers.add(handler as MessageHandler);
      }
    }
  }

  /**
   * Remove a handler.
   */
  off(event: 'open', handler: VoidHandler): void;
  off(event: 'close', handler: CloseHandler): void;
  off(event: 'error', handler: ErrorHandler): void;
  off(event: string, handler: MessageHandler): void;
  off(
    event: string,
    handler: VoidHandler | CloseHandler | ErrorHandler | MessageHandler,
  ): void {
    switch (event) {
      case 'open':
        this._openHandlers.delete(handler as VoidHandler);
        break;
      case 'close':
        this._closeHandlers.delete(handler as CloseHandler);
        break;
      case 'error':
        this._errorHandlers.delete(handler as ErrorHandler);
        break;
      default:
        this._messageHandlers.get(event)?.delete(handler as MessageHandler);
    }
  }

  /**
   * Close the socket.
   */
  close(code?: number, reason?: string): void {
    this._ws?.close(code, reason);
  }

  get readyState(): number {
    return this._ws?.readyState ?? WebSocket.CLOSED;
  }

  // ── Private ────────────────────────────────────────────────────────

  private _handleIncoming(buffer: ArrayBuffer): void {
    try {
      const frame = new Uint8Array(buffer);
      if (frame.length < 10) {
        // 1 (type-len) + 1 (min type) + 8 (fp) = 10 minimum
        throw new CodecError(`Invalid WS frame: too short (${frame.length} bytes)`);
      }

      const typeLen = frame[0]!;
      const typeBytes = frame.slice(1, 1 + typeLen);
      const messageType = new TextDecoder().decode(typeBytes);

      const fp = frame.slice(1 + typeLen, 1 + typeLen + 8);
      const data = frame.slice(1 + typeLen + 8);

      const entry = this._config.registry.getByFingerprint(fp);
      const decoded = decode(entry, data);

      this._config.debug.log('incoming', `ws://${messageType}`, entry.schema.name, decoded, data.length);

      const handlers = this._messageHandlers.get(messageType);
      if (handlers) {
        for (const handler of handlers) handler(decoded);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new CodecError(String(err));
      for (const handler of this._errorHandlers) handler(error);
    }
  }
}
