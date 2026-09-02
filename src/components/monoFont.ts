/**
 * Roboto Mono, scoped to code contexts only per pig-typography (fenced code
 * blocks, inline `code` spans, and the in-chat text/code file viewer —
 * never general UI text). Loaded locally by the components that need it
 * rather than in App.tsx, since only this screen pair uses it; `useFonts`
 * is safe to call from multiple places — Expo caches the load.
 */
import { useFonts } from 'expo-font';
import { RobotoMono_400Regular, RobotoMono_500Medium } from '@expo-google-fonts/roboto-mono';

export const monoFontFamily = {
  regular: 'RobotoMono_400Regular',
  medium: 'RobotoMono_500Medium',
} as const;

/** System monospace fallback to render with until the Roboto Mono assets finish loading. */
export const monoFontFallback = 'monospace';

export function useMonoFont(): boolean {
  const [loaded] = useFonts({ RobotoMono_400Regular, RobotoMono_500Medium });
  return loaded;
}
