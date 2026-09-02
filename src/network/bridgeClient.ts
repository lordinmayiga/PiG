// Websocket bridge client (PHASE_5_6_PLAN.md Phase 6.2). Talks the Envelope
// protocol defined in src/types/index.ts to either the real VPS backend
// (SPEC.md §4, not yet built) or the in-process dev fixture in
// src/dev/mockBridgeServer.ts, via an injected `BridgeTransport` — swapping
// the real websocket in later is a constructor argument change, not a
// rewrite. This module is standalone: nothing wires it into a screen/context
// yet, that's deliberately follow-up work.

import {
  handleMockBridgeMessage,
  type MockServerSocket,
} from '../dev/mockBridgeServer';
import type {
  ActionConfirmPayload,
  ActionResultPayload,
  BridgeError,
  Envelope,
  HelloAckPayload,
  HelloPayload,
  ResyncRequestPayload,
  ResyncSnapshotPayload,
  RouteInputPayload,
  SessionListUpdatePayload,
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
// The thing bridgeClient sends/receives raw envelopes through. A real
// backend connection and the in-process mock both implement this.
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
 * In-process transport that hands outgoing envelopes straight to
 * handleMockBridgeMessage and delivers its replies back synchronously (on a
 * microtask, to keep behavior consistent with a real async socket). No
 * network involved — see src/dev/mockBridgeServer.ts.
 */
export class MockTransport implements BridgeTransport {
  private messageEmitter = new Emitter<Envelope>();
  private openEmitter = new Emitter<void>();
  private closeEmitter = new Emitter<string | undefined>();
  private opened = false;

  private socket: MockServerSocket = {
    send: (envelope) => {
      // Simulate network async-ness so consumers can't accidentally depend
      // on synchronous delivery.
      queueMicrotask(() => {
        if (this.opened) {
          this.messageEmitter.emit(envelope);
        }
      });
    },
  };

  open(): void {
    this.opened = true;
    queueMicrotask(() => this.openEmitter.emit());
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.closeEmitter.emit(undefined);
  }

  send(envelope: Envelope): void {
    if (!this.opened) return;
    queueMicrotask(() => handleMockBridgeMessage(envelope, this.socket));
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

/**
 * Real websocket transport, talking to the VPS backend built per
 * BACKEND_SETUP_PLAN.md. Verified live against that backend on 2026-09-02
 * (hello/resync/ping/route_input round-trips all confirmed over an actual
 * `ws://` connection). Kept behind the same `BridgeTransport` interface as
 * `MockTransport` so which one a caller constructs with is the only
 * difference — nothing else in `BridgeClient` changes.
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

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch (err) {
      // Malformed URL, etc — surface as a close so BridgeClient's reconnect
      // logic handles it uniformly rather than throwing out of open().
      queueMicrotask(() => this.closeEmitter.emit(err instanceof Error ? err.message : 'failed to construct WebSocket'));
      return;
    }
    this.ws = socket;

    socket.onopen = () => this.openEmitter.emit();
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
    socket.onerror = () => {
      // RN's WebSocket error events carry little detail; the ensuing
      // `onclose` (which always fires after `onerror`) is what actually
      // drives BridgeClient's reconnect — this is just for local debugging.
    };
    socket.onclose = (event: { reason?: string }) => {
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
 * consumers. Construct with `transport: new MockTransport()` for now; a real
 * `WebSocketTransport` slots in later without changing this class.
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
        this.resyncSnapshotEmitter.emit(envelope.payload as ResyncSnapshotPayload);
        const payload = envelope.payload as ResyncSnapshotPayload;
        this.sessionListUpdateEmitter.emit({ sessions: payload.sessions });
        return;
      }

      case 'session_list_update':
        this.sessionListUpdateEmitter.emit(envelope.payload as SessionListUpdatePayload);
        return;

      case 'transcript_chunk':
        this.transcriptChunkEmitter.emit(envelope.payload as TranscriptChunkPayload);
        return;

      case 'action_result':
        this.actionResultEmitter.emit(envelope.payload as ActionResultPayload);
        return;

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
