/**
 * Owns the single `BridgeClient` instance for the whole app (PHASE_5_6_PLAN.md's
 * "wire Contexts into RootNavigator/screens" integration step). A plain
 * module-level singleton, not a class — there's exactly one bridge
 * connection per running app, same reasoning `auth.ts` used server-side for
 * its in-memory state.
 *
 * `src/contexts/BridgeContext.tsx` calls `connectBridge`/`disconnectBridge`
 * as credentials appear/disappear (mirroring RootNavigator's paired-state
 * gating); `src/network/routeInput.ts` calls `getBridgeClient()` to send
 * through whatever's currently connected, without needing a client passed
 * down through Composer's props.
 */
import { BridgeClient, MockTransport, WebSocketTransport, bridgeUrlFromHost, type ConnectionStatus } from './bridgeClient';

let client: BridgeClient | null = null;

/** Dev toggle: when true (default), talks to the in-process mock bridge
 * server (src/dev/mockBridgeServer.ts) instead of a real websocket, so the
 * app is exercisable with no VPS backend reachable. Flip to false (or make
 * this a Settings toggle later) once a real paired VPS is expected to be
 * reachable at the stored host. */
export const USE_MOCK_TRANSPORT = true;

/**
 * Creates (if needed) and connects the singleton `BridgeClient` for the
 * given credentials. Calling this again with the client already connected
 * is a no-op — callers (BridgeContext) are expected to call
 * `disconnectBridge()` first if credentials actually changed (e.g.
 * re-pairing against a different host).
 */
export function connectBridge(host: string, token: string): BridgeClient {
  if (client) return client;
  const transport = USE_MOCK_TRANSPORT ? new MockTransport() : new WebSocketTransport(bridgeUrlFromHost(host));
  client = new BridgeClient({ transport, token });
  client.connect();
  return client;
}

/** Returns the current client, or null if nothing's connected yet
 * (unpaired, or BridgeContext hasn't mounted/finished loading credentials). */
export function getBridgeClient(): BridgeClient | null {
  return client;
}

/** Disconnects and drops the singleton, e.g. on unpair (Settings' clear
 * credentials flow) or before reconnecting against different credentials. */
export function disconnectBridge(): void {
  client?.disconnect();
  client = null;
}

export type { ConnectionStatus };
