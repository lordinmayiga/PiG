/**
 * Small persisted-preferences layer, backed by AsyncStorage. Deliberately
 * narrow — this is for local device preferences that shouldn't reset every
 * reload (theme choice), not a general data store. Real session/VPS data
 * stays server-side per pig-architecture-decisions.
 *
 * Pairing state used to live here as a bare `isPaired` boolean; it's now
 * derived from whether secure bridge credentials exist (see
 * src/secureStorage.ts) so there's no separate flag to fall out of sync
 * with the credentials themselves.
 *
 * Every read/write is best-effort: a storage failure falls back to the
 * caller's default rather than crashing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ThemePreference } from './theme/colors';

const KEYS = {
  themePreference: 'pig.themePreference',
} as const;

export async function loadThemePreference(): Promise<ThemePreference | null> {
  try {
    const stored = await AsyncStorage.getItem(KEYS.themePreference);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return null;
  } catch {
    return null;
  }
}

export async function saveThemePreference(value: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.themePreference, value);
  } catch {
    // Best-effort — see file header.
  }
}
