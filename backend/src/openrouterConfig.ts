/**
 * OpenRouter configuration persistence and retrieval (FAKE_DATA_ELIMINATION_PLAN.md Phase 4 & 5).
 *
 * Persists the OpenRouter API key to disk (e.g. /root/.config/pig/openrouter.key)
 * and keeps process.env.OPENROUTER_API_KEY in sync.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { GetOpenRouterKeyAckPayload, SetOpenRouterKeyAckPayload } from '../../src/types/index.js';

export const OPENROUTER_KEY_FILE =
  process.env.PIG_OPENROUTER_KEY_FILE ?? join(homedir(), '.config', 'pig', 'openrouter.key');

/**
 * Gets the active OpenRouter API key from process.env or reads it from disk if not yet in memory.
 */
export function getSavedOpenRouterKey(): string | null {
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim().length > 0) {
    return process.env.OPENROUTER_API_KEY.trim();
  }
  try {
    if (existsSync(OPENROUTER_KEY_FILE)) {
      const key = readFileSync(OPENROUTER_KEY_FILE, 'utf8').trim();
      if (key.length > 0) {
        process.env.OPENROUTER_API_KEY = key;
        return key;
      }
    }
  } catch (err) {
    console.error('[openrouterConfig] Failed to read OpenRouter key from disk:', err);
  }
  return null;
}

/**
 * Saves a new OpenRouter API key to disk, updates process.env, and returns ack payload.
 */
export function saveOpenRouterKey(apiKey: string): SetOpenRouterKeyAckPayload {
  try {
    const trimmed = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!trimmed) {
      return { ok: false, error: 'API key cannot be empty' };
    }
    const dir = dirname(OPENROUTER_KEY_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    writeFileSync(OPENROUTER_KEY_FILE, trimmed, { mode: 0o600, encoding: 'utf8' });
    process.env.OPENROUTER_API_KEY = trimmed;
    const keySuffix = trimmed.length >= 4 ? trimmed.slice(-4) : trimmed;
    return { ok: true, keySuffix };
  } catch (err) {
    console.error('[openrouterConfig] Failed to save OpenRouter key to disk:', err);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Returns the current OpenRouter settings for get_openrouter_key.
 */
export function getOpenRouterKeySettings(): GetOpenRouterKeyAckPayload {
  const key = getSavedOpenRouterKey();
  if (key) {
    return {
      hasKey: true,
      keySuffix: key.length >= 4 ? key.slice(-4) : key,
    };
  }
  return {
    hasKey: false,
  };
}
