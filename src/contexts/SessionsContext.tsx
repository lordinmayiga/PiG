import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Session } from '../types';
import { useBridge } from './BridgeContext';

interface SessionsContextValue {
  sessions: Session[];
  isLoadingSessions: boolean;
  createSession: (name: string, cwd?: string) => Promise<void>;
  killSession: (sessionId: string) => Promise<void>;
  renameSession: (oldName: string, newName: string) => Promise<void>;
  /** Optimistic local removal */
  removeSessionLocally: (sessionId: string) => void;
  /** Optimistic local insert */
  addSessionLocally: (session: Session) => void;
  /** Optimistic local rename */
  renameSessionLocally: (sessionId: string, name: string) => void;
  /** Escape hatch for SessionsScreen's `__DEV__`-only "preview empty state"
   * toggle — swaps the whole list rather than mutating one entry. Not meant
   * for anything but that dev affordance. */
  setSessionsLocally: (sessions: Session[]) => void;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const { client } = useBridge();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rawLoading, setRawLoading] = useState<boolean>(true);
  const isLoadingSessions = !client ? false : rawLoading;

  useEffect(() => {
    if (!client) return;
    const unsubscribeResync = client.onResyncSnapshot((snapshot) => {
      setSessions(snapshot.sessions);
      setRawLoading(false);
    });
    const unsubscribeUpdate = client.onSessionListUpdate((update) => {
      setSessions(update.sessions);
      setRawLoading(false);
    });
    const unsubscribeStatus = client.onConnectionStatus((status) => {
      if (status === 'connected') {
        client.requestResync();
      }
    });

    if (client.getStatus() === 'connected') {
      client.requestResync();
    }

    return () => {
      unsubscribeResync();
      unsubscribeUpdate();
      unsubscribeStatus();
    };
  }, [client]);

  const createSession = useCallback(
    async (name: string, cwd?: string) => {
      if (!client) {
        console.warn('[SessionsContext] No bridge client to create session');
        return;
      }
      const commandText = cwd ? `new session ${name} in ${cwd}` : `new session ${name}`;
      client.sendRouteInput({
        sessionId: name,
        text: commandText,
      });
      client.requestResync();
    },
    [client],
  );

  const killSession = useCallback(
    async (sessionId: string) => {
      if (!client) {
        console.warn('[SessionsContext] No bridge client to kill session');
        return;
      }
      const requestId = client.sendRouteInput({
        sessionId,
        text: `kill session ${sessionId}`,
      });
      const unsub = client.onActionResult((result) => {
        if (result.requestId === requestId) {
          unsub();
          if (result.kind === 'action_pending_confirm' && result.actionId) {
            // actionId (the pending action's own id), not requestId (which
            // just correlates back to this route_input) — see
            // ActionResultPayload's doc comment.
            client.sendActionConfirm({ actionId: result.actionId, confirmed: true }, sessionId);
            client.requestResync();
          }
        }
      });
      setTimeout(() => {
        unsub();
        client.requestResync();
      }, 1000);
    },
    [client],
  );

  const renameSession = useCallback(
    async (oldName: string, newName: string) => {
      if (!client) {
        console.warn('[SessionsContext] No bridge client to rename session');
        return;
      }
      await client.renameSession(oldName, newName);
      client.requestResync();
    },
    [client],
  );

  const value: SessionsContextValue = {
    sessions,
    isLoadingSessions,
    createSession,
    killSession,
    renameSession,
    removeSessionLocally: (sessionId) => setSessions((prev) => prev.filter((s) => s.id !== sessionId)),
    addSessionLocally: (session) => setSessions((prev) => [session, ...prev]),
    renameSessionLocally: (sessionId, name) =>
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, name } : s))),
    setSessionsLocally: setSessions,
  };

  return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>;
}

export function useSessions(): SessionsContextValue {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error('useSessions must be used within a SessionsProvider');
  return ctx;
}
