/**
 * Agent subprocess lifecycle + NDJSON parsing (SPEC.md §4,
 * BACKEND_SETUP_PLAN.md Phase 3, "resolved 2026-09-02 ownership decision":
 * the backend directly owns/pipes the agent subprocess — a real stdout pipe,
 * not a tmux-pane scrape).
 *
 * ## Design
 *
 * `spawnAgentInTmuxWindow` does two independent things for each session:
 *
 * 1. **The real subprocess** — `child_process.spawn(agentBinary, args, {
 *    cwd, stdio: ['pipe', 'pipe', 'pipe'] })`, spawned directly by this
 *    backend process. This is the *only* source of truth for transcript
 *    data: its stdout is line-buffered and each line handed to
 *    `parseNdjsonLine`, then `onChunk`. This process is what `kill()`
 *    terminates.
 * 2. **A mirror tmux window** — `tmux new-window ... 'exec <same command>'`,
 *    created best-effort/non-fatally, purely so a human who attaches to the
 *    VPS's tmux session with a real terminal can *see* the agent running
 *    (persistence/visibility per the plan). This window's own copy of the
 *    process is NOT the one we pipe from — tmux panes don't expose a stable
 *    stdout pipe to a library, only a pty scrape, which the ownership
 *    decision explicitly rejected as the transcript source. If tmux is
 *    unavailable or window creation fails, this is swallowed (logged, not
 *    thrown) — the real subprocess and transcript streaming still work with
 *    no visible pane.
 *
 * `sendInputToSession` is a stub for per-turn input against a *tmux pane*
 * (bootstrapping/interactive fallback for persistence-across-disconnects —
 * e.g. reattaching a detached session's stdin manually). It is NOT how
 * `spawnAgentInTmuxWindow`'s own piped subprocess receives input; that would
 * go through the returned child process's stdin directly in a follow-up
 * (per-turn prompt submission isn't wired yet — this module only covers
 * spawn/parse/kill per the task scope).
 *
 * ## `parseNdjsonLine` — verified against real output (2026-09-02)
 *
 * Tested live against `claude --print --output-format stream-json
 * --include-partial-messages --verbose "<prompt>"` on this VPS. The real
 * event shapes (nothing like the earlier `content`/`delta`/`done` guess):
 *
 * - `{"type":"stream_event","event":{"type":"content_block_delta","delta":
 *   {"type":"text_delta","text":"..."}}}` — one streamed text token/chunk.
 *   Only emitted with `--include-partial-messages`; `status: 'streaming'`.
 * - `{"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}`
 *   — the complete assistant message for a turn (also arrives even without
 *   partial messages, as the sole content event in that mode). Treated as
 *   `status: 'streaming'` too, not `'done'`, since `--include-partial-messages`
 *   sends this *in addition to* the deltas and it's `type: 'result'` below
 *   that actually ends the turn — the app's markdown renderer overwriting a
 *   partial render with this full text is a safe idempotent no-op.
 * - `{"type":"result","subtype":"success","result":"..."}` — the turn is
 *   fully done; `status: 'done'`, `done: true` on the payload. A `subtype`
 *   other than `"success"` (e.g. `"error_max_turns"`) still ends the turn,
 *   so `done` is still true, but the message is flagged `status: 'error'`.
 * - `{"type":"system",...}`, `{"type":"rate_limit_event",...}`, and other
 *   `stream_event` subtypes (`message_start`, `content_block_start/stop`,
 *   `message_delta`, `message_stop`) are metadata, not transcript content —
 *   ignored (return `null`). Tool-call events aren't covered yet (this VPS
 *   test used a plain text prompt with no tool use) — a follow-up once a
 *   real tool-using turn's event shape is captured.
 */

import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type {
  AgentKind,
  TranscriptChunkPayload,
  TranscriptMessage,
} from '../../src/types/index.js';

const execFileAsync = promisify(execFile);

/**
 * Resolve the CLI binary + args used to start an agent in
 * stream-json/interactive mode, per agent kind.
 *
 * `claude-code`'s flags are verified live on this VPS (2026-09-02):
 * `--print` is required for `--output-format stream-json` to apply at all,
 * and the CLI itself refuses to start with `--output-format=stream-json`
 * unless `--verbose` is also set ("Error: When using --print,
 * --output-format=stream-json requires --verbose"). `--include-partial-
 * messages` is what actually gives token-level streaming `content_block_delta`
 * events instead of one lump `assistant` message per turn — without it the
 * app's composer would feel like it's waiting for the whole reply, not
 * streaming it.
 *
 * Note `--print` runs a *single* prompt-and-exit turn, not an interactive
 * session — per-turn input isn't "typed into" this process's stdin the way
 * an interactive REPL would take it; each submitted prompt needs its own
 * spawn (or `--resume`/`--continue` with the prior session id to keep
 * conversation context — not wired yet, follow-up once per-turn submission
 * is implemented).
 *
 * `antigravity` (`agy`)'s actual stream-json-equivalent flags are not
 * confirmed anywhere in the plan or spec.
 * // TODO: confirm agy's actual stream-json equivalent flags
 */
function resolveAgentCommand(agent: AgentKind, prompt: string): { bin: string; args: string[] } {
  switch (agent) {
    case 'claude-code':
      return {
        bin: 'claude',
        args: ['--print', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', prompt],
      };
    case 'antigravity':
      // TODO: confirm agy's actual stream-json equivalent flags
      return { bin: 'agy', args: ['--output-format', 'stream-json', prompt] };
  }
}

export interface SpawnAgentOptions {
  sessionName: string;
  windowName: string;
  cwd: string;
  agent: AgentKind;
  /** The turn's prompt text. `claude --print` (see `resolveAgentCommand`'s
   * doc) runs one prompt-and-exit turn per process, so this is required at
   * spawn time rather than sent later over stdin. */
  prompt: string;
  onChunk: (chunk: TranscriptChunkPayload) => void;
  onExit?: (code: number | null) => void;
}

export interface SpawnedAgentHandle {
  kill: () => void;
}

/**
 * Spawns an agent CLI as a real, backend-owned child process (piped stdout,
 * the actual transcript source) and, best-effort, mirrors the same command
 * into a new tmux window purely for human visibility/persistence. See the
 * module doc for why both exist and which one owns the data.
 */
export function spawnAgentInTmuxWindow(opts: SpawnAgentOptions): SpawnedAgentHandle {
  const { sessionName, windowName, cwd, agent, prompt, onChunk, onExit } = opts;
  const { bin, args } = resolveAgentCommand(agent, prompt);

  // --- 1. The real, piped subprocess. This is the transcript source of truth. ---
  const child: ChildProcessWithoutNullStreams = spawn(bin, args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // `claude --print` takes its prompt as an argv entry (see
  // resolveAgentCommand), not stdin — but an open, never-written stdin pipe
  // makes the CLI sit for a few seconds waiting to see if piped input is
  // coming ("no stdin data received in 3s...") before it proceeds. Verified
  // live on this VPS: closing stdin immediately removes that stall.
  child.stdin.end();

  let stdoutBuffer = '';

  child.stdout.on('data', (data: Buffer) => {
    stdoutBuffer += data.toString('utf8');
    let newlineIndex: number;
    // Line-buffer across chunks: a `data` event boundary may land mid-line.
    while ((newlineIndex = stdoutBuffer.indexOf('\n')) !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line.trim().length === 0) continue;
      const chunk = parseNdjsonLine(line, sessionName);
      if (chunk) onChunk(chunk);
    }
  });

  child.stderr.on('data', (data: Buffer) => {
    // Not parsed as NDJSON — stderr is agent CLI diagnostics, not transcript
    // content. Surfacing it richly (e.g. as an error transcript_chunk) is a
    // follow-up once real CLI stderr behavior is known.
    console.error(`[agentProcess] ${sessionName}/${windowName} stderr:`, data.toString('utf8'));
  });

  child.on('exit', (code) => {
    onExit?.(code);
  });

  child.on('error', (err) => {
    console.error(`[agentProcess] ${sessionName}/${windowName} failed to spawn:`, err);
  });

  // --- 2. Best-effort mirror tmux window, for visibility only. Never fatal. ---
  void createMirrorTmuxWindow(sessionName, windowName, cwd, bin, args);

  const kill = (): void => {
    child.kill('SIGTERM');
    // Best-effort: tear down the mirror window too. Failure here (tmux gone,
    // window already closed, session renamed, etc.) must not throw — the
    // real subprocess above is already the authoritative kill.
    void execFileAsync('tmux', ['kill-window', '-t', `${sessionName}:${windowName}`]).catch(
      (err: unknown) => {
        console.error(
          `[agentProcess] non-fatal: failed to kill mirror tmux window ${sessionName}:${windowName}:`,
          err,
        );
      },
    );
  };

  return { kill };
}

/** POSIX single-quote escaping: wraps `s` in single quotes, escaping any
 * embedded single quote as `'\''`. Safe for arbitrary text (including a
 * user-supplied prompt) placed into a shell command string. */
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Creates a tmux window running the same agent command, purely so a human
 * attached to the tmux session can see it live. Best-effort: any failure
 * (tmux not installed, session missing, window name collision, etc.) is
 * caught and logged, never thrown — the piped subprocess above is the real
 * transcript source and works regardless of this window's fate.
 */
async function createMirrorTmuxWindow(
  sessionName: string,
  windowName: string,
  cwd: string,
  bin: string,
  args: string[],
): Promise<void> {
  try {
    // `sessionName`/`windowName`/`cwd` are passed as discrete `execFile` argv
    // entries below (via -t/-n/-c), never through a shell, so they can't be
    // interpreted as shell syntax by *our* call to tmux. The final argument
    // — the command tmux runs inside the new pane — is unavoidably a single
    // string that tmux itself hands to the pane's shell. Unlike the fixed
    // `bin`/flag portion of `args`, the last element is the turn's *prompt*
    // (arbitrary user text, per `resolveAgentCommand`), so every element of
    // `args` is shell-escaped individually before joining — a prompt
    // containing `; rm -rf /` or a stray quote must never reach the pane's
    // shell unescaped.
    const execCommand = `exec ${[bin, ...args].map(shellEscape).join(' ')}`;
    await execFileAsync('tmux', [
      'new-window',
      '-t',
      sessionName,
      '-n',
      windowName,
      '-c',
      cwd,
      execCommand,
    ]);
  } catch (err) {
    console.error(
      `[agentProcess] non-fatal: failed to create mirror tmux window ${sessionName}:${windowName}:`,
      err,
    );
  }
}

/**
 * Sends input text to a tmux pane via `send-keys`. This is the
 * bootstrapping/interactive fallback path (e.g. driving the mirror window
 * manually, or recovering input against a session that outlived a backend
 * restart) — NOT how `spawnAgentInTmuxWindow`'s own piped child process
 * receives per-turn input; that's a follow-up once turn submission is
 * wired end-to-end.
 *
 * Uses `execFile` with array args (never string interpolation into a shell)
 * so pane ids and arbitrary user text can't be interpreted as shell syntax.
 * `Enter` is sent as a separate `send-keys` argument (tmux's own key-name
 * token, not literal text) so text containing e.g. a literal "Enter"
 * substring is never mistaken for the keypress.
 */
export async function sendInputToSession(paneId: string, text: string): Promise<void> {
  await execFileAsync('tmux', ['send-keys', '-t', paneId, text]);
  await execFileAsync('tmux', ['send-keys', '-t', paneId, 'Enter']);
}

/**
 * Parses one line of `claude --print --output-format stream-json
 * --include-partial-messages --verbose`'s NDJSON stdout into a
 * `TranscriptChunkPayload`, or `null` if the line isn't transcript content
 * (malformed JSON, or a metadata event — see module doc for the full
 * verified shape catalogue).
 *
 * `JSON.parse` failures are swallowed, not thrown — expected mid-stream if
 * a `data` chunk boundary ever split a line (shouldn't happen given the
 * line-buffering in `spawnAgentInTmuxWindow`, but cheap to guard).
 */
export function parseNdjsonLine(line: string, sessionId: string): TranscriptChunkPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  switch (obj.type) {
    case 'stream_event': {
      // Token-level delta, only present with --include-partial-messages.
      const event = obj.event as Record<string, unknown> | undefined;
      if (event?.type !== 'content_block_delta') return null;
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type !== 'text_delta' || typeof delta.text !== 'string') return null;
      return {
        sessionId,
        done: false,
        message: {
          id: randomUUID(),
          role: 'agent',
          timestamp: new Date().toISOString(),
          content: delta.text,
          status: 'streaming',
        },
      };
    }

    case 'assistant': {
      // The complete text for this turn's assistant message. Still not the
      // turn-completion signal (see module doc) — `type: 'result'` is.
      const message = obj.message as Record<string, unknown> | undefined;
      const contentBlocks = message?.content;
      if (!Array.isArray(contentBlocks)) return null;
      const text = contentBlocks
        .filter((b): b is { type: string; text: string } => typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'text')
        .map((b) => b.text)
        .join('');
      if (text.length === 0) return null;
      return {
        sessionId,
        done: false,
        message: {
          id: randomUUID(),
          role: 'agent',
          timestamp: new Date().toISOString(),
          content: text,
          status: 'streaming',
        },
      };
    }

    case 'result': {
      const success = obj.subtype === 'success';
      const resultText = typeof obj.result === 'string' ? obj.result : '';
      const message: TranscriptMessage = {
        id: randomUUID(),
        role: 'agent',
        timestamp: new Date().toISOString(),
        content: resultText,
        status: success ? 'done' : 'error',
      };
      return { sessionId, message, done: true };
    }

    default:
      // 'system', 'rate_limit_event', and other stream_event subtypes
      // (message_start/content_block_start/content_block_stop/message_delta/
      // message_stop) are metadata, not transcript content.
      return null;
  }
}
