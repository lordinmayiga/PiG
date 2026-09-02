/**
 * PiG spacing scale (4px base). Source: DESIGN.md "Layout & spacing" /
 * pig-layout-spacing skill. Every layout gap/padding should come from this
 * scale — don't introduce off-scale values.
 */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export type SpacingKey = keyof typeof spacing;

/** Card interior padding. */
export const cardPadding = spacing.md; // 16
/** Screen-edge margins. */
export const screenMargin = 20;
/** Gap between items in a list. */
export const listItemGap = spacing.sm; // 12

/** Minimum touch target size (dp) for every tappable element. */
export const minTouchTarget = 48;
