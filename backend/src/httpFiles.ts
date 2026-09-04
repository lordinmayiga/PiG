/**
 * HTTP raw file serving for PiG bridge (Phase 8).
 *
 * Serves files via GET /files/raw?path=<path>&token=<ticket>
 * authenticated with a short-lived (60s) single-use ticket.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { MIME_TYPES, resolveSafePath } from './files.js';

interface TicketEntry {
  path: string;
  expiresAt: number;
}

const TICKET_TTL_MS = 60 * 1000; // 60 seconds
const tickets = new Map<string, TicketEntry>();

// Prune expired tickets every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of tickets.entries()) {
    if (entry.expiresAt <= now) {
      tickets.delete(token);
    }
  }
}, 30_000).unref();

/**
 * Mints a short-lived ticket valid for reading the specified safe file path.
 */
export function mintRawFileTicket(filePath: string): string {
  const token = randomBytes(24).toString('hex');
  const safePath = resolveSafePath(filePath);
  tickets.set(token, {
    path: safePath,
    expiresAt: Date.now() + TICKET_TTL_MS,
  });
  return token;
}

/**
 * Handles inbound HTTP requests. Returns true if the request was handled by this module.
 */
export function handleHttpFileRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url) return false;

  const parsedUrl = new URL(req.url, 'http://localhost');
  if (parsedUrl.pathname !== '/files/raw') {
    return false;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return true;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return true;
  }

  const token = parsedUrl.searchParams.get('token');
  const rawPath = parsedUrl.searchParams.get('path');

  if (!token || !rawPath) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing required parameters: path and token');
    return true;
  }

  const ticket = tickets.get(token);
  if (!ticket || ticket.expiresAt <= Date.now()) {
    if (ticket) tickets.delete(token);
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden: invalid or expired token');
    return true;
  }

  const safePath = resolveSafePath(rawPath);
  if (safePath !== ticket.path) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden: path does not match token');
    return true;
  }

  if (!existsSync(safePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found');
    return true;
  }

  try {
    const stats = statSync(safePath);
    if (!stats.isFile()) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Target path is not a regular file');
      return true;
    }

    const ext = extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'text/plain';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });

    const stream = createReadStream(safePath);
    stream.on('error', (err) => {
      console.error('[httpFiles] Stream error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal file stream error');
      } else {
        res.end();
      }
    });

    stream.pipe(res);
    return true;
  } catch (err) {
    console.error('[httpFiles] Error reading file:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
    return true;
  }
}
