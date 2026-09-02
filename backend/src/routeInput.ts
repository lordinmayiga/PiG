/**
 * `/route-input` — SPEC.md §4, §6, §7; BACKEND_SETUP_PLAN.md Phase 4.
 *
 * Classifies + cleans up a composer submission (`route_input` envelope) into
 * an `ActionResultPayload` of kind `'prompt_routed'`.
 *
 * Per the plan's confirmed decision, the OpenRouter key is **skipped for
 * now**: this module stands up the endpoint shape but stays on the same
 * mock classifier logic the app already exercises against itself
 * (`src/network/routeInput.ts`), ported here as closely as sensible so
 * behavior matches. When a key is added later, only the branch marked below
 * needs to change (config-only-shaped change, no callers change).
 *
 * Note: the app's mock also recognizes non-destructive action patterns
 * (`new_session`, `switch_session`, `cd`) and returns `kind: 'action'` for
 * those directly. Here, `routeInput` only ever returns `'prompt_routed'` —
 * per SPEC's bridge protocol, action proposals go through `actions.ts`'s
 * `proposeAction` (server.ts's job to call that instead, once it inspects
 * the classified text). To keep this module's porting honest and useful to
 * a future server.ts router, `classify()` below mirrors the full mock
 * (destructive / non-destructive / prompt) and is exported so server.ts can
 * use it to decide whether to call `routeInput` vs `actions.proposeAction`.
 */

import type { RouteInputPayload, ActionResultPayload } from '../../src/types/index.js';

export type ClassifiedAction = {
  /** e.g. 'kill_session' | 'new_session' | 'switch_session' | 'cd' */
  type: string;
  params?: Record<string, unknown>;
  summary: string;
};

export type ClassifyResult =
  | { kind: 'prompt'; cleanedText: string }
  | { kind: 'action'; action: ClassifiedAction; requiresConfirm: boolean };

/** Keywords that mark a submission as an environment command rather than an
 * agent prompt. Ported verbatim from src/network/routeInput.ts's
 * DESTRUCTIVE_PATTERNS. */
const DESTRUCTIVE_PATTERNS: { re: RegExp; type: string }[] = [
  { re: /\bkill\b|\bdelete\b|\bstop\b|\bend\b/i, type: 'kill_session' },
];

/** Ported verbatim from src/network/routeInput.ts's NON_DESTRUCTIVE_PATTERNS. */
const NON_DESTRUCTIVE_PATTERNS: { re: RegExp; type: string }[] = [
  { re: /\bnew session\b|\bstart a new session\b|\bcreate a session\b/i, type: 'new_session' },
  { re: /\bswitch to\b|\bswitch session\b/i, type: 'switch_session' },
  { re: /^cd\s+\S/i, type: 'cd' },
];

/**
 * Classify + clean up composer submission text. Pure/sync port of the app's
 * mock `sendRouteInput` heuristic (src/network/routeInput.ts) — same rules,
 * same precedence (destructive checked before non-destructive, both before
 * falling through to "treat as prompt").
 */
export function classify(text: string): ClassifyResult {
  const trimmed = text.trim();

  for (const { re, type } of DESTRUCTIVE_PATTERNS) {
    if (re.test(trimmed)) {
      return {
        kind: 'action',
        action: { type, params: { raw: trimmed }, summary: trimmed },
        // Destructive actions (kill/delete) always require confirm — SPEC §6.
        requiresConfirm: true,
      };
    }
  }

  for (const { re, type } of NON_DESTRUCTIVE_PATTERNS) {
    if (re.test(trimmed)) {
      return {
        kind: 'action',
        action: { type, params: { raw: trimmed }, summary: trimmed },
        requiresConfirm: false,
      };
    }
  }

  // Not recognized as an environment command — treat as an agent prompt.
  // The real (OpenRouter-backed) endpoint would also clean the text up using
  // context like available skill names; for now it's passed through
  // unchanged, matching the app's mock.
  return { kind: 'prompt', cleanedText: trimmed };
}

/**
 * Real `/route-input` handler: classifies `payload.text` and returns a
 * `prompt_routed` result carrying the cleaned prompt text.
 *
 * `requestId` is the correlating envelope id — `RouteInputPayload` itself
 * carries no id (that lives on the outer `Envelope`), so callers (server.ts)
 * pass it through explicitly.
 *
 * Even when a submission classifies as an environment command (kill/new
 * session/switch/cd) under `classify()`, this function still returns
 * `'prompt_routed'` with the raw trimmed text as the cleaned prompt — routing
 * a classified action to `actions.ts`'s `proposeAction` instead is
 * server.ts's responsibility (call `classify()` there first, branch to
 * `actions.proposeAction` for `kind: 'action'`, and only call `routeInput`
 * for `kind: 'prompt'`). This module only owns the "clean up + would-call-
 * OpenRouter" half of `/route-input`.
 */
export async function routeInput(
  payload: RouteInputPayload,
  requestId: string,
): Promise<ActionResultPayload> {
  const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.length > 0);
  // Never log the key value itself — presence/absence only.
  void hasOpenRouterKey; // (reserved for once the real branch below logs/uses it)

  if (hasOpenRouterKey) {
    // TODO: real OpenRouter call once a key is configured — see
    // BACKEND_SETUP_PLAN.md phase 4. For now, intentionally fall through to
    // the same mock classifier path regardless of key presence: a half-wired
    // real call with no way to test it is worse than a clean, clearly-marked
    // stub. Wiring the real call in here later should be a config-only-
    // shaped change — this branch point is where it goes.
  }

  const result = classify(payload.text);
  const cleanedPrompt = result.kind === 'prompt' ? result.cleanedText : payload.text.trim();

  return {
    requestId,
    kind: 'prompt_routed',
    cleanedPrompt,
  };
}
