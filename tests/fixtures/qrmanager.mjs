import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

let mode = 'paid';
let count = 0;
const operations = new Map();
const server = createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const input = Buffer.concat(chunks).toString();
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/control') { if (input) { mode = JSON.parse(input).mode; count = 0; } return res.end(JSON.stringify({ count, lastId: [...operations.keys()].at(-1) })); }
  if (req.url?.startsWith('/update/')) {
    const operation = operations.get(req.url.split('/')[2]);
    if (!operation) { res.statusCode = 404; return res.end('{}'); }
    Object.assign(operation, JSON.parse(input)); return res.end('{}');
  }
  if (req.url?.startsWith('/inspect/')) return res.end(JSON.stringify(operations.get(req.url.split('/')[2]) || {}));
  if (req.headers['x-api-key'] !== 'local-fixture-key') { res.statusCode = 403; return res.end('{}'); }
  if (req.url === '/users/check-api-key/') return res.end(JSON.stringify({ merchant_id: 'fixture', firm_name: 'Локальная компания', qrt_name: 'Локальный терминал', qrt_is_b2c: true, requires_receipt: true }));
  if (req.url === '/operations/qr-code/') {
    count++;
    const body = JSON.parse(input);
    if (mode === 'provider-error') { res.statusCode = 400; return res.end(JSON.stringify(['Cannot assign terminal: database router'])); }
    if (mode === 'malformed') return res.end('{}');
    const id = randomUUID(); operations.set(id, { ...body, mode });
    if (mode === 'early-webhook' || mode === 'lost-response' || mode === 'webhook-get-failure') {
      await fetch(body.notification_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, operation_status_code: 5 }) });
      if (mode !== 'early-webhook') return res.end('{}');
    }
    return res.end(JSON.stringify({ results: { operation_id: id, number: count, qr_link: `https://qr.nspk.ru/TEST-${id}`, payment_page_link: `https://app.devwapiserv.qrm.ooo/test/${id}` } }));
  }
  const id = req.url?.match(/^\/api\/v2\/sse-operations\/([^/]+)\/qr-status\/$/)?.[1];
  const operation = operations.get(id);
  if (operation) {
    if (operation.mode === 'webhook-get-failure') { res.statusCode = 503; return res.end('{}'); }
    const code = { paid: 5, cancelled: 6, expired: 8, pending: 3, 'sse-timeout': 0, mismatch: 5 }[operation.mode] ?? 5;
    res.setHeader('Content-Type', 'text/event-stream');
    res.write(': heartbeat\r\n\r\n');
    const event = `data: ${JSON.stringify({ results: { operation_status_code: code, operation_sum: operation.sum + (operation.mode === 'mismatch' ? 1 : 0) } })}\r\n\r\n`;
    res.write(event.slice(0, 18)); return setTimeout(() => res.end(event.slice(18)), 30);
  }
  res.statusCode = 404; res.end('{}');
});
server.listen(3099, '127.0.0.1');
