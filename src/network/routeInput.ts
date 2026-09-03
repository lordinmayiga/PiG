/**
 * `/route-input` client — SPEC.md §6, §7.
 *
 * Sends a real `route_input` envelope over the shared bridge connection
 * (src/network/bridgeConnection.ts) and awaits the matching `action_result`
 * — against either the mock transport (src/dev/mockBridgeServer.ts) or the
 * real VPS backend (BACKEND_SETUP_PLAN.md), depending on the "use real VPS
 * backend" preference (storage.ts, flipped from Settings) that
 * `bridgeConnection.ts`'s `connectBridge` reads at connect time. Per SPEC §7
 * the OpenRouter key is server-side only — this file never calls OpenRouter
 * directly.
 *
 * Falls back to the same local heuristic keyword-matching this file used to
 * do exclusively (kept below as `classifyLocally`) when there's no bridge
 * client yet (e.g. mid-connection, or `route_input` never resolves — see
 * `ROUTE_INPUT_TIMEOUT_MS`) so the Composer never hangs waiting on a
 * connection that isn't there.
 */

import type { ComposerAttachment } from '../components/Composer';
import { getBridgeClient } from './bridgeConnection';
import type { ActionResultPayload } from '../types';

/** A routed environment command — shape is provisional, mirrors SPEC §6's examples. */
export interface RouteInputAction {
  /** e.g. 'kill_session' | 'new_session' | 'switch_session' | 'cd' */
  type: string;
  /** Free-form params the backend would need to execute the action (session id, path, etc). */
  params?: Record<string, unknown>;
  /** Human-readable summary for a confirm dialog, e.g. "Kill session “api-refactor”?". */
  summary: string;
}

export type RouteInputResult =
  | { kind: 'prompt'; cleanedText: string }
  | { kind: 'action'; action: RouteInputAction; requiresConfirm: boolean };

/** Keywords that mark a submission as an environment command rather than an agent prompt. */
const DESTRUCTIVE_PATTERNS: { re: RegExp; type: string }[] = [
  { re: /\bkill\b|\bdelete\b|\bstop\b|\bend\b/i, type: 'kill_session' },
];

const NON_DESTRUCTIVE_PATTERNS: { re: RegExp; type: string }[] = [
  { re: /\bnew session\b|\bstart a new session\b|\bcreate a session\b/i, type: 'new_session' },
  { re: /\bswitch to\b|\bswitch session\b/i, type: 'switch_session' },
  { re: /^cd\s+\S/i, type: 'cd' },
];

/** How long to wait for a real `action_result` before falling back to the
 * local heuristic — covers both "no client yet" and "client connected but
 * the backend never replied" without the Composer hanging indefinitely. */
const ROUTE_INPUT_TIMEOUT_MS = 5000;

/**
 * Classify + clean up a composer submission using purely local heuristics —
 * no network involved. Used as `sendRouteInput`'s fallback when there's no
 * connected bridge client, or it doesn't answer in time. `attachments` is
 * accepted (and forwarded as attachment refs in the real envelope, per SPEC
 * §6.1) but this local heuristic doesn't use it.
 */
export function classifyLocally(text: string, attachments: ComposerAttachment[] = []): RouteInputResult {
  void attachments;
  const trimmed = text.trim();

  for (const { re, type } of DESTRUCTIVE_PATTERNS) {
    if (re.test(trimmed)) {
      return {
        kind: 'action',
        action: { type, params: { raw: trimmed }, summary: `${trimmed}` },
        // Destructive actions (kill/delete) always require confirm — SPEC §6.
        requiresConfirm: true,
      };
    }
  }

  for (const { re, type } of NON_DESTRUCTIVE_PATTERNS) {
    if (re.test(trimmed)) {
      return {
        kind: 'action',
        action: { type, params: { raw: trimmed }, summary: `${trimmed}` },
        requiresConfirm: false,
      };
    }
  }

  // Not recognized as an environment command — treat as an agent prompt.
  // The real endpoint also cleans the text up using context like available
  // skill names; the local fallback passes it through unchanged.
  return { kind: 'prompt', cleanedText: trimmed };
}

function actionResultToRouteInputResult(result: ActionResultPayload, fallbackText: string): RouteInputResult {
  if (result.kind === 'prompt_routed') {
    return { kind: 'prompt', cleanedText: result.cleanedPrompt ?? fallbackText };
  }
  // 'action_pending_confirm' | 'action_executed' | 'action_rejected' — all
  // represent a routed action, not a prompt. There's no structured
  // action.type/params on ActionResultPayload (it only carries a
  // human-readable `summary`), so this synthesizes a minimal
  // RouteInputAction from what's available; a `requiresConfirm` action
  // becomes 'action_pending_confirm' server-side (BACKEND_SETUP_PLAN.md
  // phase 5's confirm state machine), which this maps back to `true`.
  return {
    kind: 'action',
    action: { type: result.kind, summary: result.summary ?? fallbackText },
    requiresConfirm: result.kind === 'action_pending_confirm',
  };
}

/**
 * Classify + clean up a composer submission. Sends a real `route_input`
 * envelope over the shared bridge connection and awaits the matching
 * `action_result`, falling back to `classifyLocally` if there's no client
 * connected yet or it doesn't answer within `ROUTE_INPUT_TIMEOUT_MS`.
 */
export async function sendRouteInput(
  text: string,
  attachments: ComposerAttachment[] = [],
  sessionId = '',
): Promise<RouteInputResult> {
  const client = getBridgeClient();
  if (!client) return classifyLocally(text, attachments);

  return new Promise<RouteInputResult>((resolve) => {
    let settled = false;
    const finish = (result: RouteInputResult) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => finish(classifyLocally(text, attachments)), ROUTE_INPUT_TIMEOUT_MS);

    const requestId = client.sendRouteInput({
      sessionId,
      text,
      attachmentIds: attachments.map((a) => a.id),
    });

    const unsubscribe = client.onActionResult((result) => {
      if (result.requestId !== requestId) return;
      finish(actionResultToRouteInputResult(result, text.trim()));
    });
  });
}
