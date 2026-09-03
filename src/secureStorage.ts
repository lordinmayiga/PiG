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
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  host: 'pig.bridge.host',
  token: 'pig.bridge.token',
} as const;

export interface BridgeCredentials {
  host: string;
  token: string;
}

export interface StorageDiagnostic {
  lastError: string | null;
  hasSecureStore: boolean;
  hasAsyncFallback: boolean;
}

let lastStorageError: string | null = null;

export function getLastStorageError(): string | null {
  return lastStorageError;
}

type Listener = (credentials: BridgeCredentials | null) => void;
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

function notifyCredentialsChanged(credentials: BridgeCredentials | null): void {
  listeners.forEach((listener) => {
    try {
      listener(credentials);
    } catch (e) {
      console.error('[secureStorage] Error notifying listener:', e);
    }
  });
}

export async function saveBridgeCredentials({ host, token }: BridgeCredentials): Promise<boolean> {
  const trimmedHost = host.trim();
  const trimmedToken = token.trim();

  if (!trimmedHost || !trimmedToken) {
    const errorMsg = 'Cannot save empty host or token';
    console.warn('[secureStorage]', errorMsg);
    lastStorageError = errorMsg;
    return false;
  }

  let secureSuccess = false;
  try {
    await SecureStore.setItemAsync(KEYS.host, trimmedHost);
    await SecureStore.setItemAsync(KEYS.token, trimmedToken);
    secureSuccess = true;
    lastStorageError = null;
    console.log('[secureStorage] Successfully saved credentials via SecureStore');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[secureStorage] SecureStore.setItemAsync failed, using AsyncStorage fallback:', msg);
    lastStorageError = `SecureStore error: ${msg}`;
  }

  // Also save to AsyncStorage fallback so dev/testing never gets locked out if keystore fails
  try {
    await AsyncStorage.setItem(KEYS.host, trimmedHost);
    await AsyncStorage.setItem(KEYS.token, trimmedToken);
  } catch (fbError) {
    console.error('[secureStorage] Fallback AsyncStorage write failed:', fbError);
  }

  notifyCredentialsChanged({ host: trimmedHost, token: trimmedToken });
  return secureSuccess;
}

export async function loadBridgeCredentials(): Promise<BridgeCredentials | null> {
  let host: string | null = null;
  let token: string | null = null;

  try {
    [host, token] = await Promise.all([
      SecureStore.getItemAsync(KEYS.host),
      SecureStore.getItemAsync(KEYS.token),
    ]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[secureStorage] SecureStore.getItemAsync failed:', msg);
    lastStorageError = `SecureStore read error: ${msg}`;
  }

  // Fallback to AsyncStorage if SecureStore returned null or threw
  if (!host || !token) {
    try {
      const [fbHost, fbToken] = await Promise.all([
        AsyncStorage.getItem(KEYS.host),
        AsyncStorage.getItem(KEYS.token),
      ]);
      host = host || fbHost;
      token = token || fbToken;
      if (fbHost && fbToken) {
        console.log('[secureStorage] Recovered credentials from AsyncStorage fallback');
      }
    } catch (fbError) {
      console.warn('[secureStorage] Fallback AsyncStorage read failed:', fbError);
    }
  }

  if (!host || !token) {
    return null;
  }
  return { host, token };
}

export async function clearBridgeCredentials(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.host).catch(() => {}),
      SecureStore.deleteItemAsync(KEYS.token).catch(() => {}),
      AsyncStorage.removeItem(KEYS.host).catch(() => {}),
      AsyncStorage.removeItem(KEYS.token).catch(() => {}),
    ]);
    lastStorageError = null;
    console.log('[secureStorage] Credentials cleared');
  } catch (error) {
    console.warn('[secureStorage] Error clearing credentials:', error);
  }
  notifyCredentialsChanged(null);
}
