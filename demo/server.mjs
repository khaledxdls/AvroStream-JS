/**
 * Demo server — Express + WebSocket
 *
 * Speaks both JSON and Avro so we can see the library from the
 * server's perspective: decode incoming Avro requests, encode
 * Avro responses, and handle schema negotiation (406).
 */

import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  SchemaRegistry,
  encode,
  decode,
  frameForWire,
  parseWireFrame,
} from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Schemas ──────────────────────────────────────────────────────────

const UserSchema = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'id', type: 'int' },
    { name: 'name', type: 'string' },
    { name: 'email', type: 'string' },
    { name: 'role', type: 'string' },
  ],
};

const OrderSchema = {
  type: 'record',
  name: 'Order',
  fields: [
    { name: 'orderId', type: 'string' },
    { name: 'userId', type: 'int' },
    { name: 'product', type: 'string' },
    { name: 'quantity', type: 'int' },
    { name: 'price', type: 'double' },
    { name: 'status', type: 'string' },
  ],
};

const ChatMessage = {
  type: 'record',
  name: 'ChatMessage',
  fields: [
    { name: 'from', type: 'string' },
    { name: 'text', type: 'string' },
    { name: 'timestamp', type: 'long' },
  ],
};

// ── Server-side registry ─────────────────────────────────────────────

const registry = new SchemaRegistry();
registry.register(UserSchema, '/api/users');
registry.register(OrderSchema, '/api/orders');
registry.register(ChatMessage, 'ChatMessage');

// ── In-memory "database" ─────────────────────────────────────────────

const users = [
  { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob', email: 'bob@example.com', role: 'user' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'user' },
];

const orders = [
  { orderId: 'ORD-001', userId: 1, product: 'Laptop', quantity: 1, price: 1299.99, status: 'shipped' },
  { orderId: 'ORD-002', userId: 2, product: 'Keyboard', quantity: 2, price: 89.50, status: 'delivered' },
];

// ── Avro middleware ──────────────────────────────────────────────────

function avroMiddleware(schemaKey) {
  return async (req, res, next) => {
    const isAvro = req.headers['content-type'] === 'application/avro';
    const acceptsAvro = req.headers['accept']?.includes('application/avro');

    if (isAvro && req.body?.length > 0) {
      try {
        const raw = req.body;
        const version = raw[0];

        if (version === 0x02) {
          // Schema-inline frame: [version][4-byte len][schema JSON][8-byte fp][data]
          const schemaLen = raw.readUInt32BE(1);
          const schemaJson = raw.slice(5, 5 + schemaLen).toString('utf8');
          const schema = JSON.parse(schemaJson);
          const fp = raw.slice(5 + schemaLen, 5 + schemaLen + 8);
          const data = raw.slice(5 + schemaLen + 8);

          // Register the new schema the client sent us
          registry.register(schema, schemaKey);
          const entry = registry.getByFingerprint(fp);
          req.avroBody = decode(entry, data);
          console.log('[server] received schema-inline frame, registered new schema:', schema.name);
        } else {
          // Standard frame: [version][8-byte fp][data]
          const { fingerprint: fp, data } = parseWireFrame(raw);
          const entry = registry.getByFingerprint(fp);
          req.avroBody = decode(entry, data);
        }
      } catch (err) {
        if (err.name === 'SchemaNotFoundError') {
          // Tell client we don't have the schema — trigger 406 retry
          console.log('[server] unknown schema, responding 406 with X-Avro-Missing-Schema');
          return res
            .status(406)
            .set('X-Avro-Missing-Schema', 'true')
            .json({ error: 'Unknown schema — please resend with schema inline' });
        }
        console.error('[server] Avro decode error:', err.message);
        return res.status(400).json({ error: 'Invalid Avro payload' });
      }
    }

    // Attach Avro response helper
    res.avro = (data) => {
      if (acceptsAvro) {
        // Try the path-specific key first, then fall back to any schema
        // the client may have sent via 406 negotiation
        const entry = registry.getByKey(schemaKey);
        if (entry) {
          try {
            const binary = encode(entry, data);
            const frame = frameForWire({ fingerprint: entry.fingerprint, data: binary });
            res.set('Content-Type', 'application/avro');
            return res.send(Buffer.from(frame));
          } catch {
            // Schema mismatch — fall through to JSON
          }
        }
      }
      // Fallback to JSON
      res.json(data);
    };

    next();
  };
}

// ── Express app ──────────────────────────────────────────────────────

const app = express();

// Parse raw binary for Avro, JSON for everything else
app.use((req, res, next) => {
  if (req.headers['content-type'] === 'application/avro') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      req.body = Buffer.concat(chunks);
      next();
    });
  } else {
    express.json()(req, res, next);
  }
});

// Serve the web page
app.use(express.static(path.join(__dirname, 'public')));

// ── REST endpoints ───────────────────────────────────────────────────

app.get('/api/users', avroMiddleware('/api/users'), (req, res) => {
  // Return first user for simplicity (Avro encodes single records)
  res.avro(users[0]);
});

app.post('/api/users', avroMiddleware('/api/users'), (req, res) => {
  const body = req.avroBody || req.body;
  const user = { ...body, id: users.length + 1 };
  users.push(user);
  console.log('[server] created user:', user);
  res.avro(user);
});

app.get('/api/orders', avroMiddleware('/api/orders'), (req, res) => {
  res.avro(orders[0]);
});

app.post('/api/orders', avroMiddleware('/api/orders'), (req, res) => {
  const body = req.avroBody || req.body;
  const order = { ...body, orderId: `ORD-${String(orders.length + 1).padStart(3, '0')}` };
  orders.push(order);
  console.log('[server] created order:', order);
  res.avro(order);
});

// ── Start ────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3000);
const server = createServer(app);

// ── WebSocket ────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('[server] WebSocket client connected');

  ws.on('message', (raw) => {
    try {
      const frame = new Uint8Array(raw);
      const version = frame[0];

      // WS frame: [version][type-len][type][fp][data]
      const typeLen = frame[1];
      const messageType = new TextDecoder().decode(frame.slice(2, 2 + typeLen));
      const fp = frame.slice(2 + typeLen, 2 + typeLen + 8);
      const data = frame.slice(2 + typeLen + 8);

      const entry = registry.getByFingerprint(fp);
      const decoded = decode(entry, data);

      console.log(`[server] WS "${messageType}":`, decoded);

      // Echo back with a server timestamp
      const reply = {
        from: 'server',
        text: `Echo: ${decoded.text}`,
        timestamp: Date.now(),
      };

      const replyEntry = registry.getByKey('ChatMessage');
      if (!replyEntry) return;

      const replyBinary = encode(replyEntry, reply);
      const replyType = new TextEncoder().encode('ChatMessage');

      // Build WS frame: [version][type-len][type][fp][data]
      const replyFrame = new Uint8Array(1 + 1 + replyType.length + 8 + replyBinary.length);
      replyFrame[0] = 0x01;
      replyFrame[1] = replyType.length;
      replyFrame.set(replyType, 2);
      replyFrame.set(replyEntry.fingerprint, 2 + replyType.length);
      replyFrame.set(replyBinary, 2 + replyType.length + 8);

      ws.send(replyFrame);
    } catch (err) {
      console.error('[server] WS error:', err.message);
    }
  });

  ws.on('close', () => console.log('[server] WebSocket client disconnected'));
});

server.listen(PORT, () => {
  console.log(`
  AvroStream Demo Server
  ──────────────────────
  HTTP  : http://localhost:${PORT}
  WS    : ws://localhost:${PORT}
  Web UI: http://localhost:${PORT}

  Endpoints:
    GET  /api/users   — get a user (Avro or JSON)
    POST /api/users   — create a user
    GET  /api/orders  — get an order
    POST /api/orders  — create an order
    WS   ChatMessage  — echo chat messages
  `);
});
