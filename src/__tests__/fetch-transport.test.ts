import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FetchTransport } from '../transport/fetch.js';
import { SchemaRegistry } from '../schema/registry.js';
import { DebugLogger } from '../debug/index.js';
import { encode, frameForWire } from '../codec/index.js';
import { fingerprintToHex } from '../schema/fingerprint.js';
import { SchemaNegotiationError } from '../errors/index.js';
import type { AvroRecordSchema } from '../types.js';

const userSchema: AvroRecordSchema = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'role', type: 'string' },
  ],
};

function createTransport(fetchMock: typeof globalThis.fetch, autoInfer = true) {
  const registry = new SchemaRegistry();
  const debug = new DebugLogger(false);

  return {
    transport: new FetchTransport({
      endpoint: 'https://api.example.com',
      registry,
      debug,
      autoInfer,
      fetchImpl: fetchMock,
    }),
    registry,
  };
}

function createBinaryResponse(
  registry: SchemaRegistry,
  schema: AvroRecordSchema,
  body: Record<string, unknown>,
): Response {
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

describe('FetchTransport', () => {
  it('sends binary body and decodes binary response', async () => {
    const responseBody = { name: 'Alice', role: 'Admin' };

    const fetchMock = vi.fn<typeof globalThis.fetch>();
    const { transport, registry } = createTransport(fetchMock);

    // Pre-register schema so the response can be decoded.
    registry.register(userSchema, '/users');

    fetchMock.mockImplementation(async () =>
      createBinaryResponse(registry, userSchema, responseBody),
    );

    const result = await transport.fetch('/users', {
      method: 'POST',
      body: { name: 'Alice', role: 'Admin' },
    });

    expect(result).toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/avro',
    });
  });

  it('falls back to JSON for non-avro responses', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ name: 'Bob', role: 'User' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { transport } = createTransport(fetchMock);

    const result = await transport.fetch('/users', {
      method: 'POST',
      body: { name: 'Bob', role: 'User' },
    });

    expect(result).toEqual({ name: 'Bob', role: 'User' });
  });

  it('handles 406 schema negotiation by retrying with full schema', async () => {
    const responseBody = { name: 'Alice', role: 'Admin' };
    let callCount = 0;

    const fetchMock = vi.fn<typeof globalThis.fetch>();
    const { transport, registry } = createTransport(fetchMock);
    registry.register(userSchema, '/users');

    fetchMock.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(null, {
          status: 406,
          headers: { 'X-Avro-Missing-Schema': 'true' },
        });
      }
      return createBinaryResponse(registry, userSchema, responseBody);
    });

    const result = await transport.fetch('/users', {
      method: 'POST',
      body: { name: 'Alice', role: 'Admin' },
    });

    expect(result).toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Verify the retry includes full schema header
    const [, retryInit] = fetchMock.mock.calls[1]!;
    expect((retryInit as RequestInit).headers).toMatchObject({
      'X-Avro-Full-Schema': 'true',
    });
  });

  it('throws SchemaNegotiationError on non-OK non-406 responses', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    const { transport } = createTransport(fetchMock);

    await expect(
      transport.fetch('/users', { method: 'POST', body: { name: 'x', role: 'y' } }),
    ).rejects.toThrow(SchemaNegotiationError);
  });

  it('sends GET without body', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { transport } = createTransport(fetchMock);
    const result = await transport.fetch('/health');

    expect(result).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).body).toBeUndefined();
  });

  it('does not mutate caller request options', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { transport } = createTransport(fetchMock);

    const options = {
      method: 'POST',
      headers: { 'X-Custom': 'true' },
      body: { name: 'Alice', role: 'Admin' },
    };

    await transport.fetch('/users', options);

    expect(options).toEqual({
      method: 'POST',
      headers: { 'X-Custom': 'true' },
      body: { name: 'Alice', role: 'Admin' },
    });
  });
});
