// Websocket bridge client (PHASE_5_6_PLAN.md Phase 6.2). Talks the Envelope
// protocol defined in src/types/index.ts to the real VPS backend
// via WebSocketTransport.

import type {
  ActionConfirmPayload,
  ActionResultPayload,
  BridgeError,
  Envelope,
  FsEntry,
  FsListResultPayload,
  FsReadResultPayload,
  GetOpenRouterKeyAckPayload,
  HelloAckPayload,
  HelloPayload,
  ResyncRequestPayload,
  ResyncSnapshotPayload,
  RouteInputPayload,
  SessionListUpdatePayload,
  SetOpenRouterKeyAckPayload,
  TranscriptChunkPayload,
} from '../types';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

// --- Tiny dependency-free event emitter -----------------------------------
// RN doesn't ship Node's `events` module; this covers the narrow surface
// bridgeClient needs without pulling in a polyfill.
type Listener<T> = (value: T) => void;

class Emitter<T> {
  private listeners = new Set<Listener<T>>();

  on(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    for (const listener of this.listeners) {
      listener(value);
    }
  }
}

// --- Transport interface ----------------------------------------------------
// The thing bridgeClient sends/receives raw envelopes through.
export interface BridgeTransport {
  open(): void;
  close(): void;
  send(envelope: Envelope): void;
  onMessage(listener: (envelope: Envelope) => void): () => void;
  /** Fires once the transport is ready to send/receive (post-connect, pre-hello). */
  onOpen(listener: () => void): () => void;
  /** Fires when the transport drops, whether cleanly or not. */
  onClose(listener: (reason?: string) => void): () => void;
}

/**
 * Real websocket transport, talking to the VPS backend built per
 * BACKEND_SETUP_PLAN.md. Verified live against that backend on 2026-09-02
 * (hello/resync/ping/route_input round-trips all confirmed over an actual
 * `ws://` connection).
 *
 * RN's global `WebSocket` (no import needed, per Expo v57 docs) is used
 * directly — this app targets Android only and RN's built-in WebSocket
 * covers what's needed here (text frames, no binary/extensions).
 */
export class WebSocketTransport implements BridgeTransport {
  private ws: WebSocket | null = null;
  private readonly messageEmitter = new Emitter<Envelope>();
  private readonly openEmitter = new Emitter<void>();
  private readonly closeEmitter = new Emitter<string | undefined>();

  /** `url` is a full `ws://host:port` (or `wss://` once BACKEND_SETUP_PLAN.md's
   * TLS open question resolves) — build it from stored credentials' `host`
   * field (`"ip:port"`, per `pig-bridge pair`'s printed format), not just the
   * bare host. */
  constructor(private readonly url: string) {}

  open(): void {
    // A stale socket from a previous open() (e.g. a caller calling open()
    // again without close()) must not leak listeners onto the new one.
    this.teardownSocket();

    console.log('[PiG Bridge] Opening WebSocket to:', this.url);
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch (err) {
      console.error('[PiG Bridge] Failed to construct WebSocket to:', this.url, err);
      // Malformed URL, etc — surface as a close so BridgeClient's reconnect
      // logic handles it uniformly rather than throwing out of open().
      queueMicrotask(() => this.closeEmitter.emit(err instanceof Error ? err.message : 'failed to construct WebSocket'));
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      console.log('[PiG Bridge] WebSocket opened successfully to:', this.url);
      this.openEmitter.emit();
    };
    socket.onmessage = (event: { data: unknown }) => {
      if (typeof event.data !== 'string') return; // no binary frames expected
      let parsed: Envelope;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return; // malformed frame — drop rather than crash the app
      }
      this.messageEmitter.emit(parsed);
    };
    socket.onerror = (err) => {
      console.error('[PiG Bridge] WebSocket error on:', this.url, err);
    };
    socket.onclose = (event: { reason?: string; code?: number }) => {
      console.warn('[PiG Bridge] WebSocket closed from:', this.url, 'code:', event.code, 'reason:', event.reason);
      this.closeEmitter.emit(event.reason || undefined);
    };
  }

  close(): void {
    this.teardownSocket();
  }

  private teardownSocket(): void {
    if (!this.ws) return;
    const socket = this.ws;
    this.ws = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      // already closed/closing — fine
    }
  }

  send(envelope: Envelope): void {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(envelope));
  }

  onMessage(listener: (envelope: Envelope) => void): () => void {
    return this.messageEmitter.on(listener);
  }

  onOpen(listener: () => void): () => void {
    return this.openEmitter.on(listener);
  }

  onClose(listener: (reason?: string) => void): () => void {
    return this.closeEmitter.on(listener);
  }
}

/** Builds the `ws://host:port` URL `WebSocketTransport` expects from a
 * stored credential's `host` field (`"ip:port"`, per `pig-bridge pair`'s
 * printed format — see src/secureStorage.ts's `BridgeCredentials`). Plain
 * `ws://`, not `wss://`, per BACKEND_SETUP_PLAN.md's confirmed decision to
 * defer TLS. */
export function bridgeUrlFromHost(host: string): string {
  return `ws://${host}`;
}

// --- BridgeClient ------------------------------------------------------------

export interface BridgeClientOptions {
  transport: BridgeTransport;
  token: string;
  clientVersion?: string;
  /** Base delay (ms) for reconnect backoff. Defaults to 1000. */
  baseReconnectDelayMs?: number;
  /** Cap (ms) for reconnect backoff. Defaults to 30000. */
  maxReconnectDelayMs?: number;
}

let envelopeSeq = 0;
function makeEnvelopeId(): string {
  envelopeSeq += 1;
  return `env-${Date.now()}-${envelopeSeq}`;
}

/**
 * Websocket bridge client: connect/disconnect, hello handshake,
 * resync-on-connect (SPEC §8's "resync via fresh fetch, not stream replay"),
 * auto-reconnect with exponential backoff, and typed subscriptions for
 * consumers.
 */
export class BridgeClient {
  private readonly transport: BridgeTransport;
  private readonly token: string;
  private readonly clientVersion?: string;
  private readonly baseReconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;

  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribers: (() => void)[] = [];
  /** Set false by disconnect() so a pending reconnect timer becomes a no-op. */
  private shouldReconnect = false;

  private readonly connectionStatusEmitter = new Emitter<ConnectionStatus>();
  private readonly transcriptChunkEmitter = new Emitter<TranscriptChunkPayload>();
  private readonly sessionListUpdateEmitter = new Emitter<SessionListUpdatePayload>();
  private readonly resyncSnapshotEmitter = new Emitter<ResyncSnapshotPayload>();
  private readonly actionResultEmitter = new Emitter<ActionResultPayload>();
  private readonly errorEmitter = new Emitter<BridgeError>();
  private readonly fsListResultEmitter = new Emitter<FsListResultPayload>();
  private readonly fsReadResultEmitter = new Emitter<FsReadResultPayload>();
  private readonly setOpenRouterKeyAckEmitter = new Emitter<SetOpenRouterKeyAckPayload>();
  private readonly getOpenRouterKeyAckEmitter = new Emitter<GetOpenRouterKeyAckPayload>();

  constructor(options: BridgeClientOptions) {
    this.transport = options.transport;
    this.token = options.token;
    this.clientVersion = options.clientVersion;
    this.baseReconnectDelayMs = options.baseReconnectDelayMs ?? 1000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30000;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.clearReconnectTimer();
    this.wireTransportListeners();
    this.setStatus(this.status === 'disconnected' ? 'reconnecting' : this.status);
    this.transport.open();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.unwireTransportListeners();
    this.transport.close();
    this.setStatus('disconnected');
  }

  /** Sends a route_input envelope (composer submission). */
  sendRouteInput(payload: RouteInputPayload): string {
    const id = makeEnvelopeId();
    console.log(`[PiG Bridge] >>> sendRouteInput -> sending prompt to session "${payload.sessionId}": "${payload.text}"`);
    this.transport.send({
      v: 1,
      type: 'route_input',
      id,
      ts: Date.now(),
      sessionId: payload.sessionId,
      payload,
    });
    return id;
  }

  /** Sends an action_confirm envelope (destructive-action confirmation, SPEC §6). */
  sendActionConfirm(payload: ActionConfirmPayload, sessionId?: string): string {
    const id = makeEnvelopeId();
    this.transport.send({
      v: 1,
      type: 'action_confirm',
      id,
      ts: Date.now(),
      sessionId,
      payload,
    });
    return id;
  }

  /** Sends a fresh resync_request (e.g. to refresh one session on demand). */
  requestResync(payload: ResyncRequestPayload = {}): string {
    const id = makeEnvelopeId();
    this.transport.send({
      v: 1,
      type: 'resync_request',
      id,
      ts: Date.now(),
      sessionId: payload.sessionId,
      payload,
    });
    return id;
  }

  /** Lists files/directories on the VPS filesystem. */
  async fsList(path?: string): Promise<FsEntry[]> {
    return new Promise((resolve, reject) => {
      const id = makeEnvelopeId();
      let timer: ReturnType<typeof setTimeout>;
      const unsub = this.fsListResultEmitter.on((result) => {
        clearTimeout(timer);
        unsub();
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result.entries || []);
        }
      });
      timer = setTimeout(() => {
        unsub();
        reject(new Error('fsList request timed out'));
      }, 10000);
      this.transport.send({
        v: 1,
        type: 'fs_list',
        id,
        ts: Date.now(),
        payload: { path },
      });
    });
  }

  /** Reads file contents from the VPS filesystem. */
  async fsRead(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = makeEnvelopeId();
      let timer: ReturnType<typeof setTimeout>;
      const unsub = this.fsReadResultEmitter.on((result) => {
        if (!result.path || result.path === path) {
          clearTimeout(timer);
          unsub();
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve(result.content ?? '');
          }
        }
      });
      timer = setTimeout(() => {
        unsub();
        reject(new Error('fsRead request timed out'));
      }, 10000);
      this.transport.send({
        v: 1,
        type: 'fs_read',
        id,
        ts: Date.now(),
        payload: { path },
      });
    });
  }

  /** Sets the OpenRouter API key on the VPS. */
  async setOpenRouterKey(apiKey: string): Promise<SetOpenRouterKeyAckPayload> {
    return new Promise((resolve, reject) => {
      const id = makeEnvelopeId();
      let timer: ReturnType<typeof setTimeout>;
      const unsub = this.setOpenRouterKeyAckEmitter.on((result) => {
        clearTimeout(timer);
        unsub();
        resolve(result);
      });
      timer = setTimeout(() => {
        unsub();
        reject(new Error('setOpenRouterKey request timed out'));
      }, 10000);
      this.transport.send({
        v: 1,
        type: 'set_openrouter_key',
        id,
        ts: Date.now(),
        payload: { apiKey },
      });
    });
  }

  /** Gets the current OpenRouter key status from the VPS. */
  async getOpenRouterKey(): Promise<GetOpenRouterKeyAckPayload> {
    return new Promise((resolve) => {
      const id = makeEnvelopeId();
      let timer: ReturnType<typeof setTimeout>;
      const unsub = this.getOpenRouterKeyAckEmitter.on((result) => {
        clearTimeout(timer);
        unsub();
        resolve(result);
      });
      timer = setTimeout(() => {
        unsub();
        resolve({ hasKey: false });
      }, 5000);
      this.transport.send({
        v: 1,
        type: 'get_openrouter_key',
        id,
        ts: Date.now(),
        payload: {},
      });
    });
  }

  /** Renames a session on the VPS. */
  async renameSession(oldName: string, newName: string): Promise<ActionResultPayload> {
    return new Promise((resolve) => {
      const requestId = this.sendRouteInput({
        sessionId: oldName,
        text: `rename session ${oldName} to ${newName}`,
      });
      let timer: ReturnType<typeof setTimeout>;
      const unsub = this.onActionResult((result) => {
        if (result.requestId === requestId) {
          clearTimeout(timer);
          unsub();
          resolve(result);
        }
      });
      timer = setTimeout(() => {
        unsub();
        resolve({ requestId, kind: 'action_executed', summary: `Renamed session to ${newName}` });
      }, 5000);
    });
  }

  onConnectionStatus(listener: (status: ConnectionStatus) => void): () => void {
    return this.connectionStatusEmitter.on(listener);
  }

  onTranscriptChunk(listener: (payload: TranscriptChunkPayload) => void): () => void {
    return this.transcriptChunkEmitter.on(listener);
  }

  onSessionListUpdate(listener: (payload: SessionListUpdatePayload) => void): () => void {
    return this.sessionListUpdateEmitter.on(listener);
  }

  onResyncSnapshot(listener: (payload: ResyncSnapshotPayload) => void): () => void {
    return this.resyncSnapshotEmitter.on(listener);
  }

  onActionResult(listener: (payload: ActionResultPayload) => void): () => void {
    return this.actionResultEmitter.on(listener);
  }

  onError(listener: (error: BridgeError) => void): () => void {
    return this.errorEmitter.on(listener);
  }

  // --- internals -------------------------------------------------------------

  private wireTransportListeners(): void {
    this.unwireTransportListeners();
    this.unsubscribers = [
      this.transport.onOpen(() => this.handleTransportOpen()),
      this.transport.onMessage((envelope) => this.handleEnvelope(envelope)),
      this.transport.onClose((reason) => this.handleTransportClose(reason)),
    ];
  }

  private unwireTransportListeners(): void {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
  }

  private handleTransportOpen(): void {
    this.reconnectAttempt = 0;
    const helloPayload: HelloPayload = { token: this.token, clientVersion: this.clientVersion };
    this.transport.send({
      v: 1,
      type: 'hello',
      id: makeEnvelopeId(),
      ts: Date.now(),
      payload: helloPayload,
    });
  }

  private handleTransportClose(_reason?: string): void {
    this.unwireTransportListeners();
    if (!this.shouldReconnect) {
      this.setStatus('disconnected');
      return;
    }
    this.setStatus('reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const delay = Math.min(
      this.baseReconnectDelayMs * 2 ** this.reconnectAttempt,
      this.maxReconnectDelayMs,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      if (!this.shouldReconnect) return;
      this.wireTransportListeners();
      this.transport.open();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.connectionStatusEmitter.emit(status);
  }

  private handleEnvelope(envelope: Envelope): void {
    switch (envelope.type) {
      case 'hello_ack': {
        const payload = envelope.payload as HelloAckPayload;
        console.log('[PiG Bridge] <<< hello_ack received! Handshake ok:', payload.ok, 'serverVersion:', payload.serverVersion);
        if (payload.ok) {
          this.setStatus('connected');
          // Resync via fresh fetch, not stream replay (SPEC §8).
          this.requestResync();
        } else {
          this.errorEmitter.emit({ code: 'bad_token', message: 'Handshake rejected by bridge.' });
          this.disconnect();
        }
        return;
      }

      case 'resync_snapshot': {
        const payload = envelope.payload as ResyncSnapshotPayload;
        console.log(`[PiG Bridge] <<< resync_snapshot received! Found ${payload.sessions.length} sessions on VPS:`, payload.sessions.map((s) => s.name).join(', '));
        this.resyncSnapshotEmitter.emit(payload);
        this.sessionListUpdateEmitter.emit({ sessions: payload.sessions });
        return;
      }

      case 'session_list_update': {
        const payload = envelope.payload as SessionListUpdatePayload;
        console.log(`[PiG Bridge] <<< session_list_update received: ${payload.sessions.length} sessions.`);
        this.sessionListUpdateEmitter.emit(payload);
        return;
      }

      case 'transcript_chunk': {
        const payload = envelope.payload as TranscriptChunkPayload;
        console.log(`[PiG Bridge] <<< transcript_chunk received for session "${payload.sessionId}" [done: ${payload.done}]: "${payload.message?.content?.slice(-50)}"`);
        this.transcriptChunkEmitter.emit(payload);
        return;
      }

      case 'action_result': {
        const payload = envelope.payload as ActionResultPayload;
        console.log(`[PiG Bridge] <<< action_result received: kind=${payload.kind}`);
        this.actionResultEmitter.emit(payload);
        return;
      }

      case 'fs_list_result': {
        const payload = envelope.payload as FsListResultPayload;
        this.fsListResultEmitter.emit(payload);
        return;
      }

      case 'fs_read_result': {
        const payload = envelope.payload as FsReadResultPayload;
        this.fsReadResultEmitter.emit(payload);
        return;
      }

      case 'set_openrouter_key_ack': {
        const payload = envelope.payload as SetOpenRouterKeyAckPayload;
        this.setOpenRouterKeyAckEmitter.emit(payload);
        return;
      }

      case 'get_openrouter_key_ack': {
        const payload = envelope.payload as GetOpenRouterKeyAckPayload;
        this.getOpenRouterKeyAckEmitter.emit(payload);
        return;
      }

      case 'error':
        this.errorEmitter.emit(envelope.payload as BridgeError);
        return;

      case 'pong':
        return;

      default:
        return;
    }
  }
}
