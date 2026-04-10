/**
 * CRC-64/AVRO schema fingerprinting.
 *
 * Avro specifies a 64-bit Rabin fingerprint for schema identification.
 * This is a pure-JS implementation — no native dependencies required.
 *
 * @see https://avro.apache.org/docs/current/specification/#schema-fingerprints
 */

const EMPTY = 0xc15d213aa4d7a795n;

/**
 * Pre-computed CRC-64/AVRO lookup table (256 entries).
 * Computed once at module load time.
 */
const TABLE: bigint[] = (() => {
  const table: bigint[] = new Array<bigint>(256);
  for (let i = 0; i < 256; i++) {
    let fp = BigInt(i);
    for (let j = 0; j < 8; j++) {
      // eslint-disable-next-line no-bitwise
      fp = (fp >> 1n) ^ (EMPTY & -(fp & 1n));
    }
    table[i] = fp;
  }
  return table;
})();

const textEncoder = new TextEncoder();

/**
 * Compute a 64-bit Rabin fingerprint of the Avro Parsing Canonical Form of a schema.
 * Returns an 8-byte Uint8Array (big-endian).
 *
 * @see https://avro.apache.org/docs/current/specification/#parsing-canonical-form-for-schemas
 */
export function fingerprint(schema: object): Uint8Array {
  const canonical = canonicalize(schema as AvroSchemaNode);
  const bytes = textEncoder.encode(canonical);

  let fp = EMPTY;
  for (const b of bytes) {
    // eslint-disable-next-line no-bitwise
    fp = (fp >> 8n) ^ (TABLE[Number((fp ^ BigInt(b)) & 0xffn)] ?? 0n);
  }

  const result = new Uint8Array(8);
  const view = new DataView(result.buffer);
  view.setBigUint64(0, fp, false); // big-endian
  return result;
}

const HEX_CHARS = '0123456789abcdef';

/**
 * Convert a fingerprint Uint8Array to a hex string for display/logging.
 */
export function fingerprintToHex(fp: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < fp.length; i++) {
    const b = fp[i]!;
    hex += HEX_CHARS[b >> 4]! + HEX_CHARS[b & 0xf]!;
  }
  return hex;
}

/**
 * Convert a fingerprint Uint8Array to a BigInt for use as a Map key.
 * Avoids the overhead of hex string conversion on the hot lookup path.
 */
export function fingerprintToBigInt(fp: Uint8Array): bigint {
  const view = new DataView(fp.buffer, fp.byteOffset, fp.byteLength);
  return view.getBigUint64(0, false);
}

// ── Avro Parsing Canonical Form ──────────────────────────────────────

/**
 * Minimal shape covering the Avro schema types this library supports.
 * Kept internal — callers pass plain objects.
 */
type AvroSchemaNode =
  | string
  | AvroSchemaNode[]
  | {
      readonly type: string;
      readonly name?: string;
      readonly namespace?: string;
      readonly fields?: readonly { readonly name: string; readonly type: AvroSchemaNode; readonly default?: unknown; readonly order?: string; readonly doc?: string; readonly aliases?: readonly string[] }[];
      readonly items?: AvroSchemaNode;
      readonly values?: AvroSchemaNode;
      readonly symbols?: readonly string[];
      readonly size?: number;
      readonly doc?: string;
      readonly aliases?: readonly string[];
    };

/**
 * Produce the Avro Parsing Canonical Form of a schema.
 *
 * Rules (from the spec):
 *  - Primitives → quoted name: `"int"`, `"string"`, …
 *  - Records → `{"name":"<fullname>","type":"record","fields":[<fields>]}`
 *  - Fields  → `{"name":"<name>","type":<type>}`
 *  - Enums   → `{"name":"<fullname>","type":"enum","symbols":[<symbols>]}`
 *  - Arrays  → `{"type":"array","items":<items>}`
 *  - Maps    → `{"type":"map","values":<values>}`
 *  - Unions  → `[<schemas>]`
 *  - Fixed   → `{"name":"<fullname>","type":"fixed","size":<size>}`
 *  - Named types after first definition → just `"<fullname>"`
 *  - Strips: doc, aliases, default, order, namespace (folded into fullname)
 *  - No whitespace
 *
 * @see https://avro.apache.org/docs/current/specification/#parsing-canonical-form-for-schemas
 */
function canonicalize(schema: AvroSchemaNode, seen = new Set<string>()): string {
  // Primitive type names
  if (typeof schema === 'string') {
    return `"${schema}"`;
  }

  // Union (array of schemas)
  if (Array.isArray(schema)) {
    return '[' + schema.map(s => canonicalize(s, seen)).join(',') + ']';
  }

  // Complex types
  switch (schema.type) {
    case 'record': {
      const fullname = resolveFullname(schema.name!, schema.namespace);
      if (seen.has(fullname)) {
        return `"${fullname}"`;
      }
      seen.add(fullname);
      const fields = (schema.fields ?? [])
        .map(f => `{"name":${JSON.stringify(f.name)},"type":${canonicalize(f.type as AvroSchemaNode, seen)}}`)
        .join(',');
      return `{"name":${JSON.stringify(fullname)},"type":"record","fields":[${fields}]}`;
    }

    case 'enum': {
      const fullname = resolveFullname(schema.name!, schema.namespace);
      if (seen.has(fullname)) {
        return `"${fullname}"`;
      }
      seen.add(fullname);
      const symbols = (schema.symbols ?? []).map(s => JSON.stringify(s)).join(',');
      return `{"name":${JSON.stringify(fullname)},"type":"enum","symbols":[${symbols}]}`;
    }

    case 'fixed': {
      const fullname = resolveFullname(schema.name!, schema.namespace);
      if (seen.has(fullname)) {
        return `"${fullname}"`;
      }
      seen.add(fullname);
      return `{"name":${JSON.stringify(fullname)},"type":"fixed","size":${schema.size}}`;
    }

    case 'array':
      return `{"type":"array","items":${canonicalize(schema.items as AvroSchemaNode, seen)}}`;

    case 'map':
      return `{"type":"map","values":${canonicalize(schema.values as AvroSchemaNode, seen)}}`;

    default:
      // Primitive type expressed as {"type":"int"} instead of bare "int"
      return `"${schema.type}"`;
  }
}

function resolveFullname(name: string, namespace?: string): string {
  if (!namespace || name.includes('.')) return name;
  return `${namespace}.${name}`;
}
