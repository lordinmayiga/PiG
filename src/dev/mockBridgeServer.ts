// Dev/test scaffolding standing in for the real VPS backend (SPEC.md §4 —
// "Backend service (runs on the VPS)" — not yet built). Everything here runs
// in-process inside the RN app's JS: there is no Node runtime on-device, so
// this is NOT a `ws`/Node websocket server, just a fake "other end of the
// wire" that speaks the same Envelope protocol (src/types/index.ts) as a
// real backend would, over a plain event-emitter transport
// (src/network/bridgeClient.ts's MockTransport).
//
// Used by bridgeClient's mock-transport path so the app is exercisable
// end-to-end before the real backend exists (PHASE_5_6_PLAN.md Phase 6.1).

import { mockSessions } from '../fixtures/sessions';
import { mockTranscript } from '../fixtures/transcripts';
import type {
  ActionResultPayload,
  Envelope,
  HelloAckPayload,
  HelloPayload,
  PongPayload,
  ResyncRequestPayload,
  ResyncSnapshotPayload,
  RouteInputPayload,
} from '../types';

/** Minimal duplex message interface the mock server needs from its transport. */
export interface MockServerSocket {
  /** Deliver a server -> client envelope. */
  send(envelope: Envelope): void;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `mock-${Date.now()}-${seq}`;
}

function envelope<T>(type: Envelope['type'], payload: T, sessionId?: string): Envelope<T> {
  return {
    v: 1,
    type,
    id: nextId(),
    ts: Date.now(),
    sessionId,
    payload,
  };
}

/** Strips leading/trailing whitespace — stand-in for the real /route-input LLM cleanup. */
function fakeCleanPrompt(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Handles one inbound envelope from the app and calls back into `socket.send`
 * with zero or more responses. Stateless across calls except for the id
 * counter above — good enough for a dev fixture, not meant to model real
 * session lifecycle.
 */
export function handleMockBridgeMessage(incoming: Envelope, socket: MockServerSocket): void {
  switch (incoming.type) {
    case 'hello': {
      const payload = incoming.payload as HelloPayload;
      const ok = typeof payload?.token === 'string' && payload.token.length > 0;
      const ack: HelloAckPayload = { ok, serverVersion: 'mock-0.1.0' };
      socket.send(envelope('hello_ack', ack));
      return;
    }

    case 'resync_request': {
      const payload = incoming.payload as ResyncRequestPayload | undefined;
      const snapshot: ResyncSnapshotPayload = {
        sessions: mockSessions,
        sessionId: payload?.sessionId,
        transcript: payload?.sessionId ? mockTranscript : undefined,
        syncCursor: mockTranscript[mockTranscript.length - 1]?.id,
      };
      socket.send(envelope('resync_snapshot', snapshot, payload?.sessionId));
      return;
    }

    case 'route_input': {
      const payload = incoming.payload as RouteInputPayload;
      const result: ActionResultPayload = {
        requestId: incoming.id,
        kind: 'prompt_routed',
        cleanedPrompt: fakeCleanPrompt(payload.text),
        summary: 'Echoed by mock bridge server (no real LLM routing yet).',
      };
      socket.send(envelope('action_result', result, payload.sessionId));
      return;
    }

    case 'action_confirm': {
      const result: ActionResultPayload = {
        requestId: incoming.id,
        kind: 'action_executed',
        summary: 'Mock bridge server accepted the confirmation (no real action executed).',
      };
      socket.send(envelope('action_result', result, incoming.sessionId));
      return;
    }

    case 'ping': {
      const pong: PongPayload = {};
      socket.send(envelope('pong', pong, incoming.sessionId));
      return;
    }

    default:
      // Unknown/unsupported app->backend event for this dev fixture.
      return;
  }
}
