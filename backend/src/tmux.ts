/**
 * tmux introspection for the Sessions screen (SPEC.md §4, BACKEND_SETUP_PLAN.md Phase 2).
 *
 * Shells out to the `tmux` CLI (never a library — tmux has no stable IPC API
 * other than its own CLI/control-mode) via `execFile`, never `exec`, so session
 * names/paths containing shell metacharacters can't be interpreted by a shell.
 * `-F` format strings use `\t` (tab) between fields instead of whitespace,
 * since tmux session/window names and pane paths may themselves contain
 * spaces. (Tried `\x1f`/unit-separator first, since it's the "correct"
 * unlikely-to-collide delimiter — but tmux 3.4 vis-escapes any literal byte
 * below 0x20 that appears directly in a `-F` string into visible `\NNN`
 * octal text before printing it, so it never reaches stdout as a real
 * separator. Tab is left unescaped and is exceedingly unlikely to appear in
 * a session/window name or path, so it's the pragmatic choice here.)
 *
 * ## Field mapping to `Session` (src/types/index.ts)
 *
 * - `id` — tmux's own session id (`#{session_id}`, e.g. `$3`). Stable across
 *   renames, unlike the name, so it's a better primary key.
 * - `name` — `#{session_name}`.
 * - `folder` — the *active* pane's current working directory
 *   (`#{pane_current_path}` from `tmux list-panes`, filtered to
 *   `#{pane_active}==1`). A session can have multiple windows/panes with
 *   different cwds; the active pane's cwd is the best single-value proxy for
 *   "where this session's agent process is running" until agentProcess.ts
 *   tracks the launch cwd explicitly per session.
 * - `status` — derived, not a direct tmux field:
 *     - `session_attached` (count of attached clients) > 0 → `'active'`
 *       (someone has a terminal open on it right now).
 *     - else, `session_activity` (unix ts of last activity) within
 *       `IDLE_THRESHOLD_MS` (5 minutes) of now → `'idle'` (agent may still be
 *       working/streaming even with no attached client).
 *     - else → `'disconnected'`.
 *   This is a heuristic pending real signal from agentProcess.ts (e.g. "is the
 *   agent subprocess still alive and mid-turn") — revisit once that module
 *   exists and can report actual process/turn state instead of tmux activity
 *   time, which only reflects terminal I/O, not agent think time.
 * - `createdAt` — `#{session_created}` (unix seconds) converted to ISO 8601.
 * - `lastActivityAt` — `#{session_activity}` (unix seconds) converted to ISO 8601.
 * - `agent` — **heuristic, not real data**: tmux has no concept of "which
 *   agent CLI is running here". We guess from the active window's name
 *   (`#{window_name}`): contains "agy" or "antigravity" (case-insensitive) →
 *   `'antigravity'`, else default `'claude-code'`. This must be replaced once
 *   agentProcess.ts tags sessions with their launch command/agent kind at
 *   creation time (e.g. via a tmux user option or a side-channel session
 *   registry) — tmux itself cannot answer this question reliably.
 * - `lastMessagePreview` — left as `''`. This is transcript state, which is
 *   agentProcess.ts's territory (it owns the piped stream-json output), not
 *   tmux's — tmux only knows about terminal panes, not agent message content.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Session, AgentKind, SessionStatus } from '../../src/types/index.js';

const execFileAsync = promisify(execFile);

/** Delimiter for tmux -F fields, which may contain spaces. See module doc
 * for why this is `\t` rather than the "safer"-looking `\x1f`. */
const FS = '\t';

/** How recently `session_activity` must have occurred for a session with no
 * attached client to still count as 'idle' rather than 'disconnected'. */
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

interface RawSession {
  id: string;
  name: string;
  attached: number;
  created: number;
  activity: number;
}

/**
 * True when tmux has no server running at all — the expected state before
 * the first session is ever created, or after all sessions have exited.
 * `tmux list-sessions` exits nonzero with a stderr message like
 * "no server running on /tmp/tmux-0/default" in that case; we treat that as
 * "zero sessions", not an error.
 */
function isNoServerRunningError(stderr: string): boolean {
  return /no server running/i.test(stderr);
}

async function runTmux(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('tmux', args);
  return stdout;
}

async function listRawSessions(): Promise<RawSession[]> {
  const format = ['#{session_id}', '#{session_name}', '#{session_attached}', '#{session_created}', '#{session_activity}'].join(FS);
  let stdout: string;
  try {
    stdout = await runTmux(['list-sessions', '-F', format]);
  } catch (err) {
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : '';
    if (isNoServerRunningError(stderr)) {
      return [];
    }
    throw err;
  }

  return stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [id, name, attached, created, activity] = line.split(FS);
      return {
        id: id ?? '',
        name: name ?? '',
        attached: Number(attached ?? '0'),
        created: Number(created ?? '0'),
        activity: Number(activity ?? '0'),
      };
    });
}

/** Active window's name for a session, used as the agent-kind heuristic input. */
async function getActiveWindowName(sessionName: string): Promise<string> {
  const format = ['#{window_active}', '#{window_name}'].join(FS);
  let stdout: string;
  try {
    stdout = await runTmux(['list-windows', '-t', sessionName, '-F', format]);
  } catch {
    return '';
  }
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const [active, name] = line.split(FS);
    if (active === '1') return name ?? '';
  }
  return '';
}

/** Active pane's cwd for a session, used as the `folder` field. */
async function getActivePanePath(sessionName: string): Promise<string> {
  const format = ['#{pane_active}', '#{pane_current_path}'].join(FS);
  let stdout: string;
  try {
    stdout = await runTmux(['list-panes', '-t', sessionName, '-F', format]);
  } catch {
    return '';
  }
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const [active, path] = line.split(FS);
    if (active === '1') return path ?? '';
  }
  return '';
}

function inferAgentKind(windowName: string): AgentKind {
  return /agy|antigravity/i.test(windowName) ? 'antigravity' : 'claude-code';
}

function deriveStatus(raw: RawSession, nowMs: number): SessionStatus {
  if (raw.attached > 0) return 'active';
  const activityMs = raw.activity * 1000;
  if (nowMs - activityMs <= IDLE_THRESHOLD_MS) return 'idle';
  return 'disconnected';
}

function toIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Lists all tmux sessions on this host, mapped to the app's `Session` shape.
 * Returns `[]` (not an error) when the tmux server isn't running at all.
 */
export async function listTmuxSessions(): Promise<Session[]> {
  const rawSessions = await listRawSessions();
  const nowMs = Date.now();

  return Promise.all(
    rawSessions.map(async (raw) => {
      const [windowName, folder] = await Promise.all([getActiveWindowName(raw.name), getActivePanePath(raw.name)]);

      const session: Session = {
        id: raw.id || raw.name,
        name: raw.name,
        agent: inferAgentKind(windowName),
        folder,
        status: deriveStatus(raw, nowMs),
        createdAt: toIso(raw.created),
        lastActivityAt: toIso(raw.activity),
        // Filled in once transcript state is wired — that's agentProcess.ts's
        // territory (it owns the piped stream-json turn content), not tmux's.
        lastMessagePreview: '',
      };
      return session;
    }),
  );
}

/**
 * Checks whether a tmux session with the given name currently exists.
 * Used before create/switch/kill actions to avoid races/ambiguous errors.
 */
export async function tmuxHasSession(name: string): Promise<boolean> {
  try {
    await execFileAsync('tmux', ['has-session', '-t', name]);
    return true;
  } catch (err) {
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : '';
    if (isNoServerRunningError(stderr)) {
      return false;
    }
    // has-session exits nonzero for "session not found" too — treat any
    // failure here as "doesn't exist" rather than propagating, since the
    // caller only wants a boolean existence check.
    return false;
  }
}
