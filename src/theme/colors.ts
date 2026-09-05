/**
 * PiG color system.
 * Source of truth: DESIGN.md ("Color palette" + "Surface elevation tokens")
 * and the pig-color-system skill. Do not hand-roll new colors here — add
 * them to DESIGN.md first, validate contrast, then port the value.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { loadThemePreference, saveThemePreference } from '../storage';

export type ColorScheme = 'light' | 'dark';
/** A user-selectable preference: 'system' follows the OS setting. */
export type ThemePreference = ColorScheme | 'system';

export interface ThemeColors {
  /** Page background. */
  canvas: string;
  /** Card / list-item surface. */
  card: string;
  /** Sheets, modals — surfaces above cards. */
  elevated: string;
  /** Scrim behind elevated surfaces (light mode only has a real value; dark still gets one for consistency). */
  scrim: string;
  /** Hairline borders / dividers. */
  border: string;

  /** Primary ink (body text, icons on canvas/card). */
  ink: string;
  /** Secondary / de-emphasized text. */
  inkSecondary: string;
  /** Placeholder text. */
  inkPlaceholder: string;
  /** Text/icon color to use on top of a filled `accent` surface. */
  onAccent: string;

  /** Primary brand accent — Velvet Orchid (light) / Velvet Orchid Dark (dark). */
  accent: string;
  /** Low-emphasis accent-tinted fill (selected rows, highlighted pills) — replaces the `accent + 'NN'` alpha-string hack. */
  accentTint: string;
  /** Press-feedback fill for interactive rows/buttons — one step up from `card`, direction inverts by mode. Never use `neutral[100..300]` directly for this. */
  pressedFill: string;

  /**
   * PROPOSED — syntax-highlight string color (file-viewer code highlighting,
   * see pig-color-system's "Syntax highlighting" section and
   * pig-markdown-rendering). Not yet confirmed by design review. Keywords
   * reuse `accent` and comments reuse `inkSecondary` directly (no dedicated
   * token) rather than invent two more new hues; this is the one color the
   * scheme needed that nothing existing already covered.
   */
  syntaxString: string;

  /** Success / connected — fill & dot only, never text. */
  success: string;
  /** Warning text/icon — passes 4.5:1 on canvas, unlike the other semantic colors used as fills. */
  warning: string;
  /** Destructive — buttons / large-bold text only, not small print. */
  destructive: string;

  /** Idle status dot. */
  idleDot: string;

  /** Neutral ramp, exposed for the rare case a component needs a specific step directly. */
  neutral: {
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
  };
}

const neutral = {
  100: '#f2ebe8',
  200: '#e4dad5',
  300: '#cbbdb6',
  400: '#a99a93',
  500: '#85756f',
  600: '#635550',
  700: '#453b37',
  800: '#2a2321',
} as const;

const base = {
  velvetOrchid: '#7e2e84',
  velvetOrchidDark: '#cd89d2',
  snow: '#fbf5f3',
  mutedTeal: '#8daa9d',
  onyx: '#0f0e0e',
  rosyCopper: '#bf4e30',
  rosyCopperDark: '#da846c',
  amberOchreDeep: '#8b6118',
  amberOchre: '#d2962d',
  /** PROPOSED — syntax-highlight string color, see `syntaxString` above. */
  slateBlue: '#1a5a9e',
  slateBlueDark: '#8ec2ee',
} as const;

export const lightColors: ThemeColors = {
  canvas: base.snow,
  card: '#ffffff',
  elevated: '#ffffff',
  scrim: 'rgba(15,14,14,.4)',
  border: neutral[200],

  ink: base.onyx,
  inkSecondary: neutral[700],
  inkPlaceholder: neutral[500],
  onAccent: base.snow,

  accent: base.velvetOrchid,
  accentTint: '#f2e3f3',
  pressedFill: neutral[100],
  syntaxString: base.slateBlue,

  success: base.mutedTeal,
  warning: base.amberOchreDeep,
  destructive: base.rosyCopper,

  idleDot: neutral[300],

  neutral,
};

export const darkColors: ThemeColors = {
  canvas: base.onyx,
  card: '#1c1917',
  elevated: '#372f2c',
  scrim: 'rgba(15,14,14,.4)',
  border: neutral[800],

  ink: base.snow,
  inkSecondary: neutral[400],
  inkPlaceholder: neutral[500],
  onAccent: base.onyx,

  accent: base.velvetOrchidDark,
  accentTint: '#3a2a3c',
  pressedFill: '#372f2c',
  syntaxString: base.slateBlueDark,

  success: base.mutedTeal,
  warning: base.amberOchre,
  destructive: base.rosyCopperDark,

  idleDot: neutral[600],

  neutral,
};

export const palettes: Record<ColorScheme, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};

/**
 * Resolves the OS color scheme, defaulting to light if it reports
 * `null`/`undefined` (matches DESIGN.md's light-first direction).
 */
function useSystemColorScheme(): ColorScheme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? 'dark' : 'light';
}

interface ThemeModeContextValue {
  /** The user's stored preference — 'system' (default) or an explicit override. */
  preference: ThemePreference;
  /** The resolved scheme after applying 'system'. */
  scheme: ColorScheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

/**
 * Provides app-wide light/dark/system theme switching. Wrap the app once
 * (e.g. in App.tsx) with `<ThemeModeProvider>`. Everything under it can
 * read the resolved scheme via `useColors`/`useTheme`, or let the user
 * change the preference via `useThemeMode().setPreference`.
 */
export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const scheme = preference === 'system' ? systemScheme : preference;

  // Load the persisted choice once on mount. If nothing was ever saved (or
  // the read fails), stay on the 'system' default — no loading gate needed
  // here since a brief moment on the system scheme before this resolves
  // isn't the jarring kind of flash (unlike RootNavigator's Setup/Tabs gate).
  useEffect(() => {
    loadThemePreference().then((stored) => {
      if (stored) setPreferenceState(stored);
    });
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    saveThemePreference(next);
  };

  const value = useMemo(
    () => ({ preference, scheme, setPreference }),
    [preference, scheme],
  );

  return React.createElement(ThemeModeContext.Provider, { value }, children);
}

/**
 * Access and change the user's theme preference. Must be called under
 * `ThemeModeProvider`; falls back to system-only behavior (no persisted
 * preference) if used outside one so consumers don't crash during
 * incremental adoption.
 */
export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  const systemScheme = useSystemColorScheme();
  if (ctx) return ctx;
  return { preference: 'system', scheme: systemScheme, setPreference: () => {} };
}

/** Returns the resolved color tokens for the active scheme. */
export function useColors(): ThemeColors {
  const { scheme } = useThemeMode();
  return palettes[scheme];
}
