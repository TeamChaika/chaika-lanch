import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

const port = Number(process.env.PORT || 3000);
const internalPort = Number(process.env.PAYMENT_INTERNAL_PORT || 3001);
const origins = new Set((process.env.APP_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
const workerToken = process.env.PAYMENT_WORKER_TOKEN || randomBytes(32).toString('hex');
const internal = `http://127.0.0.1:${internalPort}`;
const child = process.env.PAYMENT_GATEWAY_ATTACH === '1' && process.env.NODE_ENV !== 'production' ? null : spawn(process.execPath, ['server.js'], {
  env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: String(internalPort), PAYMENT_WORKER_TOKEN: workerToken }, stdio: 'inherit',
});
const peers = new Set();
const counts = new Map();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
let shuttingDown = false;
let connections = 0;

async function status(id, cookie, refresh = false) {
  const response = await fetch(`${internal}/api/payments/${id}${refresh ? '?refresh=1' : ''}`, { headers: { cookie }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) { const error = new Error('Payment status unavailable'); error.status = response.status; throw error; }
  return response.json();
}
async function update(peer, refresh = false) {
  if (peer.busy || peer.ws.readyState !== WebSocket.OPEN) return;
  peer.busy = true;
  try {
    const payment = await status(peer.id, peer.cookie, refresh);
    if (peer.ws.readyState === WebSocket.OPEN) peer.ws.send(JSON.stringify({ type: 'payment', payment }));
  } catch (error) {
    if ([401, 404].includes(error.status)) peer.ws.close(1008, 'Session expired');
    else if (peer.ws.readyState === WebSocket.OPEN) peer.ws.send(JSON.stringify({ type: 'unavailable' }));
  } finally { peer.busy = false; }
}
const server = http.createServer({ maxHeaderSize: 16384, requestTimeout: 65000 }, (request, response) => {
  if (!request.url?.startsWith('/') || request.url.startsWith('//')) { response.writeHead(400).end(); return; }
  const upstream = http.request({ hostname: '127.0.0.1', port: internalPort, path: request.url, method: request.method,
    headers: { ...request.headers, connection: 'keep-alive' }, timeout: 60000 }, result => {
    response.writeHead(result.statusCode || 502, result.headers); result.pipe(response);
    result.on('end', () => {
      const id = request.url?.match(/^\/api\/payments\/([a-f0-9-]{36})\/webhook\?/)?.[1];
      if (request.method === 'POST' && result.statusCode === 200 && id) for (const peer of peers) if (peer.id === id) void update(peer);
    });
    result.on('error', () => response.destroy());
  });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain' }); response.end('Сервис временно недоступен'); });
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => { if (!response.writableFinished) upstream.destroy(); });
  request.pipe(upstream);
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
server.on('upgrade', async (request, socket, head) => {
  socket.on('error', () => {});
  let url;
  try { url = new URL(request.url || '/', 'http://localhost'); } catch { socket.destroy(); return; }
  // Next dev waits for HMR before hydrating. This tunnel is never enabled in production.
  if (process.env.NODE_ENV === 'development' && url.pathname === '/_next/hmr' && origins.has(request.headers.origin)) {
    const upstream = http.request({ hostname: '127.0.0.1', port: internalPort, path: request.url, headers: request.headers });
    upstream.on('upgrade', (response, target, buffered) => {
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([name, value]) => `${name}: ${value}`).join('\r\n')}\r\n\r\n`);
      if (head.length) target.write(head); if (buffered.length) socket.write(buffered);
      target.on('error', () => socket.destroy()); socket.on('error', () => target.destroy());
      socket.on('close', () => target.destroy()); target.on('close', () => socket.destroy());
      socket.pipe(target).pipe(socket);
    });
    upstream.on('error', () => socket.destroy()); upstream.on('response', () => socket.destroy()); upstream.end(); return;
  }
  const id = url.searchParams.get('id') || '';
  const cookie = request.headers.cookie || '';
  const group = createHash('sha256').update(cookie).digest('hex');
  if (url.pathname !== '/api/payments/ws' || !uuid.test(id) || !origins.has(request.headers.origin) || !cookie || connections >= 200 || (counts.get(group) || 0) >= 3) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
  // Reserve capacity before asynchronous authentication, including simultaneous upgrade requests.
  connections++;
  counts.set(group, (counts.get(group) || 0) + 1);
  let released = false;
  const release = () => { if (released) return; released = true; connections--; const count = (counts.get(group) || 1) - 1; if (count) counts.set(group, count); else counts.delete(group); };
  socket.once('close', release);
  let initial;
  try { initial = await status(id, cookie); }
  catch { release(); socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
  if (socket.destroyed) { release(); return; }
  try { wss.handleUpgrade(request, socket, head, ws => {
    const peer = { id, cookie, ws, busy: false, alive: true }; peers.add(peer);
    ws.on('error', () => ws.terminate());
    ws.on('pong', () => { peer.alive = true; });
    ws.on('message', () => ws.close(1008, 'Read only'));
    ws.on('close', () => { peers.delete(peer); release(); });
    ws.send(JSON.stringify({ type: 'payment', payment: initial }));
  }); } catch { release(); socket.destroy(); }
});
const poll = setInterval(() => { for (const peer of peers) void update(peer, true); }, 10000);
const heartbeat = setInterval(() => { for (const peer of peers) { if (!peer.alive) { peer.ws.terminate(); continue; } peer.alive = false; peer.ws.ping(); } }, 30000);
let reconciling = false;
const cursors = { live: undefined, sandbox: undefined };
async function reconcile() {
  if (reconciling) return;
  reconciling = true;
  try {
    for (const mode of ['live', 'sandbox']) {
      if (!(mode === 'live' ? process.env.QRM_LIVE_API_KEY : process.env.QRM_API_KEY)) continue;
      const response = await fetch(`${internal}/api/internal/payments/reconcile`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Payment-Worker': workerToken }, body: JSON.stringify({ mode, cursor: cursors[mode] }), signal: AbortSignal.timeout(55000) });
      if (!response.ok) throw new Error('Reconciliation unavailable');
      const result = await response.json(); cursors[mode] = result.cursor;
      if (result.errors) console.error('Payment reconciliation: provider or storage unavailable');
    }
    for (const peer of peers) void update(peer);
  } catch { console.error('Payment reconciliation temporarily unavailable'); }
  finally { reconciling = false; }
}
const worker = setInterval(() => void reconcile(), 15000);
function shutdown(code = 0) {
  if (shuttingDown) return; shuttingDown = true;
  clearInterval(poll); clearInterval(heartbeat); clearInterval(worker);
  for (const peer of peers) peer.ws.close(1012, 'Restart');
  server.close(); child?.kill('SIGTERM');
  setTimeout(() => process.exit(code), 2000).unref();
}
process.on('SIGTERM', () => shutdown()); process.on('SIGINT', () => shutdown());
child?.on('exit', code => shutdown(code || 1));
child?.on('error', () => shutdown(1));
server.listen(port, '0.0.0.0', () => console.log('Payment gateway ready'));
