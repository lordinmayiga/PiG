/**
 * Theme barrel export. Prefer `useTheme()` from screens/components — it
 * bundles colors/spacing/radius/typography for the active scheme in one
 * call. Individual modules stay importable directly for cases that only
 * need e.g. `spacing` or `radius` without colors.
 */
import { spacing, cardPadding, screenMargin, listItemGap, minTouchTarget } from './spacing';
import { radius } from './radius';
import { typeScale, fontFamily, MAX_FONT_SCALE } from './typography';
import { useThemeMode, palettes, type ThemeColors, type ColorScheme } from './colors';

export * from './colors';
export * from './spacing';
export * from './radius';
export * from './typography';
export * from './icons';
export * from './motion';
export * from './interaction';

export interface Theme {
  colors: ThemeColors;
  scheme: ColorScheme;
  spacing: typeof spacing;
  cardPadding: number;
  screenMargin: number;
  listItemGap: number;
  minTouchTarget: number;
  radius: typeof radius;
  typeScale: typeof typeScale;
  fontFamily: typeof fontFamily;
  maxFontScale: number;
}

/** Combined theme hook: colors + spacing + radius + typography for the active scheme. */
export function useTheme(): Theme {
  const { scheme } = useThemeMode();
  return {
    colors: palettes[scheme],
    scheme,
    spacing,
    cardPadding,
    screenMargin,
    listItemGap,
    minTouchTarget,
    radius,
    typeScale,
    fontFamily,
    maxFontScale: MAX_FONT_SCALE,
  };
}
