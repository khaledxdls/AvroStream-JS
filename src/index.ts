/**
 * AvroStream JS — Public API surface.
 *
 * @packageDocumentation
 */

// Main client
export { AvroClient } from './client.js';

// Types (re-export everything consumers need)
export type {
  AvroClientConfig,
  AvroFetchOptions,
  AvroRecordSchema,
  AvroField,
  AvroSchemaType,
  AvroArraySchema,
  AvroMapSchema,
  AvroUnionSchema,
  AvroSocketEventHandler,
  SchemaFingerprint,
  WirePayload,
  OfflineEntry,
  InferenceConfig,
  NetworkListener,
} from './types.js';

// Errors (all exported so consumers can catch specific subclasses)
export {
  AvroStreamError,
  AvroCircularReferenceError,
  SchemaValidationError,
  SchemaNotFoundError,
  SchemaNegotiationError,
  CodecError,
  InferenceError,
} from './errors/index.js';

// Schema utilities (advanced / power-user)
export { SchemaRegistry } from './schema/registry.js';
export { inferSchema } from './schema/inference.js';
export { fingerprint, fingerprintToHex } from './schema/fingerprint.js';

// Codec (advanced)
export {
  encode,
  decode,
  frameForWire,
  parseWireFrame,
  resolveToReaderSchema,
} from './codec/index.js';

// Network strategy
export {
  BrowserNetworkListener,
  NodeNetworkListener,
  createDefaultNetworkListener,
} from './network/index.js';

// Transport (advanced)
export { AvroSocket } from './transport/websocket.js';
export { AvroStream } from './transport/stream.js';

// Debug
export { DebugLogger } from './debug/index.js';
