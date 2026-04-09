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

/**
 * Compute a 64-bit Rabin fingerprint of the canonical JSON form of a schema.
 * Returns an 8-byte Uint8Array (big-endian).
 */
export function fingerprint(schema: object): Uint8Array {
  const canonical = JSON.stringify(schema);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(canonical);

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
