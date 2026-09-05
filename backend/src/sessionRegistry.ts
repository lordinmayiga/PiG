/**
 * In-memory session/transcript registry (REAL_AGENT_CONNECTION_PLAN.md §4
 * Track A step 1).
 *
 * Bridges `route_input`'s `sessionId` (which, per `actions.ts`'s
 * `resolveSessionName`/`executeKillSession` and `bridge-e2e.test.ts`'s
 * lifecycle test, IS the tmux session *name*, not `tmux.ts`'s separate
 * `#{session_id}` field — the wire protocol's `sessionId` and tmux's
 * "name" are the same string throughout this codebase) to:
 *   - the `cwd`/`agent` an agent subprocess should be spawned with, and
 *   - a running transcript of completed turns, for `resync_snapshot`.
 *
 * Process-local and non-persistent by design, matching `actions.ts`'s
 * `pendingActions` Map: a backend restart drops session context, which is
 * an accepted gap for now (the app already dev-caches its own transcript
 * copy client-side per `src/transcriptCache.ts`, and would just re-seed on
 * next `resync_request` against a freshly-lost/empty registry entry rather
 * than crash).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AgentKind, TranscriptMessage, TokenUsage } from '../../src/types/index.js';
import type { SpawnedAgentHandle } from './agentProcess.js';

/**
 * Basic on-disk persistence so a backend restart doesn't wipe transcripts
 * entirely ("keep what you can" — UI_FIXES_PLAN.md §4). One append-only
 * JSONL file per session, one message per line. This is deliberately simple:
 * no compaction/rotation, no history reconstruction beyond what was
 * appended while this feature has been live. Base dir follows the
 * module-relative convention used elsewhere in this backend (see
 * auth.ts's PAIRING_STATE_FILE) rather than the user-homedir convention
 * used for the OpenRouter key, since this is app-local operational data,
 * not a user credential.
 */
const TRANSCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'transcripts');

function transcriptFilePath(sessionId: string): string {
  // sessionId is a tmux session name; sanitize defensively before using it
  // as a filename component (tmux names are already fairly restricted, but
  // don't trust that blindly for path construction).
  const safeName = sessionId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return join(TRANSCRIPTS_DIR, `${safeName}.jsonl`);
}

function persistMessage(sessionId: string, message: TranscriptMessage): void {
  try {
    if (!existsSync(TRANSCRIPTS_DIR)) {
      mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
    }
    appendFileSync(transcriptFilePath(sessionId), `${JSON.stringify(message)}\n`, 'utf8');
  } catch (err) {
    // Best-effort — losing durability on a write failure shouldn't crash a
    // live turn. The in-memory registry (and the client's own cache) still
    // hold the message.
    console.error(`[sessionRegistry] failed to persist transcript for "${sessionId}":`, err);
  }
}

/** Loads a session's persisted transcript from its JSONL file, or an empty
 * array if none exists yet / the file is unreadable. Malformed lines are
 * skipped rather than aborting the whole load. */
function loadPersistedTranscript(sessionId: string): TranscriptMessage[] {
  const filePath = transcriptFilePath(sessionId);
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, 'utf8');
    // Append-only means a streaming message that grew over several
    // `appendTurn` calls has one line per call, same id — upsert by id on
    // replay (mirroring appendTurn's in-memory behavior) so the loaded
    // transcript reflects each message's final content, not a duplicate
    // per intermediate chunk.
    const byId = new Map<string, TranscriptMessage>();
    const order: string[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const message = JSON.parse(trimmed) as TranscriptMessage;
        if (!byId.has(message.id)) order.push(message.id);
        byId.set(message.id, message);
      } catch {
        // Skip a malformed line rather than discarding the whole file.
      }
    }
    return order.map((id) => byId.get(id)!);
  } catch (err) {
    console.error(`[sessionRegistry] failed to load persisted transcript for "${sessionId}":`, err);
    return [];
  }
}

export interface ActiveSessionContext {
  sessionId: string;
  agent: AgentKind;
  cwd: string;
  transcript: TranscriptMessage[];
  model?: string;
  effort?: string;
  usage: TokenUsage;
  /** Set while a turn's subprocess is running; cleared on exit. Lets a
   * future `kill_session`/interrupt path (see actions.ts's documented
   * placeholder) reach the live agent process, not just the tmux session. */
  activeAgentHandle?: SpawnedAgentHandle;
}

const sessions = new Map<string, ActiveSessionContext>();

/**
 * Looks up an existing registry entry, or creates one seeded with `cwd`/
 * `agent` (typically resolved from `tmux.ts`'s `listTmuxSessions()` by the
 * caller, since tmux — not this registry — is the source of truth for which
 * sessions exist and where). If the entry already exists, `cwd`/`agent` are
 * left as originally seeded (a session's working dir/agent kind don't
 * change out from under an in-progress conversation just because a caller
 * passed different defaults on a later lookup).
 */
/** Per-`AgentKind` default model id, used both when seeding a fresh session
 * context and by `getSessionModel`'s fallback — a session's default model
 * must match the CLI it's actually going to spawn (`claude-code` sessions
 * shell out to the `claude` binary, which has no `gemini-*` model, and vice
 * versa for `antigravity`/`agy`). */
export function defaultModelForAgent(agent: AgentKind): string {
  return agent === 'claude-code' ? 'claude-sonnet-4-6' : 'gemini-3.8-flash';
}

export function getOrCreateSession(sessionId: string, cwd: string, agent: AgentKind): ActiveSessionContext {
  let ctx = sessions.get(sessionId);
  if (!ctx) {
    // Seed from the on-disk JSONL log if one exists — e.g. this process
    // just restarted and lost the in-memory registry, but a prior process
    // persisted this session's transcript before going down.
    ctx = {
      sessionId,
      agent,
      cwd,
      transcript: loadPersistedTranscript(sessionId),
      model: defaultModelForAgent(agent),
      effort: 'low',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
      },
    };
    sessions.set(sessionId, ctx);
  }
  return ctx;
}

/** Direct lookup without creating — `undefined` if the session hasn't been
 * seen by `getOrCreateSession` yet (e.g. no turn has been sent to it). */
export function getSession(sessionId: string): ActiveSessionContext | undefined {
  return sessions.get(sessionId);
}

/**
 * Appends or updates one message in a session's transcript, upserting by
 * `message.id` — mirrors the mobile client's own upsert-by-id rendering
 * (`TranscriptScreen.tsx`), so a growing/streaming turn's repeated calls
 * (same id, longer content each time) replace in place rather than
 * duplicate. No-ops (logs, doesn't throw) if the session doesn't exist yet,
 * since a chunk arriving before `getOrCreateSession` ran would indicate a
 * caller ordering bug, not a reason to crash the whole turn.
 */
export function appendTurn(sessionId: string, message: TranscriptMessage): void {
  const ctx = sessions.get(sessionId);
  if (!ctx) {
    console.error(`[sessionRegistry] appendTurn: unknown session "${sessionId}", dropping message ${message.id}`);
    return;
  }
  const existingIndex = ctx.transcript.findIndex((m) => m.id === message.id);
  if (existingIndex === -1) {
    ctx.transcript.push(message);
  } else {
    ctx.transcript[existingIndex] = message;
  }
  persistMessage(sessionId, message);
}

/** Returns the session's transcript, or `undefined` if the session hasn't
 * been seen yet (distinct from an empty array, which means the session
 * exists but has had no turns). */
export function getTranscript(sessionId: string): TranscriptMessage[] | undefined {
  return sessions.get(sessionId)?.transcript;
}

/** Records the currently-running agent subprocess handle for a session
 * (set at spawn time, cleared on exit) — see `ActiveSessionContext`'s doc. */
export function setActiveHandle(sessionId: string, handle: SpawnedAgentHandle | undefined): void {
  const ctx = sessions.get(sessionId);
  if (!ctx) return;
  ctx.activeAgentHandle = handle;
}

export function setSessionModel(sessionId: string, model: string, effort?: string): void {
  const ctx = sessions.get(sessionId);
  if (!ctx) return;
  ctx.model = model;
  if (effort !== undefined) {
    ctx.effort = effort;
  }
}

export function getSessionModel(sessionId: string): { model: string; effort: string } {
  const ctx = sessions.get(sessionId);
  return {
    model: ctx?.model ?? defaultModelForAgent(ctx?.agent ?? 'antigravity'),
    effort: ctx?.effort ?? 'low',
  };
}

export function accumulateUsage(sessionId: string, usage: Partial<TokenUsage>): TokenUsage {
  const ctx = sessions.get(sessionId);
  if (!ctx) {
    return {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      thinkingTokens: usage.thinkingTokens ?? 0,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    };
  }
  ctx.usage.inputTokens += usage.inputTokens ?? 0;
  ctx.usage.outputTokens += usage.outputTokens ?? 0;
  ctx.usage.thinkingTokens += usage.thinkingTokens ?? 0;
  ctx.usage.cacheReadTokens += usage.cacheReadTokens ?? 0;
  ctx.usage.totalTokens += usage.totalTokens ?? 0;
  return { ...ctx.usage };
}

export function getSessionUsage(sessionId: string): TokenUsage {
  const ctx = sessions.get(sessionId);
  return ctx ? { ...ctx.usage } : {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
  };
}
