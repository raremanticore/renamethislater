import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { hostedApplication } from '../src/hosted.ts';

/** Vercel owns the listener; no listen() call or local SQLite import. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try { await (await hostedApplication()).handler(req, res); }
  catch {
    const requestId = randomUUID();
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'X-Request-ID': requestId, 'Retry-After': '5', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify({ error: { code: 'backend_unavailable',
      message: 'Backend configuration or database unavailable; check environment and database setup', requestId } }));
  }
}
