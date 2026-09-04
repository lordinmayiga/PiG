/**
 * Mounts/tears down the singleton bridge connection (src/network/bridgeConnection.ts)
 * against whatever credentials are currently paired, and exposes live
 * connection status to the tab shell (PHASE_5_6_PLAN.md's "expose a
 * ConnectionStatus that SessionsContext surfaces as the disconnected
 * indicator"). Mounted once, wrapping TabNavigator — RootNavigator only
 * renders TabNavigator once paired, so by the time this provider is alive
 * credentials are known to exist; it still re-checks on every
 * credentials-change notification so a mid-session unpair (Settings'
 * disconnect) tears the connection down rather than leaving it dangling.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { loadBridgeCredentials, clearBridgeCredentials, subscribeToCredentialsChange } from '../secureStorage';
import { connectBridge, disconnectBridge, type ConnectionStatus } from '../network/bridgeConnection';
import type { BridgeClient } from '../network/bridgeClient';

interface BridgeContextValue {
  client: BridgeClient | null;
  status: ConnectionStatus;
}

const BridgeContext = createContext<BridgeContextValue>({ client: null, status: 'disconnected' });

export function BridgeProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<BridgeClient | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  useEffect(() => {
    let cancelled = false;
    let unsubscribeStatus: (() => void) | null = null;
    let unsubscribeError: (() => void) | null = null;

    const syncFromCredentials = async () => {
      const credentials = await loadBridgeCredentials();
      if (cancelled) return;

      unsubscribeStatus?.();
      unsubscribeStatus = null;
      unsubscribeError?.();
      unsubscribeError = null;

      if (!credentials) {
        disconnectBridge();
        setClient(null);
        setStatus('disconnected');
        return;
      }

      disconnectBridge();
      const bridgeClient = connectBridge(credentials.host, credentials.token);
      setClient(bridgeClient);
      setStatus(bridgeClient.getStatus());
      unsubscribeStatus = bridgeClient.onConnectionStatus(setStatus);
      unsubscribeError = bridgeClient.onError((err) => {
        if (err.code === 'bad_token') {
          console.warn('[BridgeContext] bad_token received from VPS, clearing credentials');
          void clearBridgeCredentials();
        }
      });
    };

    void syncFromCredentials();
    // Re-sync on pair/unpair so a mid-session Settings disconnect tears the
    // bridge connection down, and a fresh pairing (re-running Setup after a
    // clear) connects against the new credentials.
    const unsubscribeCredentials = subscribeToCredentialsChange(syncFromCredentials);

    return () => {
      cancelled = true;
      unsubscribeStatus?.();
      unsubscribeError?.();
      unsubscribeCredentials();
    };
  }, []);

  return <BridgeContext.Provider value={{ client, status }}>{children}</BridgeContext.Provider>;
}

export function useBridge(): BridgeContextValue {
  return useContext(BridgeContext);
}
