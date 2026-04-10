/**
 * Demo client — exercises the AvroClient API as documented in the README.
 *
 * Written as if the developer has only the README to go on.
 * Run the server first: node demo/server.mjs
 * Then run this:       node demo/client.mjs
 */

import { AvroClient } from '../dist/index.js';

const ENDPOINT = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

// ── Shared schema definitions (would come from avro-gen in a real app) ──

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

const ChatMessageSchema = {
  type: 'record',
  name: 'ChatMessage',
  fields: [
    { name: 'from', type: 'string' },
    { name: 'text', type: 'string' },
    { name: 'timestamp', type: 'long' },
  ],
};

// =====================================================================
//  1. Pre-compiled schemas + debug mode
// =====================================================================

console.log('\n=== 1. Pre-compiled schemas + debug mode ===\n');

const client = new AvroClient({
  endpoint: ENDPOINT,
  debug: true,           // shows byte savings in console
  autoInfer: false,      // using pre-compiled schemas
  schemas: {
    '/api/users': UserSchema,
    '/api/orders': OrderSchema,
  },
});

// POST a user — body is a plain JS object, wire is Avro binary
console.log('--- POST /api/users ---\n');
const newUser = await client.fetch('/api/users', {
  method: 'POST',
  body: { id: 0, name: 'Diana', email: 'diana@example.com', role: 'editor' },
});
console.log('Response:', newUser, '\n');

// GET a user — response decoded from Avro automatically
console.log('--- GET /api/users ---\n');
const user = await client.fetch('/api/users');
console.log('Response:', user, '\n');

// POST an order
console.log('--- POST /api/orders ---\n');
const order = await client.fetch('/api/orders', {
  method: 'POST',
  body: {
    orderId: '',
    userId: 1,
    product: 'Monitor',
    quantity: 2,
    price: 499.99,
    status: 'pending',
  },
});
console.log('Response:', order, '\n');

client.destroy();

// =====================================================================
//  2. onMetrics telemetry callback
// =====================================================================

console.log('=== 2. onMetrics telemetry ===\n');

const metrics = [];

const metricsClient = new AvroClient({
  endpoint: ENDPOINT,
  debug: false,          // no console spam
  autoInfer: false,
  schemas: {
    '/api/users': UserSchema,
    '/api/orders': OrderSchema,
  },
  onMetrics: (m) => metrics.push(m),
});

await metricsClient.fetch('/api/users', {
  method: 'POST',
  body: { id: 0, name: 'Eve', email: 'eve@example.com', role: 'viewer' },
});

await metricsClient.fetch('/api/orders', {
  method: 'POST',
  body: { orderId: '', userId: 2, product: 'Webcam', quantity: 1, price: 79.99, status: 'pending' },
});

console.log('Collected metrics:\n');
for (const m of metrics) {
  console.log(
    `  ${m.direction.padEnd(8)} ${m.path.padEnd(14)} ` +
    `schema=${m.schemaName.padEnd(8)} ` +
    `avro=${String(m.avroBytes).padStart(3)}B  json=${String(m.jsonBytes).padStart(3)}B  saved=${m.savedPercent}`,
  );
}
console.log();

metricsClient.destroy();

// =====================================================================
//  3. Auto-infer + 406 schema negotiation
// =====================================================================

console.log('=== 3. Auto-infer + 406 schema negotiation ===\n');
console.log('(Client infers schema from object, server responds 406,');
console.log(' client retries with full schema inline)\n');

const autoClient = new AvroClient({
  endpoint: ENDPOINT,
  debug: true,
  autoInfer: true,       // no schemas pre-registered
});

const autoUser = await autoClient.fetch('/api/users', {
  method: 'POST',
  body: { id: 0, name: 'Frank', email: 'frank@example.com', role: 'user' },
});
console.log('Response:', autoUser, '\n');

autoClient.destroy();

// =====================================================================
//  4. WebSocket chat
// =====================================================================

console.log('=== 4. WebSocket chat ===\n');

const wsClient = new AvroClient({
  endpoint: ENDPOINT,
  debug: true,
  autoInfer: false,
  schemas: {
    ChatMessage: ChatMessageSchema,
  },
});

const socket = wsClient.connectSocket(WS_URL);

await new Promise((resolve) => socket.on('open', resolve));
console.log('WebSocket connected!\n');

const messages = [
  'Hello from AvroStream!',
  'Binary on the wire, JSON on the surface.',
  'Third message — all Avro-encoded.',
];

let received = 0;
const done = new Promise((resolve) => {
  socket.on('message', (msg) => {
    console.log('Server replied:', msg, '\n');
    received++;
    if (received >= messages.length) resolve();
  });
});

for (const text of messages) {
  socket.send('ChatMessage', {
    from: 'demo-client',
    text,
    timestamp: Date.now(),
  });
  await new Promise((r) => setTimeout(r, 300));
}

await done;

// =====================================================================
//  5. WebSocket with reconnect options
// =====================================================================

console.log('=== 5. Reconnect config (from README) ===\n');

const resilient = wsClient.connectSocket(WS_URL, {
  reconnect: true,
  reconnectOptions: {
    maxAttempts: 5,
    initialDelayMs: 500,
    maxDelayMs: 10_000,
    jitter: true,
  },
});

await new Promise((resolve) => resilient.on('open', resolve));
console.log('Resilient socket connected (will auto-reconnect on drops)\n');
resilient.close();

// =====================================================================
//  6. Registry introspection
// =====================================================================

console.log('=== 6. Registry ===\n');
console.log(`Schemas registered: ${wsClient.registry.size}\n`);

// ── Cleanup ──────────────────────────────────────────────────────────

socket.close();
wsClient.destroy();

console.log('=== Done! ===\n');
process.exit(0);
