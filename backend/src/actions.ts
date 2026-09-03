/**
 * Action executor + confirm state machine — SPEC.md §4/§6, BACKEND_SETUP_PLAN.md
 * Phase 5.
 *
 * Handles the four action kinds the app's Composer/ActionResult flow can
 * produce (`kill_session`, `create_session`, `switch_session`, `cd`).
 *
 * ## Confirm state machine
 *
 * `kill_session` is destructive, so it never executes directly. `proposeAction`
 * stores it as a `PendingAction` in an in-memory `Map` keyed by a freshly
 * generated `requestId` and returns `kind: 'action_pending_confirm'` — the app
 * is expected to show a confirm dialog and, on response, send an
 * `action_confirm` envelope (`ActionConfirmPayload`) carrying that id back.
 * `confirmAction` looks the id up: if found, not expired, and
 * `confirmed: true`, it actually runs the kill and returns
 * `'action_executed'`; otherwise (`confirmed: false`, not found, or expired)
 * it returns `'action_rejected'`. This two-step round trip is SPEC's "Kill
 * requires the two-step confirm" rule (BACKEND_SETUP_PLAN.md phase 5).
 *
 * All other kinds (`create_session`, `switch_session`, `cd`) are
 * non-destructive and execute immediately in `proposeAction`, returning
 * `'action_executed'` directly — no pending-action bookkeeping needed.
 *
 * ## TTL
 *
 * Pending actions are dropped after `PENDING_ACTION_TTL_MS` (5 minutes) —
 * long enough to cover a user reading a confirm dialog and tapping a button,
 * short enough that a stale/abandoned kill proposal can't be resurrected and
 * confirmed much later against a since-changed session list. Expiry is
 * checked lazily (on lookup in `confirmAction`, plus swept opportunistically
 * on every `proposeAction` call) rather than via a timer, since the process
 * is long-running and a Map of a few pending entries is cheap to sweep.
 *
 * ## tmux.ts / agentProcess.ts interop
 *
 * `tmuxHasSession` is imported from `./tmux.js` matching that module's real,
 * already-landed signature (`(name: string) => Promise<boolean>`).
 *
 * `agentProcess.ts` landed mid-write with `sendInputToSession(paneId: string,
 * text: string): Promise<void>` — keyed by pane id, not session id/name as
 * this module originally guessed. Not currently called from here (see the
 * placeholder note at the bottom of this file): none of the four action
 * kinds this module handles need to talk to the agent subprocess yet.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { ActionResultPayload, ActionConfirmPayload } from '../../src/types/index.js';
import { tmuxHasSession } from './tmux.js';

const execFileAsync = promisify(execFile);

/** How long a proposed-but-unconfirmed destructive action stays valid. */
const PENDING_ACTION_TTL_MS = 5 * 60 * 1000;

export type PendingAction = {
  id: string;
  kind: 'kill_session' | 'create_session' | 'switch_session' | 'cd' | 'rename_session';
  sessionId?: string;
  details: Record<string, unknown>;
};

interface StoredPendingAction {
  action: PendingAction;
  expiresAt: number;
}

/** In-memory pending-action store, keyed by the id also used as the
 * ActionResultPayload's requestId (== the `action_confirm` envelope's
 * `actionId` the app later sends back). Process-local and non-persistent by
 * design — a restart drops any pending confirms, which is fine since the app
 * would just re-show its confirm dialog against a fresh proposal. */
const pendingActions = new Map<string, StoredPendingAction>();

function sweepExpired(now: number): void {
  for (const [id, entry] of pendingActions) {
    if (entry.expiresAt <= now) {
      pendingActions.delete(id);
    }
  }
}

/**
 * Proposes an action. Destructive kinds (`kill_session`) are stored pending
 * confirmation and returned as `action_pending_confirm`; non-destructive
 * kinds execute immediately via `executeNonDestructiveAction` and are
 * returned as `action_executed`.
 */
export function proposeAction(
  kind: PendingAction['kind'],
  sessionId: string | undefined,
  details: Record<string, unknown>,
  requestId: string,
): ActionResultPayload {
  const now = Date.now();
  sweepExpired(now);

  if (kind === 'kill_session') {
    const id = randomUUID();
    const action: PendingAction = { id, kind, sessionId, details };
    pendingActions.set(id, { action, expiresAt: now + PENDING_ACTION_TTL_MS });
    return {
      // Matches the originating route_input envelope's id, per
      // ActionResultPayload's contract — lets the client correlate this
      // reply the same way it does for every other action kind.
      requestId,
      kind: 'action_pending_confirm',
      summary: sessionId ? `Kill session "${sessionId}"?` : 'Kill session?',
      // The separate id the client must echo back as action_confirm's
      // actionId — this is the pendingActions map key, not requestId.
      actionId: id,
    };
  }

  // Non-destructive: execute immediately, no confirm round-trip.
  // Fire-and-await synchronously isn't possible in a sync function, so this
  // path is actually async under the hood — callers that need the real
  // ActionResultPayload for create/switch/cd should call
  // `executeNonDestructiveAction` directly (server.ts's route_input/action
  // handler is expected to be async and do exactly that). This sync
  // `proposeAction` signature is kept per the task spec's exact shape; for
  // the non-destructive branch it returns a synchronous placeholder-shaped
  // executed result and kicks off actual execution best-effort in the
  // background. In practice, server.ts should prefer awaiting
  // `executeNonDestructiveAction` directly instead of relying on this
  // branch — see that export below.
  void executeNonDestructiveAction(kind, sessionId, details).catch((err: unknown) => {
    // Best-effort background execution for the sync-signature path; errors
    // here can't be surfaced through this function's synchronous return, so
    // just avoid an unhandled rejection. server.ts should prefer awaiting
    // executeNonDestructiveAction directly to get real error handling.
    console.error(`[actions] background execution of ${kind} failed:`, err);
  });
  return {
    requestId,
    kind: 'action_executed',
    summary: summarizeNonDestructive(kind, sessionId, details),
  };
}

/**
 * Looks up a previously-proposed pending action by `payload.actionId` and
 * either executes it (`confirmed: true`, found, not expired) or rejects it
 * (`confirmed: false`, not found, or expired).
 */
export async function confirmAction(payload: ActionConfirmPayload): Promise<ActionResultPayload> {
  const now = Date.now();
  sweepExpired(now);

  const entry = pendingActions.get(payload.actionId);

  if (!payload.confirmed || !entry) {
    if (entry) {
      // Explicitly rejected — drop it so it can't be confirmed later.
      pendingActions.delete(payload.actionId);
    }
    return {
      requestId: payload.actionId,
      kind: 'action_rejected',
    };
  }

  // Found + confirmed — consume it (one-shot) and execute.
  pendingActions.delete(payload.actionId);
  const { action } = entry;

  if (action.kind === 'kill_session') {
    const summary = await executeKillSession(action.sessionId, action.details);
    return {
      requestId: payload.actionId,
      kind: 'action_executed',
      summary,
    };
  }

  // Pending actions are only ever stored for 'kill_session' (see
  // proposeAction), so this branch is unreachable in practice; handled
  // defensively for type completeness.
  const summary = await executeNonDestructiveAction(action.kind, action.sessionId, action.details);
  return summary;
}

/** Executes a confirmed `kill_session`: `tmux kill-session -t <name>`. */
async function executeKillSession(sessionId: string | undefined, details: Record<string, unknown>): Promise<string> {
  const name = resolveSessionName(sessionId, details);
  if (!name) {
    throw new Error('kill_session: no session name/id provided');
  }
  const exists = await tmuxHasSession(name);
  if (!exists) {
    return `Session "${name}" no longer exists.`;
  }
  await execFileAsync('tmux', ['kill-session', '-t', name]);
  return `Killed session "${name}".`;
}

/**
 * Executes a non-destructive action immediately. Used internally by
 * `proposeAction`'s immediate-execute path — exported so server.ts (async
 * envelope handler) can call it directly and get a real awaited result
 * instead of relying on proposeAction's best-effort background execution.
 */
export async function executeNonDestructiveAction(
  kind: PendingAction['kind'],
  sessionId: string | undefined,
  details: Record<string, unknown>,
): Promise<ActionResultPayload> {
  const requestId = randomUUID();

  switch (kind) {
    case 'create_session': {
      const name = resolveSessionName(sessionId, details);
      const cwd = typeof details.cwd === 'string' ? details.cwd : undefined;
      if (!name) {
        throw new Error('create_session: no session name provided');
      }
      const args = ['new-session', '-d', '-s', name];
      if (cwd) {
        args.push('-c', cwd);
      }
      await execFileAsync('tmux', args);
      return {
        requestId,
        kind: 'action_executed',
        summary: `Created session "${name}"${cwd ? ` in ${cwd}` : ''}.`,
      };
    }

    case 'switch_session': {
      // Switching the *active* session is largely an app-side navigation
      // concern (which session the UI is currently viewing/composing
      // against) — tmux itself has no server-side notion of "the app's
      // selected session" to change. This is effectively a no-op/ack from
      // the backend's perspective; it just confirms the target exists.
      const name = resolveSessionName(sessionId, details);
      if (name) {
        const exists = await tmuxHasSession(name);
        if (!exists) {
          return {
            requestId,
            kind: 'action_rejected',
            summary: `Session "${name}" does not exist.`,
          };
        }
      }
      return {
        requestId,
        kind: 'action_executed',
        summary: name ? `Switched to session "${name}".` : 'Switched session.',
      };
    }

    case 'cd': {
      // Ambiguous per the plan: "cd" could mean (a) changing the tmux pane's
      // shell-level working directory, or (b) changing the *agent process's*
      // working context for subsequent turns (a concept tmux knows nothing
      // about — that would live in agentProcess.ts's session state instead).
      // Implemented here as (a), the shell-level version, via
      // `tmux send-keys`, as the reasonable default — flagged for review
      // once agentProcess.ts defines whether agents track their own cwd
      // independent of the pane.
      const name = resolveSessionName(sessionId, details);
      const path = typeof details.path === 'string' ? details.path : undefined;
      if (!name || !path) {
        throw new Error('cd: session name and path are both required');
      }
      await execFileAsync('tmux', ['send-keys', '-t', name, `cd ${shellQuoteForDisplay(path)}`, 'Enter']);
      return {
        requestId,
        kind: 'action_executed',
        summary: `Changed directory to ${path} in session "${name}".`,
      };
    }

    case 'rename_session': {
      const oldName = typeof details.oldName === 'string'
        ? details.oldName
        : resolveSessionName(sessionId, details);
      const newName =
        typeof details.newName === 'string'
          ? details.newName
          : typeof details.name === 'string'
          ? details.name
          : undefined;
      if (!oldName || !newName) {
        throw new Error('rename_session: old name and new name are both required');
      }
      await execFileAsync('tmux', ['rename-session', '-t', oldName, newName]);
      return {
        requestId,
        kind: 'action_executed',
        summary: `Renamed session "${oldName}" to "${newName}".`,
      };
    }

    case 'kill_session':
      // Never reached: kill_session always goes through the
      // propose/confirm path, never this immediate-execute helper.
      throw new Error('executeNonDestructiveAction: kill_session must go through confirmAction');
  }
}

function resolveSessionName(sessionId: string | undefined, details: Record<string, unknown>): string | undefined {
  if (typeof details.name === 'string' && details.name.trim().length > 0) return details.name.trim();
  if (typeof details.sessionId === 'string' && details.sessionId.trim().length > 0) return details.sessionId.trim();
  if (sessionId) return sessionId;
  return undefined;
}

function summarizeNonDestructive(kind: PendingAction['kind'], sessionId: string | undefined, details: Record<string, unknown>): string {
  const name = resolveSessionName(sessionId, details) ?? '';
  switch (kind) {
    case 'create_session':
      return `Creating session "${name}"...`;
    case 'rename_session':
      return `Renaming session "${name}"...`;
    case 'switch_session':
      return `Switching to session "${name}"...`;
    case 'cd':
      return `Changing directory in session "${name}"...`;
    default:
      return '';
  }
}

/**
 * `tmux send-keys` takes its key argument as a single tmux-CLI arg (not a
 * shell string) — no shell is invoked by `execFile`, so this only needs to
 * produce a single argv-safe display string for the literal `cd <path>` text
 * typed into the pane, not to defeat shell interpolation (there is none:
 * execFile never spawns `/bin/sh`). We still avoid embedding raw
 * unescaped quotes so the path renders sensibly if it contains spaces.
 */
function shellQuoteForDisplay(path: string): string {
  if (/[^A-Za-z0-9_\-./]/.test(path)) {
    return `'${path.replace(/'/g, `'\\''`)}'`;
  }
  return path;
}

// ---------------------------------------------------------------------------
// agentProcess.ts interop: `sendInputToSession(paneId, text)` exists there
// but isn't imported/used here — actions.ts's current scope (tmux-level
// session kill/create/switch/cd) doesn't need to talk to the agent
// subprocess directly. Left as a documented placeholder for the eventual
// case where an action needs to notify a running agent process (e.g.
// interrupting a mid-turn agent before killing its session) rather than
// only touching tmux:
//
//   import { sendInputToSession } from './agentProcess.js';
//   // sendInputToSession(paneId: string, text: string): Promise<void>
//
// Note it's keyed by pane id, not the session id/name this module works
// with — a mapping between the two (owned by agentProcess.ts's session
// registry) would be needed before actions.ts could call it meaningfully.
