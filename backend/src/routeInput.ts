/**
 * `/route-input` — SPEC.md §4, §6, §7; FAKE_DATA_ELIMINATION_PLAN.md Phase 4.
 *
 * Classifies + cleans up a composer submission (`route_input` envelope).
 * If OpenRouter API key is configured (in process.env or ~/.config/pig/openrouter.key),
 * uses OpenRouter chat completions with a fast model to classify the input into an action or prompt.
 * If the API key is not configured, or if the network call fails/times out,
 * falls back gracefully to the local regex classifier `classify(text)`.
 */

import type { RouteInputPayload, ActionResultPayload } from '../../src/types/index.js';
import { getSavedOpenRouterKey } from './openrouterConfig.js';
import { proposeAction, executeNonDestructiveAction, type PendingAction } from './actions.js';

export type ClassifiedAction = {
  /** e.g. 'kill_session' | 'new_session' | 'create_session' | 'rename_session' | 'switch_session' | 'cd' */
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
  { re: /\brename session\b|\brename to\b/i, type: 'rename_session' },
  { re: /\bswitch to\b|\bswitch session\b/i, type: 'switch_session' },
  { re: /^cd\s+\S/i, type: 'cd' },
];

/**
 * Classify + clean up composer submission text using local regex patterns.
 * Same rules, same precedence (destructive checked before non-destructive,
 * both before falling through to "treat as prompt").
 */
export function classify(text: string): ClassifyResult {
  const trimmed = text.trim();

  for (const { re, type } of DESTRUCTIVE_PATTERNS) {
    if (re.test(trimmed)) {
      const match = trimmed.match(/(?:kill|delete|stop|end)(?:\s+(?:this\s+)?session)?(?:\s+([a-zA-Z0-9_-]+))?$/i);
      const params: Record<string, unknown> = { raw: trimmed };
      const target = match?.[1];
      if (target && !['session', 'this', 'current', 'it'].includes(target.toLowerCase())) {
        params.name = target;
      }
      return {
        kind: 'action',
        action: { type, params, summary: trimmed },
        // Destructive actions (kill/delete) always require confirm — SPEC §6.
        requiresConfirm: true,
      };
    }
  }

  for (const { re, type } of NON_DESTRUCTIVE_PATTERNS) {
    if (re.test(trimmed)) {
      const params: Record<string, unknown> = { raw: trimmed };
      if (type === 'new_session') {
        const match = trimmed.match(/(?:new session|start a new session|create a session)\s+([a-zA-Z0-9_-]+)/i);
        if (match?.[1]) {
          params.name = match[1];
        }
      } else if (type === 'rename_session') {
        const match = trimmed.match(/(?:rename session(?:\s+to)?|rename(?:\s+to)?)\s+([a-zA-Z0-9_-]+)/i);
        if (match?.[1]) {
          params.newName = match[1];
        }
      } else if (type === 'switch_session') {
        const match = trimmed.match(/(?:switch to|switch session(?:\s+to)?)\s+([a-zA-Z0-9_-]+)/i);
        if (match?.[1]) {
          params.name = match[1];
        }
      } else if (type === 'cd') {
        const match = trimmed.match(/^cd\s+(\S+)/i);
        if (match?.[1]) {
          params.path = match[1];
        }
      }
      return {
        kind: 'action',
        action: { type, params, summary: trimmed },
        requiresConfirm: false,
      };
    }
  }

  // Not recognized as an environment command — treat as an agent prompt.
  return { kind: 'prompt', cleanedText: trimmed };
}

/**
 * Classifies input by calling OpenRouter chat completions.
 */
async function classifyWithOpenRouter(
  text: string,
  sessionId: string | undefined,
  apiKey: string,
): Promise<ClassifyResult> {
  const systemPrompt = `You are an input classifier for PiG (a mobile companion for coding agents on a VPS).
The user submits text from a mobile composer.
Determine whether the submission is:
1. An environment command/action:
   - "kill_session": terminate or stop a session (e.g., "kill session", "stop session foo", "delete this session").
   - "create_session": create or start a new session (e.g., "new session my-proj", "start a session named demo").
   - "rename_session": rename a session (e.g., "rename session to backend", "rename to web").
   - "switch_session": switch to another session (e.g., "switch to session 2", "switch session foo").
   - "cd": change directory in session (e.g., "cd /root/projects/app").
2. An agent prompt:
   - A task, instruction, or question for the coding agent (e.g. "fix the bug", "run tests", "how do I kill a process in linux?"). Questions or instructions to the AI are always prompts, never actions.

You must respond with ONLY a valid JSON object:
If action:
{"kind": "action", "action": {"type": "kill_session"|"create_session"|"rename_session"|"switch_session"|"cd", "params": {"name": string, "oldName"?: string, "newName"?: string, "path"?: string, "raw": string}, "summary": string}, "requiresConfirm": boolean}

If prompt:
{"kind": "prompt", "cleanedPrompt": string}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/lordinmayiga/PiG',
      'X-Title': 'PiG Bridge',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-haiku',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Current sessionId: ${sessionId ?? ''}\nUser input: ${text}` },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawContent = data.choices?.[0]?.message?.content?.trim();
  if (!rawContent) {
    throw new Error('Empty response from OpenRouter');
  }

  // Strip markdown code fences if present
  let cleanedJson = rawContent;
  if (cleanedJson.startsWith('```')) {
    cleanedJson = cleanedJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(cleanedJson) as {
    kind?: string;
    action?: { type: string; params?: Record<string, unknown>; summary?: string };
    requiresConfirm?: boolean;
    cleanedPrompt?: string;
  };

  if (parsed.kind === 'action' && parsed.action?.type) {
    let type = parsed.action.type;
    if (type === 'new_session') type = 'create_session';
    return {
      kind: 'action',
      action: {
        type,
        params: parsed.action.params ?? { raw: text },
        summary: parsed.action.summary ?? text,
      },
      requiresConfirm: parsed.requiresConfirm ?? type === 'kill_session',
    };
  }

  return {
    kind: 'prompt',
    cleanedText: parsed.cleanedPrompt || text.trim(),
  };
}

const ACTION_TYPE_TO_KIND: Record<string, PendingAction['kind']> = {
  kill_session: 'kill_session',
  new_session: 'create_session',
  create_session: 'create_session',
  rename_session: 'rename_session',
  switch_session: 'switch_session',
  cd: 'cd',
};

/**
 * Real `/route-input` handler: classifies input via OpenRouter (or fallback to local regex)
 * and returns the appropriate ActionResultPayload (action proposal/execution or routed prompt).
 */
export async function routeInput(
  payload: RouteInputPayload,
  requestId: string,
): Promise<ActionResultPayload> {
  const apiKey = getSavedOpenRouterKey();
  let classifyResult: ClassifyResult | null = null;

  if (apiKey) {
    try {
      classifyResult = await classifyWithOpenRouter(payload.text, payload.sessionId, apiKey);
    } catch (err) {
      console.warn(
        `[routeInput] OpenRouter classification failed/timed out, falling back to local: ${(err as Error).message}`,
      );
    }
  }

  if (!classifyResult) {
    classifyResult = classify(payload.text);
  }

  if (classifyResult.kind === 'action') {
    const kind = ACTION_TYPE_TO_KIND[classifyResult.action.type];
    if (kind) {
      if (kind === 'kill_session') {
        return proposeAction(kind, payload.sessionId, classifyResult.action.params ?? {}, requestId);
      }
      try {
        const actionResult = await executeNonDestructiveAction(
          kind,
          payload.sessionId,
          classifyResult.action.params ?? {},
        );
        return {
          ...actionResult,
          requestId,
        };
      } catch (err) {
        return {
          requestId,
          kind: 'action_rejected',
          summary: (err as Error).message,
        };
      }
    }
  }

  const cleanedPrompt = classifyResult.kind === 'prompt' ? classifyResult.cleanedText : payload.text.trim();

  return {
    requestId,
    kind: 'prompt_routed',
    cleanedPrompt,
  };
}
