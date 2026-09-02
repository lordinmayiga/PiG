/**
 * Live session list, backed by the bridge connection (src/contexts/BridgeContext.tsx)
 * instead of SessionsScreen owning its own `useState(mockSessions)`. This is
 * the "wire Contexts into RootNavigator/screens" integration step
 * PHASE_5_6_PLAN.md left for after A–D landed.
 *
 * ## What's real vs. still local-only
 *
 * - **Session list itself**: real. Seeded from the `mockSessions` fixture for
 *   instant paint (same "cache first, resync after" idea as
 *   `transcriptCache.ts`), then replaced by `resync_snapshot`/
 *   `session_list_update` events off the actual `BridgeClient` — against the
 *   mock transport that's `mockBridgeServer.ts`'s canned list; against the
 *   real transport it's this VPS's actual `tmux` sessions
 *   (BACKEND_SETUP_PLAN.md's `tmux.ts`).
 * - **Kill / create / rename**: still optimistic-local-only, NOT sent as real
 *   `action_confirm`/`route_input` envelopes yet. This is a deliberate scope
 *   cut, not an oversight: the real backend's `actions.ts` `confirmAction`
 *   only accepts an `actionId` that references a *prior* `proposeAction` call
 *   (BACKEND_SETUP_PLAN.md phase 5's confirm state machine) — there's no
 *   wire-level way yet for a structured UI action (the New Session sheet's
 *   form, a swipe-to-kill) to originate that proposal directly, only
 *   free-text `route_input` classification does. Wiring these for real needs
 *   either a new structured envelope type or routing UI actions through
 *   `route_input`'s text classifier — a protocol change worth confirming with
 *   the user rather than guessing silently. Rename has no backend action at
 *   all yet (tmux has no "rename session" concept `actions.ts` implements).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { mockSessions } from '../fixtures/sessions';
import type { Session } from '../types';
import { useBridge } from './BridgeContext';

interface SessionsContextValue {
  sessions: Session[];
  /** Optimistic local removal — see file header re: not yet a real action_confirm send. */
  removeSessionLocally: (sessionId: string) => void;
  /** Optimistic local insert — see file header re: not yet a real route_input send. */
  addSessionLocally: (session: Session) => void;
  /** Optimistic local rename — no backend equivalent exists yet at all. */
  renameSessionLocally: (sessionId: string, name: string) => void;
  /** Escape hatch for SessionsScreen's `__DEV__`-only "preview empty state"
   * toggle — swaps the whole list rather than mutating one entry. Not meant
   * for anything but that dev affordance. */
  setSessionsLocally: (sessions: Session[]) => void;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const { client } = useBridge();
  const [sessions, setSessions] = useState<Session[]>(mockSessions);

  useEffect(() => {
    if (!client) return;
    const unsubscribeResync = client.onResyncSnapshot((snapshot) => setSessions(snapshot.sessions));
    const unsubscribeUpdate = client.onSessionListUpdate((update) => setSessions(update.sessions));
    return () => {
      unsubscribeResync();
      unsubscribeUpdate();
    };
  }, [client]);

  const value: SessionsContextValue = {
    sessions,
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
