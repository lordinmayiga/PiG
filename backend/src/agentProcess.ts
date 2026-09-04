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
import { existsSync, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type {
  AgentKind,
  TranscriptChunkPayload,
  TranscriptMessage,
  TokenUsage,
  ModelInfo,
} from '../../src/types/index.js';

const execFileAsync = promisify(execFile);

let cachedModels: { models: ModelInfo[]; expiresAt: number } | null = null;

export async function getAvailableAgyModels(): Promise<ModelInfo[]> {
  const now = Date.now();
  if (cachedModels && cachedModels.expiresAt > now) {
    return cachedModels.models;
  }
  try {
    const { stdout } = await execFileAsync('agy', ['models'], {
      env: {
        ...process.env,
        PATH: `/root/.local/bin:/usr/local/bin:${process.env.PATH || ''}`,
      },
    });
    const lines = stdout.split('\n').filter((l) => l.trim().length > 0 && !l.includes('Fetching available models'));
    const models: ModelInfo[] = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s{2,}/);
      if (parts.length >= 2) {
        const id = parts[0].trim();
        const name = parts[1].trim();
        const badge = name.includes('(High)') ? 'High' : name.includes('(Medium)') ? 'Medium' : name.includes('(Low)') ? 'Low' : name.includes('Thinking') ? 'Thinking' : undefined;
        models.push({
          id,
          name,
          badge,
          description: `Reasoning agent model ${id}`,
        });
      }
    }
    if (models.length > 0) {
      cachedModels = { models, expiresAt: now + 60_000 };
      return models;
    }
  } catch (err) {
    console.error('[agentProcess] Error running agy models:', err);
  }
  return [
    { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)', badge: 'Low' },
    { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash (Medium)', badge: 'Medium' },
    { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', badge: 'High' },
    { id: 'gemini-3.7-flash-low', name: 'Gemini 3.7 Flash (Low)', badge: 'Low' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)', badge: 'Thinking' },
  ];
}

/**
 * Resolve the CLI binary + args used to start an agent in
 * stream-json/interactive mode, per agent kind.
 */
function resolveAgentCommand(
  agent: AgentKind,
  prompt: string,
  model?: string,
  effort?: string,
): { bin: string; args: string[] } {
  switch (agent) {
    case 'claude-code': {
      const bin = existsSync('/usr/bin/claude')
        ? '/usr/bin/claude'
        : existsSync('/usr/local/bin/claude')
          ? '/usr/local/bin/claude'
          : 'claude';
      return {
        bin,
        args: ['--print', '--output-format', 'stream-json', '--include-partial-messages', '--dangerously-skip-permissions', '--verbose', prompt],
      };
    }
    case 'antigravity': {
      const bin = existsSync('/root/.local/bin/agy')
        ? '/root/.local/bin/agy'
        : existsSync('/usr/local/bin/agy')
          ? '/usr/local/bin/agy'
          : existsSync('/usr/bin/agy')
            ? '/usr/bin/agy'
            : 'agy';
      const selectedModel = model ?? 'gemini-3.8-flash';
      const selectedEffort = effort ?? 'low';
      return {
        bin,
        args: [
          '--output-format',
          'stream-json',
          '--dangerously-skip-permissions',
          `--model=${selectedModel}`,
          `--effort=${selectedEffort}`,
          `--print=${prompt}`,
        ],
      };
    }
  }
}

export interface SpawnAgentOptions {
  sessionName: string;
  windowName: string;
  cwd: string;
  agent: AgentKind;
  /** The turn's prompt text. */
  prompt: string;
  model?: string;
  effort?: string;
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
  const { sessionName, windowName, cwd, agent, prompt, model, effort, onChunk, onExit } = opts;
  const { bin, args } = resolveAgentCommand(agent, prompt, model, effort);

  // --- 1. The real, piped subprocess. This is the transcript source of truth. ---
  const child: ChildProcessWithoutNullStreams = spawn(bin, args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PATH: `/root/.local/bin:/usr/local/bin:${process.env.PATH || ''}`,
    },
  });
  // `claude --print` takes its prompt as an argv entry (see
  // resolveAgentCommand), not stdin — but an open, never-written stdin pipe
  // makes the CLI sit for a few seconds waiting to see if piped input is
  // coming ("no stdin data received in 3s...") before it proceeds. Verified
  // live on this VPS: closing stdin immediately removes that stall.
  child.stdin.end();

  let stdoutBuffer = '';
  // One parser instance per spawned turn, so every chunk this turn emits
  // shares one message id and accumulates full text instead of each
  // streamed token becoming its own message (see `createTurnParser`'s doc).
  const parseLine = createTurnParser(sessionName, agent);

  child.stdout.on('data', (data: Buffer) => {
    stdoutBuffer += data.toString('utf8');
    let newlineIndex: number;
    // Line-buffer across chunks: a `data` event boundary may land mid-line.
    while ((newlineIndex = stdoutBuffer.indexOf('\n')) !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line.trim().length === 0) continue;
      const chunk = parseLine(line);
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
 * Per-turn accumulator state threaded through repeated `parseNdjsonLine`
 * calls for the same spawned process — see `createTurnParser`'s doc for why
 * this exists (one message id + growing text per turn, not one id per
 * streamed token).
 */
export interface TurnParseState {
  /** Minted once per turn (per `createTurnParser` call), reused for every
   * chunk this turn emits so the client's upsert-by-id rendering grows one
   * bubble instead of creating a new one per token. */
  id: string;
  /** Running text for the turn. `stream_event` deltas append to it;
   * `assistant`/`result` events carry the full text already, so they
   * overwrite it (safe/idempotent — see module doc). */
  accumulatedText: string;
  accumulatedThinking: string;
  isThinking: boolean;
  conversationId?: string;
}

/**
 * Parses one line of `claude --print --output-format stream-json
 * --include-partial-messages --verbose`'s NDJSON stdout into a
 * `TranscriptChunkPayload`, or `null` if the line isn't transcript content
 * (malformed JSON, or a metadata event — see module doc for the full
 * verified shape catalogue).
 *
 * Takes a `state` object (from `createTurnParser`) that it reads/mutates so
 * every chunk for one turn shares `state.id` and carries the *full*
 * accumulated text so far, not just this line's delta — matching what
 * `TranscriptMessage.content` is expected to hold (the whole turn's text,
 * not a fragment) and what the mobile client's upsert-by-id rendering
 * expects (replace-in-place, not append-a-new-bubble). Call this directly
 * (with a fresh `{ id: randomUUID(), accumulatedText: '' }` state) only for
 * single-line/unit-test purposes; real spawn-time parsing goes through
 * `createTurnParser`, which owns the state's lifetime for a whole turn.
 *
 * `JSON.parse` failures are swallowed, not thrown — expected mid-stream if
 * a `data` chunk boundary ever split a line (shouldn't happen given the
 * line-buffering in `spawnAgentInTmuxWindow`, but cheap to guard).
 *
 * Dispatches to `parseAntigravityLine` for `agent: 'antigravity'` — `agy`'s
 * NDJSON shape (verified live, 2026-09-03) is structurally unrelated to
 * claude's (an `event`/`step_update`/`result` envelope, not `type`/
 * `stream_event`/`assistant`/`result`), so it gets its own parser rather
 * than being shoehorned into this one's `switch`.
 */
export function parseNdjsonLine(
  line: string,
  sessionId: string,
  state: TurnParseState,
  agent: AgentKind = 'claude-code',
): TranscriptChunkPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  if (agent === 'antigravity') return parseAntigravityLine(obj, sessionId, state);

  switch (obj.type) {
    case 'stream_event': {
      // Token-level delta, only present with --include-partial-messages.
      const event = obj.event as Record<string, unknown> | undefined;
      if (event?.type !== 'content_block_delta') return null;
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type !== 'text_delta' || typeof delta.text !== 'string') return null;
      state.accumulatedText += delta.text;
      return {
        sessionId,
        done: false,
        message: {
          id: state.id,
          role: 'agent',
          timestamp: new Date().toISOString(),
          content: state.accumulatedText,
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
      state.accumulatedText = text;
      return {
        sessionId,
        done: false,
        message: {
          id: state.id,
          role: 'agent',
          timestamp: new Date().toISOString(),
          content: state.accumulatedText,
          status: 'streaming',
        },
      };
    }

    case 'result': {
      const success = obj.subtype === 'success';
      const resultText = typeof obj.result === 'string' ? obj.result : '';
      if (resultText.length > 0) {
        state.accumulatedText = resultText;
      }
      // else: some non-success subtypes (e.g. error_max_turns) may carry no
      // `result` text — fall back to whatever was accumulated from deltas
      // rather than blanking out a partial reply the user already saw.
      const message: TranscriptMessage = {
        id: state.id,
        role: 'agent',
        timestamp: new Date().toISOString(),
        content: state.accumulatedText,
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

/**
 * Parses one line of `agy --output-format stream-json --print=<prompt>`'s
 * NDJSON stdout. Verified live on this VPS (2026-09-03) against a real
 * `agy` call — shape is completely unrelated to claude's, keyed by `event`
 * rather than `type`:
 *
 * - `{"event":"init","init":{...}}` — session metadata (cwd, available
 *   tools, permission mode). Not transcript content — ignored.
 * - `{"event":"step_update","step_update":{"step_type":"user_input",
 *   "state":"DONE"}}` — echoes the input step; no text. Ignored.
 * - `{"event":"step_update","step_update":{"step_type":"agent_response",
 *   "state":"ACTIVE"|"DONE","text_delta":"..."}}` — one streamed text
 *   chunk (both the `"ACTIVE"` chunks mid-response and the final
 *   `"DONE"` chunk for this step carry a `text_delta` to append — unlike
 *   claude, there is no separate "full text so far" event, only deltas).
 *   Note `step_type` can presumably be values other than `agent_response`/
 *   `user_input` for tool-use turns — not observed yet (this VPS's smoke
 *   test used a plain text prompt), so any `step_update` without a string
 *   `text_delta` is safely ignored here rather than guessed at.
 * - `{"event":"result","result":{"status":"SUCCESS"|other,"response":
 *   "..."}}` — the turn is fully done; `status !== "SUCCESS"` (exact other
 *   values not yet observed) is treated as `status: 'error'`. `response`
 *   is the full final text, overwriting the accumulator (safe/idempotent,
 *   same reasoning as claude's `result` event).
 * - Anything else (unrecognized `event` value) — metadata, ignored.
 */
function tryExtractTranscriptThinking(state: TurnParseState): void {
  if (!state.conversationId || (state.accumulatedThinking && state.accumulatedThinking.trim().length > 0)) {
    return;
  }
  try {
    const transcriptPath = `/root/.gemini/antigravity-cli/brain/${state.conversationId}/.system_generated/logs/transcript.jsonl`;
    if (existsSync(transcriptPath)) {
      const content = readFileSync(transcriptPath, 'utf8');
      const lines = content.trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i];
        if (!l) continue;
        const step = JSON.parse(l);
        if (step.thinking && typeof step.thinking === 'string' && step.thinking.trim().length > 0) {
          state.accumulatedThinking = step.thinking.trim();
          break;
        }
        if (step.content && typeof step.content === 'string' && step.content.includes('<thought>')) {
          const m = step.content.match(/<thought>([\s\S]*?)<\/thought>/);
          if (m) {
            state.accumulatedThinking = m[1].trim();
            break;
          }
        }
      }
    }
  } catch {
    // Non-fatal fallback
  }
}

function parseAntigravityLine(
  obj: Record<string, unknown>,
  sessionId: string,
  state: TurnParseState,
): TranscriptChunkPayload | null {
  if (typeof obj.conversation_id === 'string') {
    state.conversationId = obj.conversation_id;
  } else if (obj.init && typeof (obj.init as Record<string, unknown>).conversation_id === 'string') {
    state.conversationId = (obj.init as Record<string, unknown>).conversation_id as string;
  }

  switch (obj.event) {
    case 'step_update': {
      const stepUpdate = obj.step_update as Record<string, unknown> | undefined;
      if (typeof stepUpdate?.conversation_id === 'string') {
        state.conversationId = stepUpdate.conversation_id;
      }
      const textDelta = stepUpdate?.text_delta;
      const thoughtDelta = stepUpdate?.thought_delta || (stepUpdate?.step_type === 'thought' ? textDelta : undefined);
      const usageRaw = (stepUpdate?.usage || obj.usage) as Record<string, number> | undefined;

      let usage: TokenUsage | undefined;
      if (usageRaw && typeof usageRaw === 'object') {
        usage = {
          inputTokens: usageRaw.input_tokens ?? 0,
          outputTokens: usageRaw.output_tokens ?? 0,
          thinkingTokens: usageRaw.thinking_tokens ?? 0,
          cacheReadTokens: usageRaw.cache_read_tokens ?? 0,
          totalTokens: usageRaw.total_tokens ?? 0,
        };
      }

      if (typeof thoughtDelta === 'string' && thoughtDelta.length > 0) {
        state.accumulatedThinking += thoughtDelta;
        return {
          sessionId,
          done: false,
          message: {
            id: state.id,
            role: 'agent',
            timestamp: new Date().toISOString(),
            content: state.accumulatedText,
            thinking: state.accumulatedThinking,
            status: 'streaming',
            usage,
          },
        };
      }

      if (typeof textDelta !== 'string' || textDelta.length === 0) return null;

      if (textDelta.includes('<thought>') || state.isThinking) {
        let remaining = textDelta;
        while (remaining.length > 0) {
          if (!state.isThinking) {
            const startIdx = remaining.indexOf('<thought>');
            if (startIdx !== -1) {
              state.accumulatedText += remaining.slice(0, startIdx);
              remaining = remaining.slice(startIdx + '<thought>'.length);
              state.isThinking = true;
            } else {
              state.accumulatedText += remaining;
              remaining = '';
            }
          } else {
            const endIdx = remaining.indexOf('</thought>');
            if (endIdx !== -1) {
              state.accumulatedThinking += remaining.slice(0, endIdx);
              remaining = remaining.slice(endIdx + '</thought>'.length);
              state.isThinking = false;
            } else {
              state.accumulatedThinking += remaining;
              remaining = '';
            }
          }
        }
      } else {
        state.accumulatedText += textDelta;
      }

      return {
        sessionId,
        done: false,
        message: {
          id: state.id,
          role: 'agent',
          timestamp: new Date().toISOString(),
          content: state.accumulatedText,
          thinking: state.accumulatedThinking.length > 0 ? state.accumulatedThinking : undefined,
          status: 'streaming',
          usage,
        },
      };
    }

    case 'result': {
      const result = obj.result as Record<string, unknown> | undefined;
      const success = result?.status === 'SUCCESS';
      const responseText = typeof result?.response === 'string' ? result.response : '';
      if (responseText.length > 0) {
        if (responseText.includes('<thought>')) {
          const thoughtMatch = responseText.match(/<thought>([\s\S]*?)<\/thought>/);
          if (thoughtMatch) {
            state.accumulatedThinking = thoughtMatch[1].trim();
            state.accumulatedText = responseText.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim();
          } else {
            state.accumulatedText = responseText;
          }
        } else {
          state.accumulatedText = responseText;
        }
      }
      tryExtractTranscriptThinking(state);
      const usageRaw = (result?.usage || obj.usage) as Record<string, number> | undefined;
      let usage: TokenUsage | undefined;
      if (usageRaw && typeof usageRaw === 'object') {
        usage = {
          inputTokens: usageRaw.input_tokens ?? 0,
          outputTokens: usageRaw.output_tokens ?? 0,
          thinkingTokens: usageRaw.thinking_tokens ?? 0,
          cacheReadTokens: usageRaw.cache_read_tokens ?? 0,
          totalTokens: usageRaw.total_tokens ?? 0,
        };
      }
      const message: TranscriptMessage = {
        id: state.id,
        role: 'agent',
        timestamp: new Date().toISOString(),
        content: state.accumulatedText,
        thinking: state.accumulatedThinking.length > 0 ? state.accumulatedThinking : undefined,
        status: success ? 'done' : 'error',
        usage,
      };
      return { sessionId, message, done: true };
    }

    default:
      // 'init' and any other/unrecognized event value — metadata.
      return null;
  }
}

/**
 * Returns a stateful line-parsing function scoped to one spawned turn: it
 * mints a single `randomUUID()` message id up front and closes over an
 * accumulator, so every `TranscriptChunkPayload` it returns for this turn
 * shares that one id and carries the full text accumulated so far (see
 * `parseNdjsonLine`'s doc for why). Call once per `spawnAgentInTmuxWindow`
 * invocation (i.e. once per turn/subprocess), not once per line.
 */
export function createTurnParser(
  sessionId: string,
  agent: AgentKind = 'claude-code',
): (line: string) => TranscriptChunkPayload | null {
  const state: TurnParseState = {
    id: randomUUID(),
    accumulatedText: '',
    accumulatedThinking: '',
    isThinking: false,
  };
  return (line: string) => parseNdjsonLine(line, sessionId, state, agent);
}
