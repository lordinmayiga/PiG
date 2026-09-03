/**
 * Unit tests for `agentProcess.ts`'s NDJSON turn parser/accumulator
 * (REAL_AGENT_CONNECTION_PLAN.md §5.1 "parseNdjsonLine / turn accumulator
 * unit test"). No live process or websocket — feeds canned NDJSON lines
 * (shapes verified live against real `claude --print
 * --output-format stream-json --include-partial-messages --verbose` output,
 * per agentProcess.ts's module doc) through `createTurnParser` and asserts
 * the turn-id/accumulation fix (§3a.2) actually holds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnParser } from '../src/agentProcess.js';

function deltaLine(text: string): string {
  return JSON.stringify({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  });
}

function assistantLine(text: string): string {
  return JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
}

function resultLine(text: string, subtype: 'success' | 'error_max_turns' = 'success'): string {
  return JSON.stringify({ type: 'result', subtype, result: text });
}

test('createTurnParser: all chunks in one turn share a single message id', () => {
  const parse = createTurnParser('sess-1');
  const chunks = [
    parse(deltaLine('Hel')),
    parse(deltaLine('lo, ')),
    parse(deltaLine('world!')),
    parse(assistantLine('Hello, world!')),
    parse(resultLine('Hello, world!')),
  ].filter((c) => c !== null);

  assert.equal(chunks.length, 5, 'every non-metadata line should yield a chunk');
  const ids = new Set(chunks.map((c) => c!.message.id));
  assert.equal(ids.size, 1, 'every chunk for this turn must share one message id');
});

test('createTurnParser: deltas accumulate into the full running text', () => {
  const parse = createTurnParser('sess-1');
  const c1 = parse(deltaLine('Hel'));
  const c2 = parse(deltaLine('lo, '));
  const c3 = parse(deltaLine('world!'));

  assert.equal(c1?.message.content, 'Hel');
  assert.equal(c2?.message.content, 'Hel' + 'lo, ');
  assert.equal(c3?.message.content, 'Hello, world!');
  assert.equal(c1?.done, false);
});

test('createTurnParser: result line ends the turn with done:true and full content', () => {
  const parse = createTurnParser('sess-1');
  parse(deltaLine('Hello, '));
  parse(deltaLine('world!'));
  const final = parse(resultLine('Hello, world!'));

  assert.equal(final?.done, true);
  assert.equal(final?.message.status, 'done');
  assert.equal(final?.message.content, 'Hello, world!');
});

test('createTurnParser: non-success result subtype flags status error but keeps done:true', () => {
  const parse = createTurnParser('sess-1');
  parse(deltaLine('partial reply before hitting the turn limit'));
  const final = parse(resultLine('', 'error_max_turns'));

  assert.equal(final?.done, true);
  assert.equal(final?.message.status, 'error');
  // No `result` text on this subtype — must fall back to the accumulated
  // deltas rather than blanking out a partial reply the user already saw.
  assert.equal(final?.message.content, 'partial reply before hitting the turn limit');
});

test('createTurnParser: two separate turns (two parser instances) get different ids', () => {
  const parseA = createTurnParser('sess-1');
  const parseB = createTurnParser('sess-1');
  const a = parseA(deltaLine('turn A'));
  const b = parseB(deltaLine('turn B'));

  assert.notEqual(a?.message.id, b?.message.id);
});

// --- antigravity (`agy`) shape, verified live 2026-09-03 — see
// parseAntigravityLine's doc in agentProcess.ts for the full catalogue. ---

function agyInitLine(): string {
  return JSON.stringify({ event: 'init', init: { cwd: '/root/projects/PiG', tools: [] } });
}

function agyDeltaLine(text: string, state: 'ACTIVE' | 'DONE' = 'ACTIVE'): string {
  return JSON.stringify({ event: 'step_update', step_update: { step_type: 'agent_response', state, text_delta: text } });
}

function agyResultLine(response: string, status: 'SUCCESS' | 'FAILURE' = 'SUCCESS'): string {
  return JSON.stringify({ event: 'result', result: { status, response } });
}

test('createTurnParser (antigravity): all chunks in one turn share a single message id', () => {
  const parse = createTurnParser('sess-1', 'antigravity');
  const chunks = [
    parse(agyInitLine()),
    parse(agyDeltaLine('PONG')),
    parse(agyDeltaLine('\n', 'DONE')),
    parse(agyResultLine('PONG\n')),
  ].filter((c) => c !== null);

  assert.equal(chunks.length, 3, 'init is metadata and should yield no chunk');
  const ids = new Set(chunks.map((c) => c!.message.id));
  assert.equal(ids.size, 1, 'every chunk for this turn must share one message id');
});

test('createTurnParser (antigravity): text_delta chunks accumulate', () => {
  const parse = createTurnParser('sess-1', 'antigravity');
  const c1 = parse(agyDeltaLine('PO'));
  const c2 = parse(agyDeltaLine('NG'));
  assert.equal(c1?.message.content, 'PO');
  assert.equal(c2?.message.content, 'PONG');
  assert.equal(c1?.done, false);
});

test('createTurnParser (antigravity): result event ends the turn with done:true', () => {
  const parse = createTurnParser('sess-1', 'antigravity');
  parse(agyDeltaLine('PONG'));
  const final = parse(agyResultLine('PONG\n'));
  assert.equal(final?.done, true);
  assert.equal(final?.message.status, 'done');
  assert.equal(final?.message.content, 'PONG\n');
});

test('createTurnParser (antigravity): non-SUCCESS status flags status error', () => {
  const parse = createTurnParser('sess-1', 'antigravity');
  parse(agyDeltaLine('partial'));
  const final = parse(agyResultLine('', 'FAILURE'));
  assert.equal(final?.done, true);
  assert.equal(final?.message.status, 'error');
  assert.equal(final?.message.content, 'partial', 'falls back to accumulated deltas when response is empty');
});

test('createTurnParser: malformed JSON and metadata event types yield null', () => {
  const parse = createTurnParser('sess-1');
  assert.equal(parse('not json {'), null);
  assert.equal(parse(JSON.stringify({ type: 'system', foo: 'bar' })), null);
  assert.equal(parse(JSON.stringify({ type: 'rate_limit_event' })), null);
  assert.equal(
    parse(JSON.stringify({ type: 'stream_event', event: { type: 'message_start' } })),
    null,
  );
});
