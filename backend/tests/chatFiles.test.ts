import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';
import { mintRawFileTicket, handleHttpFileRequest } from '../src/httpFiles.js';
import { startServer } from '../src/server.js';
import { mintPairingToken } from '../src/auth.js';
import type { Envelope, FsRawUrlResultPayload } from '../../src/types/index.js';

test('httpFiles: mintRawFileTicket and HTTP raw file serving', async () => {
  const testDir = '/root/projects/PiG/backend/tests/fixtures';
  if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  const testFile = path.join(testDir, 'sample.html');
  writeFileSync(testFile, '<html><body><h1>Hello World</h1></body></html>');

  try {
    // 1. Mint ticket
    const ticket = mintRawFileTicket(testFile);
    assert.ok(ticket && ticket.length > 0, 'Ticket should be generated');

    // 2. Mock HTTP request & response
    const server = http.createServer((req, res) => {
      const handled = handleHttpFileRequest(req, res);
      if (!handled) {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as { port: number };

    // Request with valid ticket
    const res = await fetch(`http://127.0.0.1:${address.port}/files/raw?path=${encodeURIComponent(testFile)}&token=${encodeURIComponent(ticket)}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html');
    const text = await res.text();
    assert.ok(text.includes('Hello World'));

    // Request with invalid ticket
    const badRes = await fetch(`http://127.0.0.1:${address.port}/files/raw?path=${encodeURIComponent(testFile)}&token=invalid_token`);
    assert.equal(badRes.status, 403);

    server.close();
  } finally {
    if (existsSync(testFile)) unlinkSync(testFile);
  }
});

test('WebSocket: fs_raw_url_request returns valid ticketed URL', async () => {
  const testPort = 8997;
  const wss = startServer(testPort);

  try {
    const { token } = mintPairingToken();
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);

    await new Promise<void>((resolve) => ws.on('open', () => resolve()));

    // Handshake
    ws.send(JSON.stringify({
      v: 1,
      type: 'hello',
      id: 'h1',
      ts: Date.now(),
      payload: { token },
    }));

    await new Promise<void>((resolve) => {
      ws.on('message', (data) => {
        const env = JSON.parse(data.toString()) as Envelope;
        if (env.type === 'hello_ack') resolve();
      });
    });

    // Request raw URL
    const reqId = 'raw-url-1';
    ws.send(JSON.stringify({
      v: 1,
      type: 'fs_raw_url_request',
      id: reqId,
      ts: Date.now(),
      payload: { path: '/root/projects/PiG/package.json' },
    }));

    const result = await new Promise<FsRawUrlResultPayload>((resolve, reject) => {
      ws.on('message', (data) => {
        const env = JSON.parse(data.toString()) as Envelope<FsRawUrlResultPayload>;
        if (env.type === 'fs_raw_url_result' && env.id === reqId) {
          resolve(env.payload);
        }
      });
      setTimeout(() => reject(new Error('timeout')), 5000);
    });

    assert.ok(result.url && result.url.includes('/files/raw?path='), 'Result URL should contain /files/raw');
    assert.ok(result.url.includes('token='), 'Result URL should contain token param');

    ws.close();
  } finally {
    wss.close();
  }
});
