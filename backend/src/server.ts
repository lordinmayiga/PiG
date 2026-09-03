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
  TranscriptChunkPayload,
  TranscriptMessage,
  BridgeError,
  FsListPayload,
  FsReadPayload,
  SetOpenRouterKeyPayload,
  GetOpenRouterKeyPayload,
} from '../../src/types/index.js';
import { listTmuxSessions } from './tmux.js';
import { isValidBridgeToken, verifyAndConsumePairingToken } from './auth.js';
import { routeInput } from './routeInput.js';
import { confirmAction } from './actions.js';
import { spawnAgentInTmuxWindow } from './agentProcess.js';
import { getOrCreateSession, appendTurn, getTranscript, setActiveHandle } from './sessionRegistry.js';
import { listDirectory, readFileContent } from './files.js';
import { saveOpenRouterKey, getOpenRouterKeySettings } from './openrouterConfig.js';

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
  console.log(`[pig-bridge] Client authenticated successfully with token: ${token.slice(0, 10)}... (active clients: ${authedSockets.size})`);
  send(ws, 'hello_ack', { ok: true, serverVersion: '0.1.0' }, undefined, envelope.id);
}

async function handleResyncRequest(ws: WebSocket, envelope: Envelope<ResyncRequestPayload>): Promise<void> {
  const sessions = await listTmuxSessions();
  // Per-session transcript resync (payload.sessionId set) now reads
  // sessionRegistry.ts's live, in-memory transcript (populated by
  // handleRouteInput's agent spawn below). `undefined` (not `[]`) when the
  // registry has never seen this session — matches getTranscript's contract
  // and lets the client fall back to its own cache rather than treating an
  // unknown session as "confirmed empty".
  const requestedSessionId = envelope.payload.sessionId;
  const transcript = requestedSessionId ? getTranscript(requestedSessionId) : undefined;
  const payload: ResyncSnapshotPayload = {
    sessions,
    ...(requestedSessionId ? { sessionId: requestedSessionId } : {}),
    ...(transcript ? { transcript, syncCursor: transcript[transcript.length - 1]?.id } : {}),
  };
  send(ws, 'resync_snapshot', payload, envelope.sessionId, envelope.id);
}



/**
 * Broadcasts a `transcript_chunk` to every authed socket (not just the
 * sender) so any client with that session open sees the live turn — mirrors
 * `session_list_update`'s broadcast-to-all-authed pattern below, since
 * there's no per-socket session subscription list yet. The client already
 * filters by `chunk.sessionId` (`TranscriptScreen.tsx`'s `onTranscriptChunk`
 * handler), so an app instance not viewing this session harmlessly discards
 * chunks that aren't for its open screen.
 */
function broadcastTranscriptChunk(payload: TranscriptChunkPayload): void {
  for (const ws of authedSockets) {
    send(ws, 'transcript_chunk', payload, payload.sessionId);
  }
}

/**
 * Fire-and-forget: spawns the agent CLI for a routed prompt and streams its
 * output as `transcript_chunk` broadcasts, appending each message to
 * `sessionRegistry` (REAL_AGENT_CONNECTION_PLAN.md §4 Track A step 3).
 * Deliberately not awaited by `handleRouteInput` — the immediate
 * `action_result: prompt_routed` reply (asserted by
 * `bridge-e2e.test.ts`'s existing lifecycle test) must not block on a whole
 * agent turn, which can take many seconds.
 *
 * `cwd`/`agent` are resolved from the live tmux session list (not just
 * whatever was previously registered) so a session's actual current working
 * directory/agent-kind heuristic (`tmux.ts`'s doc explains the agent-kind
 * guess) seeds the registry the first time this session sends a prompt.
 */
async function spawnAndStreamTurn(sessionId: string, prompt: string): Promise<void> {
  const sessions = await listTmuxSessions();
  const tmuxSession = sessions.find((s) => s.id === sessionId || s.name === sessionId);
  if (!tmuxSession) {
    console.error(`[pig-bridge] spawnAndStreamTurn: session "${sessionId}" not found in tmux, skipping agent spawn`);
    return;
  }

  const ctx = getOrCreateSession(sessionId, tmuxSession.folder, tmuxSession.agent);
  console.log(`[pig-bridge] >>> Spawning agent (${ctx.agent}) in "${ctx.cwd}" for prompt: "${prompt}"`);

  const userMessage: TranscriptMessage = {
    id: randomUUID(),
    role: 'user',
    timestamp: new Date().toISOString(),
    content: prompt,
  };
  appendTurn(sessionId, userMessage);

  const handle = spawnAgentInTmuxWindow({
    sessionName: sessionId,
    windowName: `turn-${Date.now()}`,
    cwd: ctx.cwd,
    agent: ctx.agent,
    prompt,
    onChunk: (chunk) => {
      console.log(`[pig-bridge] <<< Agent chunk for session "${sessionId}" [done: ${chunk.done}]: "${chunk.message.content.slice(-40)}"`);
      appendTurn(sessionId, chunk.message);
      broadcastTranscriptChunk(chunk);
      if (chunk.done) {
        setActiveHandle(sessionId, undefined);
      }
    },
    onExit: (code) => {
      console.log(`[pig-bridge] Agent subprocess exited with code ${code} for session "${sessionId}"`);
      if (code !== 0) {
        console.error(`[pig-bridge] agent process for session "${sessionId}" exited with code ${code}`);
      }
      setActiveHandle(sessionId, undefined);
    },
  });
  setActiveHandle(sessionId, handle);
}

async function handleRouteInput(ws: WebSocket, envelope: Envelope<RouteInputPayload>): Promise<void> {
  const { text, sessionId } = envelope.payload;
  console.log(`[pig-bridge] >>> Inbound route_input received from client for session "${sessionId}": "${text}"`);

  const result = await routeInput(envelope.payload, envelope.id);
  send(ws, 'action_result', result, envelope.sessionId, envelope.id);

  // Side effect, not part of the response above: a successfully-routed
  // prompt also spawns the real agent turn and streams it. Not awaited —
  // see spawnAndStreamTurn's doc for why the action_result reply above must
  // stay immediate.
  if (result.kind === 'prompt_routed' && result.cleanedPrompt) {
    void spawnAndStreamTurn(sessionId, result.cleanedPrompt).catch((err: unknown) => {
      console.error(`[pig-bridge] spawnAndStreamTurn failed for session "${sessionId}":`, err);
    });
  }
}

async function handleActionConfirm(ws: WebSocket, envelope: Envelope<ActionConfirmPayload>): Promise<void> {
  const result = await confirmAction(envelope.payload);
  send(ws, 'action_result', result, envelope.sessionId, envelope.id);
}

function handlePing(ws: WebSocket, envelope: Envelope<Record<string, never>>): void {
  send(ws, 'pong', {}, envelope.sessionId, envelope.id);
}

async function handleFsList(ws: WebSocket, envelope: Envelope<FsListPayload>): Promise<void> {
  const result = await listDirectory(envelope.payload?.path);
  send(ws, 'fs_list_result', result, envelope.sessionId, envelope.id);
}

async function handleFsRead(ws: WebSocket, envelope: Envelope<FsReadPayload>): Promise<void> {
  const result = await readFileContent(envelope.payload.path);
  send(ws, 'fs_read_result', result, envelope.sessionId, envelope.id);
}

async function handleSetOpenRouterKey(ws: WebSocket, envelope: Envelope<SetOpenRouterKeyPayload>): Promise<void> {
  const result = saveOpenRouterKey(envelope.payload?.apiKey);
  send(ws, 'set_openrouter_key_ack', result, envelope.sessionId, envelope.id);
}

async function handleGetOpenRouterKey(ws: WebSocket, envelope: Envelope<GetOpenRouterKeyPayload>): Promise<void> {
  const result = getOpenRouterKeySettings();
  send(ws, 'get_openrouter_key_ack', result, envelope.sessionId, envelope.id);
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
    case 'fs_list':
      return handleFsList(ws, envelope as Envelope<FsListPayload>);
    case 'fs_read':
      return handleFsRead(ws, envelope as Envelope<FsReadPayload>);
    case 'set_openrouter_key':
      return handleSetOpenRouterKey(ws, envelope as Envelope<SetOpenRouterKeyPayload>);
    case 'get_openrouter_key':
      return handleGetOpenRouterKey(ws, envelope as Envelope<GetOpenRouterKeyPayload>);
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
