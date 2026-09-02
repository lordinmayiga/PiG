/**
 * PiG bridge server (BACKEND_SETUP_PLAN.md §"What we're building").
 *
 * Bootstraps the token-authed websocket bridge and routes each inbound
 * envelope (per `src/types/index.ts`'s `Envelope`/`BridgeEventType`) to the
 * right module:
 *
 *   hello           -> auth.ts (pairing/bridge token check) -> hello_ack
 *   resync_request  -> tmux.ts (+ per-session transcript state, once
 *                       agentProcess.ts's session registry exists) -> resync_snapshot
 *   route_input     -> routeInput.ts's classify() to split command-vs-prompt,
 *                       then either actions.ts's proposeAction (command) or
 *                       routeInput.ts's routeInput (prompt) -> action_result
 *   action_confirm  -> actions.ts's confirmAction -> action_result
 *   ping            -> pong
 *
 * Each connected socket must complete `hello` before anything else is
 * accepted — unauthenticated sockets get a `bad_token` error and are closed.
 *
 * `session_list_update` and `transcript_chunk` are server-initiated pushes,
 * not request/response: `session_list_update` is broadcast to every
 * authed client on an interval (tmux state can change from outside the
 * bridge, e.g. someone attaching directly), and `transcript_chunk` is
 * pushed as agentProcess.ts's `onChunk` callback fires for sessions that
 * client has an active turn on.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type {
  Envelope,
  BridgeEventType,
  HelloPayload,
  ResyncRequestPayload,
  RouteInputPayload,
  ActionConfirmPayload,
  ResyncSnapshotPayload,
  SessionListUpdatePayload,
  ActionResultPayload,
  BridgeError,
} from '../../src/types/index.js';
import { listTmuxSessions } from './tmux.js';
import { isValidBridgeToken, verifyAndConsumePairingToken } from './auth.js';
import { classify, routeInput } from './routeInput.js';
import { proposeAction, confirmAction } from './actions.js';

const PORT = Number(process.env.PIG_BRIDGE_PORT ?? 8787);

/** Sockets that have completed `hello`. Unauthed sockets can only send `hello`. */
const authedSockets = new Set<WebSocket>();

/** How often to re-poll tmux and broadcast `session_list_update` to authed clients. */
const SESSION_POLL_MS = 5000;

function send<T>(ws: WebSocket, type: BridgeEventType, payload: T, sessionId?: string, id?: string): void {
  const envelope: Envelope<T> = {
    v: 1,
    type,
    id: id ?? randomUUID(),
    ts: Date.now(),
    ...(sessionId ? { sessionId } : {}),
    payload,
  };
  ws.send(JSON.stringify(envelope));
}

function sendError(ws: WebSocket, code: BridgeError['code'], message: string, requestId?: string): void {
  const payload: BridgeError = { code, message, ...(requestId ? { requestId } : {}) };
  send(ws, 'error', payload);
}

async function handleHello(ws: WebSocket, envelope: Envelope<HelloPayload>): Promise<void> {
  const { token } = envelope.payload;
  // A bridge token from a prior pairing is checked first (the common
  // reconnect path); falling back to consuming a fresh pairing token covers
  // the just-scanned-QR first-connect path. Either success authenticates
  // this socket for its lifetime.
  const ok = isValidBridgeToken(token) || verifyAndConsumePairingToken(token);
  if (!ok) {
    sendError(ws, 'bad_token', 'Invalid or expired token.', envelope.id);
    ws.close();
    return;
  }
  authedSockets.add(ws);
  send(ws, 'hello_ack', { ok: true, serverVersion: '0.1.0' }, undefined, envelope.id);
}

async function handleResyncRequest(ws: WebSocket, envelope: Envelope<ResyncRequestPayload>): Promise<void> {
  const sessions = await listTmuxSessions();
  // Per-session transcript resync (payload.sessionId set) needs
  // agentProcess.ts's session/transcript registry, which doesn't exist yet —
  // only the session list is real for now; `transcript`/`syncCursor` stay
  // omitted. Revisit once that registry lands.
  const payload: ResyncSnapshotPayload = {
    sessions,
    ...(envelope.payload.sessionId ? { sessionId: envelope.payload.sessionId } : {}),
  };
  send(ws, 'resync_snapshot', payload, envelope.sessionId, envelope.id);
}

/** classify()'s action.type strings ('new_session', ...) predate actions.ts
 * and don't quite match its PendingAction['kind'] union ('create_session',
 * ...) since the two modules were built in parallel — bridge the naming
 * here rather than change either module's already-settled vocabulary. */
const ACTION_TYPE_TO_KIND: Record<string, 'kill_session' | 'create_session' | 'switch_session' | 'cd'> = {
  kill_session: 'kill_session',
  new_session: 'create_session',
  switch_session: 'switch_session',
  cd: 'cd',
};

async function handleRouteInput(ws: WebSocket, envelope: Envelope<RouteInputPayload>): Promise<void> {
  const { text, sessionId } = envelope.payload;
  const classified = classify(text);

  let result: ActionResultPayload;
  if (classified.kind === 'action') {
    const kind = ACTION_TYPE_TO_KIND[classified.action.type];
    if (kind) {
      result = proposeAction(kind, sessionId, classified.action.params ?? {});
    } else {
      // Unknown action.type — fall back to treating it as a prompt rather
      // than silently dropping the submission.
      result = await routeInput(envelope.payload, envelope.id);
    }
  } else {
    result = await routeInput(envelope.payload, envelope.id);
  }
  send(ws, 'action_result', result, envelope.sessionId, envelope.id);
}

async function handleActionConfirm(ws: WebSocket, envelope: Envelope<ActionConfirmPayload>): Promise<void> {
  const result = await confirmAction(envelope.payload);
  send(ws, 'action_result', result, envelope.sessionId, envelope.id);
}

function handlePing(ws: WebSocket, envelope: Envelope<Record<string, never>>): void {
  send(ws, 'pong', {}, envelope.sessionId, envelope.id);
}

async function routeEnvelope(ws: WebSocket, envelope: Envelope): Promise<void> {
  if (envelope.type !== 'hello' && !authedSockets.has(ws)) {
    sendError(ws, 'bad_token', 'Send hello first.', envelope.id);
    return;
  }
  switch (envelope.type) {
    case 'hello':
      return handleHello(ws, envelope as Envelope<HelloPayload>);
    case 'resync_request':
      return handleResyncRequest(ws, envelope as Envelope<ResyncRequestPayload>);
    case 'route_input':
      return handleRouteInput(ws, envelope as Envelope<RouteInputPayload>);
    case 'action_confirm':
      return handleActionConfirm(ws, envelope as Envelope<ActionConfirmPayload>);
    case 'ping':
      return void handlePing(ws, envelope as Envelope<Record<string, never>>);
    default:
      sendError(ws, 'internal', `Unhandled envelope type: ${envelope.type}`, envelope.id);
  }
}

export function startServer(port = PORT): WebSocketServer {
  const wss = new WebSocketServer({ host: '0.0.0.0', port });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let envelope: Envelope;
      try {
        envelope = JSON.parse(raw.toString());
      } catch {
        sendError(ws, 'internal', 'Malformed envelope: not valid JSON.');
        return;
      }
      routeEnvelope(ws, envelope).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[pig-bridge] envelope handling error:', err);
        sendError(ws, 'internal', 'Internal server error.', envelope.id);
      });
    });

    ws.on('close', () => {
      authedSockets.delete(ws);
    });
  });

  // Best-effort periodic session-list push. tmux state can change from
  // outside the bridge (someone attaching directly, killing a session by
  // hand), so this is a poll, not purely event-driven — acceptable given
  // SESSION_POLL_MS and the low session counts this targets.
  const pollTimer = setInterval(() => {
    if (authedSockets.size === 0) return;
    listTmuxSessions()
      .then((sessions) => {
        const payload: SessionListUpdatePayload = { sessions };
        for (const ws of authedSockets) {
          send(ws, 'session_list_update', payload);
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[pig-bridge] session poll error:', err);
      });
  }, SESSION_POLL_MS);
  pollTimer.unref();

  // eslint-disable-next-line no-console
  console.log(`[pig-bridge] listening on 0.0.0.0:${port}`);
  return wss;
}

// Only auto-start when run directly (not when imported, e.g. by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
