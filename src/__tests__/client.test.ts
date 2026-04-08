import { describe, it, expect, vi } from 'vitest';
import { AvroClient } from '../client.js';
import { SchemaRegistry } from '../schema/registry.js';
import { encode, frameForWire } from '../codec/index.js';
import { fingerprintToHex } from '../schema/fingerprint.js';
import type { AvroRecordSchema } from '../types.js';

const userSchema: AvroRecordSchema = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'role', type: 'string' },
  ],
};

function createMockResponse(
  schema: AvroRecordSchema,
  body: Record<string, unknown>,
): Response {
  const registry = new SchemaRegistry();
  const fp = registry.register(schema);
  const entry = registry.getByFingerprint(fp);
  const data = encode(entry, body);
  const frame = frameForWire({ fingerprint: fp, data });

  return new Response(frame, {
    status: 200,
    headers: {
      'Content-Type': 'application/avro',
      'X-Schema-ID': fingerprintToHex(fp),
    },
  });
}

describe('AvroClient', () => {
  it('creates an instance with default config', () => {
    const client = new AvroClient({
      endpoint: 'https://api.example.com',
      fetch: vi.fn(),
    });
    expect(client).toBeDefined();
    expect(client.registry).toBeInstanceOf(SchemaRegistry);
  });

  it('pre-registers schemas from manifest', () => {
    const client = new AvroClient({
      endpoint: 'https://api.example.com',
      schemas: { '/users': userSchema },
      fetch: vi.fn(),
    });
    const entry = client.registry.getByKey('/users');
    expect(entry).toBeDefined();
    expect(entry!.schema.name).toBe('User');
  });

  it('registerSchema adds to the registry', () => {
    const client = new AvroClient({
      endpoint: 'https://api.example.com',
      fetch: vi.fn(),
    });
    const fp = client.registerSchema(userSchema, '/users');
    expect(fp).toBeInstanceOf(Uint8Array);
    expect(client.registry.getByKey('/users')).toBeDefined();
  });

  it('fetch sends and receives binary data', async () => {
    const responseBody = { name: 'Alice', role: 'Admin' };

    const fetchMock = vi.fn<typeof globalThis.fetch>().mockImplementation(
      async () => createMockResponse(userSchema, responseBody),
    );

    const client = new AvroClient({
      endpoint: 'https://api.example.com',
      schemas: { '/users': userSchema },
      fetch: fetchMock,
    });

    const result = await client.fetch('/users', {
      method: 'POST',
      body: { name: 'Alice', role: 'Admin' },
    });

    expect(result).toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetch works with GET (no body)', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = new AvroClient({
      endpoint: 'https://api.example.com',
      fetch: fetchMock,
    });

    const result = await client.fetch('/health');
    expect(result).toEqual({ status: 'ok' });
  });

  it('strips trailing slashes from endpoint', () => {
    const client = new AvroClient({
      endpoint: 'https://api.example.com/',
      fetch: vi.fn(),
    });
    // Verify by making a request and checking the URL.
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client2 = new AvroClient({
      endpoint: 'https://api.example.com///',
      fetch: fetchMock,
    });

    void client2.fetch('/test');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/test',
      expect.anything(),
    );
  });

  it('destroy is safe to call multiple times', () => {
    const client = new AvroClient({
      endpoint: 'https://api.example.com',
      fetch: vi.fn(),
    });
    expect(() => {
      client.destroy();
      client.destroy();
    }).not.toThrow();
  });
});
