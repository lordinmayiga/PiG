import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { mintPairingToken } from '../src/auth.js';
import type {
  Envelope,
  HelloPayload,
  ResyncRequestPayload,
  ResyncSnapshotPayload,
  RouteInputPayload,
  ActionConfirmPayload,
  ActionResultPayload,
} from '../../src/types/index.js';

const WS_URL = 'ws://127.0.0.1:8787';

function waitForEnvelope<T = unknown>(ws: WebSocket, expectedType?: string): Promise<Envelope<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for message${expectedType ? ` of type ${expectedType}` : ''}`)),
      5000,
    );
    const handler = (data: unknown) => {
      try {
        const parsed = JSON.parse(String(data)) as Envelope<T>;
        if (!expectedType || parsed.type === expectedType) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(parsed);
        }
      } catch (err) {
        clearTimeout(timer);
        ws.off('message', handler);
        reject(err);
      }
    };
    ws.on('message', handler);
    ws.once('error', (err) => {
      clearTimeout(timer);
      ws.off('message', handler);
      reject(err);
    });
  });
}

test('E2E: WebSocket Bridge Handshake and Session Discovery', async (t) => {
  await t.test('rejects invalid or missing token with bad_token error', async () => {
    const ws = new WebSocket(WS_URL);
    await new Promise((resolve) => ws.once('open', resolve));

    const badHello: Envelope<HelloPayload> = {
      v: 1,
      type: 'hello',
      id: 'test-bad-hello-1',
      ts: Date.now(),
      payload: { token: 'invalid_fake_token_12345' },
    };
    ws.send(JSON.stringify(badHello));

    const res = await waitForEnvelope(ws, 'error');
    assert.equal(res.type, 'error');
    const errPayload = res.payload as { code: string };
    assert.equal(errPayload.code, 'bad_token');

    ws.close();
  });

  await t.test('authenticates with freshly minted pairing token and queries tmux sessions', async () => {
    const { token } = mintPairingToken();
    assert.ok(token, 'Pairing token minted');

    const ws = new WebSocket(WS_URL);
    await new Promise((resolve) => ws.once('open', resolve));

    // 1. Send hello envelope
    const helloEnv: Envelope<HelloPayload> = {
      v: 1,
      type: 'hello',
      id: 'test-valid-hello-1',
      ts: Date.now(),
      payload: { token },
    };
    ws.send(JSON.stringify(helloEnv));

    // 2. Expect hello_ack
    const ack = await waitForEnvelope(ws, 'hello_ack');
    assert.equal(ack.type, 'hello_ack', 'Received hello_ack envelope');
    const ackPayload = ack.payload as { ok: boolean; serverVersion: string };
    assert.equal(ackPayload.ok, true);
    assert.equal(ackPayload.serverVersion, '0.1.0');

    // 3. Query tmux sessions via resync_request
    const resyncEnv: Envelope<ResyncRequestPayload> = {
      v: 1,
      type: 'resync_request',
      id: 'test-resync-1',
      ts: Date.now(),
      payload: {},
    };
    ws.send(JSON.stringify(resyncEnv));

    // 4. Expect resync_snapshot with sessions array
    const snapshot = await waitForEnvelope<ResyncSnapshotPayload>(ws, 'resync_snapshot');
    assert.equal(snapshot.type, 'resync_snapshot', 'Received resync_snapshot envelope');
    const snapshotPayload = snapshot.payload;
    assert.ok(Array.isArray(snapshotPayload.sessions), 'Sessions is an array');
    console.log(
      `[E2E Test] Found ${snapshotPayload.sessions.length} live tmux sessions on VPS:`,
      snapshotPayload.sessions.map((s) => s.name).join(', '),
    );
    assert.ok(snapshotPayload.sessions.length > 0, 'Should discover active tmux sessions on this VPS');

    // 5. Test ping / pong
    ws.send(JSON.stringify({ v: 1, type: 'ping', id: 'test-ping-1', ts: Date.now(), payload: {} }));
    const pong = await waitForEnvelope(ws, 'pong');
    assert.equal(pong.type, 'pong', 'Received pong envelope');

    ws.close();
  });
});

test('E2E: Session Lifecycle — Create session, send agent message, and kill session', async (t) => {
  const { token } = mintPairingToken();
  const ws = new WebSocket(WS_URL);
  await new Promise((resolve) => ws.once('open', resolve));

  // Authenticate
  ws.send(
    JSON.stringify({
      v: 1,
      type: 'hello',
      id: 'test-hello-lifecycle',
      ts: Date.now(),
      payload: { token },
    }),
  );
  await waitForEnvelope(ws, 'hello_ack');

  const testSessionName = `pig_test_${Date.now()}`;

  await t.test(`creates new session "${testSessionName}" via route_input`, async () => {
    const createEnv: Envelope<RouteInputPayload> = {
      v: 1,
      type: 'route_input',
      id: 'test-create-sess-1',
      ts: Date.now(),
      sessionId: testSessionName,
      payload: {
        sessionId: testSessionName,
        text: `new session ${testSessionName}`,
      },
    };
    ws.send(JSON.stringify(createEnv));

    const createRes = await waitForEnvelope<ActionResultPayload>(ws, 'action_result');
    assert.equal(createRes.payload.kind, 'action_executed');
    console.log(`[E2E Test] Create action executed:`, (createRes.payload as { summary: string }).summary);

    // Wait 250ms for tmux to establish the session, then resync
    await new Promise((r) => setTimeout(r, 250));

    ws.send(
      JSON.stringify({
        v: 1,
        type: 'resync_request',
        id: 'test-resync-after-create',
        ts: Date.now(),
        payload: {},
      }),
    );
    const snapshot = await waitForEnvelope<ResyncSnapshotPayload>(ws, 'resync_snapshot');
    const sessionFound = snapshot.payload.sessions.some((s) => s.name === testSessionName);
    assert.ok(sessionFound, `Created tmux session "${testSessionName}" must be present in resync_snapshot`);
    console.log(`[E2E Test] Verified session "${testSessionName}" exists in live tmux session list.`);
  });

  await t.test(`sends agent message to "${testSessionName}" and receives routed prompt`, async () => {
    const promptText = 'Explain this project architecture';
    const msgEnv: Envelope<RouteInputPayload> = {
      v: 1,
      type: 'route_input',
      id: 'test-msg-1',
      ts: Date.now(),
      sessionId: testSessionName,
      payload: {
        sessionId: testSessionName,
        text: promptText,
      },
    };
    ws.send(JSON.stringify(msgEnv));

    const msgRes = await waitForEnvelope<ActionResultPayload>(ws, 'action_result');
    assert.equal(msgRes.payload.kind, 'prompt_routed');
    assert.equal((msgRes.payload as { cleanedPrompt: string }).cleanedPrompt, promptText);
    console.log(`[E2E Test] Agent prompt received & routed successfully:`, (msgRes.payload as { cleanedPrompt: string }).cleanedPrompt);
  });

  await t.test(`kills session "${testSessionName}" via 2-step confirmation flow`, async () => {
    // 1. Propose kill
    const killProposalEnv: Envelope<RouteInputPayload> = {
      v: 1,
      type: 'route_input',
      id: 'test-kill-prop-1',
      ts: Date.now(),
      sessionId: testSessionName,
      payload: {
        sessionId: testSessionName,
        text: 'kill session',
      },
    };
    ws.send(JSON.stringify(killProposalEnv));

    const killProposal = await waitForEnvelope<ActionResultPayload>(ws, 'action_result');
    assert.equal(killProposal.payload.kind, 'action_pending_confirm');
    const actionId = killProposal.payload.requestId;
    assert.ok(actionId, 'Pending confirm action has a requestId');
    console.log(`[E2E Test] Received kill confirmation request: actionId=${actionId}`);

    // 2. Confirm kill
    const confirmEnv: Envelope<ActionConfirmPayload> = {
      v: 1,
      type: 'action_confirm',
      id: 'test-confirm-kill-1',
      ts: Date.now(),
      sessionId: testSessionName,
      payload: {
        actionId,
        confirmed: true,
      },
    };
    ws.send(JSON.stringify(confirmEnv));

    const confirmRes = await waitForEnvelope<ActionResultPayload>(ws, 'action_result');
    assert.equal(confirmRes.payload.kind, 'action_executed');
    console.log(`[E2E Test] Kill executed:`, (confirmRes.payload as { summary: string }).summary);

    // 3. Verify session was removed from tmux
    await new Promise((r) => setTimeout(r, 150));
    ws.send(
      JSON.stringify({
        v: 1,
        type: 'resync_request',
        id: 'test-resync-after-kill',
        ts: Date.now(),
        payload: {},
      }),
    );
    const snapshot = await waitForEnvelope<ResyncSnapshotPayload>(ws, 'resync_snapshot');
    const sessionFound = snapshot.payload.sessions.some((s) => s.name === testSessionName);
    assert.equal(sessionFound, false, `Killed session "${testSessionName}" must no longer exist in tmux`);
    console.log(`[E2E Test] Verified session "${testSessionName}" was cleanly terminated.`);
  });

  ws.close();
});
