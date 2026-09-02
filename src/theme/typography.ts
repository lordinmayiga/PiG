/**
 * PiG type scale — Onest, weights 400/500/600/700 only (pig-typography).
 *
 * DESIGN.md locks the typeface, bundled weights, and the 1.3× font-scale
 * cap, but does not lock a specific size/line-height scale — the roles and
 * values below are this phase's interpretation, sized for a notes-app,
 * content-first density. Revisit if a real screen needs a role this
 * doesn't cover.
 */

export const fontFamily = {
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semiBold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
} as const;

/** Hard cap on Android system font-scaling — pass as `maxFontSizeMultiplier` on every <Text>. */
export const MAX_FONT_SCALE = 1.3;

export interface TextStyleToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}

export const typeScale = {
  /** Screen titles ("Sessions", "Settings"). */
  title: { fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 32 },
  /** Section / sheet headers, session-card title. */
  heading: { fontFamily: fontFamily.semiBold, fontSize: 20, lineHeight: 28 },
  /** Sub-headers, list-item primary text at higher emphasis. */
  subheading: { fontFamily: fontFamily.semiBold, fontSize: 17, lineHeight: 24 },
  /** Default reading text — transcript messages, body copy. */
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  /** Body text needing emphasis without a full heading jump. */
  bodyMedium: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 22 },
  /** Buttons, chips, tab labels. */
  label: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  /** Timestamps, secondary metadata, helper text. */
  caption: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16 },
} satisfies Record<string, TextStyleToken>;

export type TypeScaleKey = keyof typeof typeScale;

/**
 * Onest font assets to hand to `useFonts` from `@expo-google-fonts/onest`.
 * Keep this in sync with `fontFamily` above (400/500/600/700 only).
 */
export { Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold } from '@expo-google-fonts/onest';
