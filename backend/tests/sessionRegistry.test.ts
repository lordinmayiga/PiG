/**
 * Unit tests for `sessionRegistry.ts`'s JSONL persistence (UI_FIXES_PLAN.md
 * §4 "keep what you can" backend restart survival).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getOrCreateSession, appendTurn, getTranscript } from '../src/sessionRegistry.js';
import type { TranscriptMessage } from '../../src/types/index.js';

const TRANSCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'transcripts');

function msg(id: string, content: string): TranscriptMessage {
  return {
    id,
    role: 'agent',
    content,
    timestamp: new Date().toISOString(),
    status: 'done',
  } as TranscriptMessage;
}

function filePathFor(sessionId: string): string {
  return join(TRANSCRIPTS_DIR, `${sessionId}.jsonl`);
}

function cleanupFile(sessionId: string): void {
  const filePath = filePathFor(sessionId);
  if (existsSync(filePath)) rmSync(filePath);
}

test('sessionRegistry: appendTurn persists to a per-session JSONL file', () => {
  const sessionId = `test-persist-${Date.now()}`;
  cleanupFile(sessionId);
  try {
    getOrCreateSession(sessionId, '/tmp', 'claude-code');
    appendTurn(sessionId, msg('m1', 'hello'));
    appendTurn(sessionId, msg('m2', 'world'));

    const filePath = filePathFor(sessionId);
    assert.ok(existsSync(filePath), 'JSONL file should be created on appendTurn');

    const transcript = getTranscript(sessionId);
    assert.equal(transcript?.length, 2, 'in-memory transcript should have both messages');
  } finally {
    cleanupFile(sessionId);
  }
});

test('sessionRegistry: a session not yet in memory seeds its transcript from a pre-existing JSONL file (simulates surviving a backend restart)', () => {
  const sessionId = `test-reload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  cleanupFile(sessionId);
  try {
    // Simulate "a prior process persisted this session's transcript, then
    // this process started fresh" by writing the JSONL file directly,
    // without ever calling getOrCreateSession for this sessionId in this
    // process (so it's genuinely absent from the in-memory Map).
    if (!existsSync(TRANSCRIPTS_DIR)) mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
    const lines = [msg('p1', 'first'), msg('p2', 'second')].map((m) => JSON.stringify(m)).join('\n') + '\n';
    writeFileSync(filePathFor(sessionId), lines, 'utf8');

    const ctx = getOrCreateSession(sessionId, '/tmp', 'claude-code');
    assert.equal(ctx.transcript.length, 2, 'freshly-created session should load persisted messages from disk');
    assert.equal(ctx.transcript[0].content, 'first');
    assert.equal(ctx.transcript[1].content, 'second');

    const transcript = getTranscript(sessionId);
    assert.equal(transcript?.length, 2);
  } finally {
    cleanupFile(sessionId);
  }
});

test('sessionRegistry: reload upserts by id so streaming growth (same id, multiple appended lines) doesn\'t duplicate', () => {
  const sessionId = `test-upsert-reload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  cleanupFile(sessionId);
  try {
    if (!existsSync(TRANSCRIPTS_DIR)) mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
    const lines = [msg('s1', 'Hel'), msg('s1', 'Hello'), msg('s1', 'Hello, world!')]
      .map((m) => JSON.stringify(m))
      .join('\n') + '\n';
    writeFileSync(filePathFor(sessionId), lines, 'utf8');

    const ctx = getOrCreateSession(sessionId, '/tmp', 'claude-code');
    assert.equal(ctx.transcript.length, 1, 'same-id lines should collapse to one message on reload');
    assert.equal(ctx.transcript[0].content, 'Hello, world!', 'the last line for a given id should win');
  } finally {
    cleanupFile(sessionId);
  }
});

test('sessionRegistry: appendTurn upserts by id in-memory (streaming growth)', () => {
  const sessionId = `test-upsert-live-${Date.now()}`;
  cleanupFile(sessionId);
  try {
    getOrCreateSession(sessionId, '/tmp', 'claude-code');
    appendTurn(sessionId, msg('s1', 'Hel'));
    appendTurn(sessionId, msg('s1', 'Hello'));
    appendTurn(sessionId, msg('s1', 'Hello, world!'));

    const transcript = getTranscript(sessionId);
    assert.equal(transcript?.length, 1, 'same-id appends should upsert in memory, not duplicate');
    assert.equal(transcript?.[0].content, 'Hello, world!');
  } finally {
    cleanupFile(sessionId);
  }
});
