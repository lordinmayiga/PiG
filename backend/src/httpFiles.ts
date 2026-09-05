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

  // A ticket used inside its window renews for another full TICKET_TTL_MS —
  // otherwise a large file fetched as several Range requests (chunked
  // download, or an <Image>/fetch retry) could see its own ticket expire
  // mid-transfer on a slow connection, well before the file itself finished
  // downloading. An abandoned ticket still dies on schedule since nothing
  // here runs for an unused one.
  ticket.expiresAt = Date.now() + TICKET_TTL_MS;

  try {
    const stats = statSync(safePath);
    if (!stats.isFile()) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Target path is not a regular file');
      return true;
    }

    const ext = extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'text/plain';
    const commonHeaders = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Accept-Ranges': 'bytes',
    };

    // Range support (RFC 7233, single-range only — the one form a
    // <Image>/fetch client or a chunked downloader actually sends) is what
    // lets a large file be fetched a piece at a time instead of always
    // pulling the whole thing: it's the basis for byte-level progress, for
    // resuming after a dropped connection, and for a chunked reader that
    // can stop asking for more (cancel) between chunks rather than only
    // after a single all-or-nothing response finishes.
    const rangeHeader = req.headers.range;
    const rangeMatch = typeof rangeHeader === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;

    if (rangeMatch) {
      const [, startStr, endStr] = rangeMatch;
      let start = startStr ? parseInt(startStr, 10) : undefined;
      let end = endStr ? parseInt(endStr, 10) : undefined;

      // "bytes=-500" (suffix range: last 500 bytes) has no start.
      if (start === undefined && end !== undefined) {
        start = Math.max(0, stats.size - end);
        end = stats.size - 1;
      }
      if (start === undefined) start = 0;
      if (end === undefined || end > stats.size - 1) end = stats.size - 1;

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stats.size) {
        res.writeHead(416, { ...commonHeaders, 'Content-Range': `bytes */${stats.size}` });
        res.end();
        return true;
      }

      res.writeHead(206, {
        ...commonHeaders,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
      });

      const stream = createReadStream(safePath, { start, end });
      stream.on('error', (err) => {
        console.error('[httpFiles] Stream error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal file stream error');
        } else {
          res.end();
        }
      });
      // The client side of a cancel: an aborted fetch()/download closes the
      // underlying connection, which fires 'close' here before the stream
      // would otherwise finish — destroy it so a cancelled download stops
      // reading the file server-side too, instead of quietly finishing a
      // read nobody is receiving anymore.
      res.on('close', () => stream.destroy());
      stream.pipe(res);
      return true;
    }

    res.writeHead(200, {
      ...commonHeaders,
      'Content-Length': stats.size,
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
    res.on('close', () => stream.destroy());

    stream.pipe(res);
    return true;
  } catch (err) {
    console.error('[httpFiles] Error reading file:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
    return true;
  }
}
