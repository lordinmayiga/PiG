/**
 * Local mock state/types for the first-run Setup flow (SPEC.md §3.7,
 * pig-architecture-decisions). Phase 4 builds against mock state only —
 * there is no real pairing handshake yet, so `resolveOutcome` below stands
 * in for the VPS round-trip.
 */

export type SetupStep = 'connect' | 'connecting' | 'success' | 'error' | 'openrouter';

export type ConnectMode = 'scan' | 'manual';

export type ErrorVariant = 'unreachable' | 'invalid-token' | 'timeout';

export type ConnectOutcome = 'success' | ErrorVariant;

export interface ConnectFormState {
  host: string;
  token: string;
}

export const emptyConnectForm: ConnectFormState = { host: '', token: '' };

/**
 * No real backend to hit yet (Phase 6), so pairing outcome is derived from
 * what's typed — lets every state (success + all three error variants) be
 * reached by hand for demo/dev purposes without a live VPS. A dev-only
 * outcome switcher (below/in ConnectStep) can also force one directly.
 *
 * Heuristics: an empty/"bad"/"unreachable" host → unreachable-host error;
 * an empty/short/"expired"/"bad" token → invalid-token error; a host
 * containing "timeout" → timeout error; anything else → success.
 */
export function resolveOutcome(form: ConnectFormState, forced: ConnectOutcome | null): ConnectOutcome {
  if (forced) return forced;

  const host = form.host.trim().toLowerCase();
  const token = form.token.trim().toLowerCase();

  if (!host || host.includes('bad') || host.includes('unreachable')) return 'unreachable';
  if (host.includes('timeout') || host.includes('slow')) return 'timeout';
  if (!token || token.length < 4 || token.includes('expired') || token.includes('bad')) return 'invalid-token';
  return 'success';
}

/** The command a VPS-side `pig-bridge pair` run prints, shown copyable in the setup flow. */
export const PAIRING_SETUP_COMMAND = 'pig-bridge pair';
