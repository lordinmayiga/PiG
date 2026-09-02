/**
 * Secure credential storage, backed by expo-secure-store (the platform
 * keychain/Keystore) rather than AsyncStorage — the bridge host + pairing
 * token are secrets, per SPEC.md §12 / PHASE_5_6_PLAN.md workstream A.
 * Kept separate from storage.ts's plain-preferences layer: different
 * backing store, different sensitivity, no reason to mix them.
 *
 * Same best-effort contract as storage.ts: a failed read/write never
 * throws to the caller. A failed *read* falls back to "no credentials"
 * (i.e. "not paired") — the safe direction to fail in, since it can only
 * bounce the user back to Setup, never fake a paired state.
 *
 * "Paired" is derived from "do credentials exist" — there is no separate
 * paired flag to fall out of sync with the credentials themselves.
 */
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  host: 'pig.bridge.host',
  token: 'pig.bridge.token',
} as const;

export interface BridgeCredentials {
  host: string;
  token: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Notified after every successful save/clear, so RootNavigator (which
 * reads paired state once on mount) can react to a disconnect from deep in
 * the tab shell without threading a callback prop through every navigator
 * in between. Deliberately not a full Context — Phase 5 item 3 owns that.
 */
export function subscribeToCredentialsChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyCredentialsChanged(): void {
  listeners.forEach((listener) => listener());
}

export async function saveBridgeCredentials({ host, token }: BridgeCredentials): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEYS.host, host);
    await SecureStore.setItemAsync(KEYS.token, token);
    notifyCredentialsChanged();
  } catch {
    // Best-effort — see file header.
  }
}

export async function loadBridgeCredentials(): Promise<BridgeCredentials | null> {
  try {
    const [host, token] = await Promise.all([
      SecureStore.getItemAsync(KEYS.host),
      SecureStore.getItemAsync(KEYS.token),
    ]);
    if (!host || !token) return null;
    return { host, token };
  } catch {
    return null;
  }
}

export async function clearBridgeCredentials(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.host),
      SecureStore.deleteItemAsync(KEYS.token),
    ]);
    notifyCredentialsChanged();
  } catch {
    // Best-effort — see file header.
  }
}
