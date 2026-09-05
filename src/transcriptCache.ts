/**
 * On-device transcript cache, backed by AsyncStorage. Implements the storage
 * schema proposed in PHASE_5_6_PLAN.md ("local transcript storage schema"):
 * one key per session, holding the last 200 messages as a ring buffer
 * (oldest evicted first) plus a `syncCursor` marking the newest cached
 * message, so a reconnect/resync (Phase 6) knows what it already has.
 *
 * This is the *only* place that knows the AsyncStorage key shape — screens
 * and the future websocket client go through the narrow interface below
 * (`getCached`, `appendAndPersist`, `replaceAll`, `clear`) so the on-disk
 * representation can change without touching callers.
 *
 * Every read/write is best-effort, matching src/storage.ts's style: a
 * storage failure falls back to a safe default (null / no-op) rather than
 * throwing, since a cache miss just means falling back to a network fetch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TranscriptMessage } from './types';

/** Ring-buffer cap per session, per the proposed storage schema. */
export const TRANSCRIPT_CACHE_WINDOW = 200;

/** Shape persisted per session, and returned to callers on a cache hit. */
export interface CachedTranscript {
  messages: TranscriptMessage[];
  /** id of the newest cached message, or null if the cache is empty. */
  syncCursor: string | null;
}

function keyFor(sessionId: string): string {
  return `pig.transcript.${sessionId}`;
}

/** Trims to the most recent `TRANSCRIPT_CACHE_WINDOW` messages (oldest evicted first). */
function pruneToWindow(messages: TranscriptMessage[]): TranscriptMessage[] {
  if (messages.length <= TRANSCRIPT_CACHE_WINDOW) return messages;
  return messages.slice(messages.length - TRANSCRIPT_CACHE_WINDOW);
}

function cursorFor(messages: TranscriptMessage[]): string | null {
  return messages.length > 0 ? messages[messages.length - 1].id : null;
}

/** Reads the cached transcript for a session, or null on a miss/failure. */
export async function getCached(sessionId: string): Promise<CachedTranscript | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTranscript;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Appends new messages to whatever is already cached, prunes to the 200
 * window, and persists. Safe to call with messages already present (they're
 * not de-duplicated here — callers pass genuinely-new messages).
 */
export async function appendAndPersist(sessionId: string, messages: TranscriptMessage[]): Promise<void> {
  if (messages.length === 0) return;
  try {
    const existing = await getCached(sessionId);
    const merged = pruneToWindow([...(existing?.messages ?? []), ...messages]);
    const next: CachedTranscript = { messages: merged, syncCursor: cursorFor(merged) };
    await AsyncStorage.setItem(keyFor(sessionId), JSON.stringify(next));
  } catch {
    // Best-effort — see file header.
  }
}

/**
 * Overwrites the cache with a full snapshot (e.g. a Phase 6 resync),
 * pruned to the 200 window, rather than merging with what's already there.
 */
export async function replaceAll(sessionId: string, messages: TranscriptMessage[]): Promise<void> {
  try {
    const pruned = pruneToWindow(messages);
    const next: CachedTranscript = { messages: pruned, syncCursor: cursorFor(pruned) };
    await AsyncStorage.setItem(keyFor(sessionId), JSON.stringify(next));
  } catch {
    // Best-effort — see file header.
  }
}

/**
 * Merges a resync snapshot from the server into the transcript already
 * shown locally, without ever losing messages the user has already seen.
 *
 * The backend's transcript store is in-memory (`backend/src/sessionRegistry.ts`)
 * with only best-effort JSONL persistence across restarts, so a
 * `resync_snapshot` can legitimately come back shorter than what the client
 * already has cached — e.g. right after a backend restart, before the
 * restarted process has replayed everything a prior process had appended.
 * Blindly replacing the local transcript with a shorter server one is a
 * real, confirmed data-loss bug (see UI_FIXES_PLAN.md §4) — this merges by
 * message id instead: keep every local message, and update-in-place or
 * append anything the snapshot carries that's new or changed, preserving
 * relative order. Only when the snapshot is a strict superset in length AND
 * shares no id with the local list at a lower index (i.e. the normal case
 * where server truth is >= local) does this reduce to a plain replace.
 */
export function mergeTranscripts(
  local: TranscriptMessage[],
  serverSnapshot: TranscriptMessage[],
): TranscriptMessage[] {
  if (local.length === 0) return serverSnapshot;
  if (serverSnapshot.length === 0) return local;

  const localIds = new Set(local.map((m) => m.id));
  const merged = local.map((m) => {
    const fromServer = serverSnapshot.find((s) => s.id === m.id);
    return fromServer ?? m;
  });
  // Append any server messages the local list didn't have at all (newer
  // turns the server knows about that haven't streamed to this client yet).
  for (const s of serverSnapshot) {
    if (!localIds.has(s.id)) merged.push(s);
  }
  return merged;
}

/** Clears the cached transcript for a session (e.g. on session deletion). */
export async function clear(sessionId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(sessionId));
  } catch {
    // Best-effort — see file header.
  }
}
