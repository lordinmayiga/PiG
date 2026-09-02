/**
 * PiG corner-radius scale, by role — not one flat value everywhere.
 * Source: DESIGN.md "Layout & spacing" / pig-layout-spacing skill.
 */
export const radius = {
  /** Chips / badges. */
  chip: 8,
  /** Cards. */
  card: 16,
  /** Composer pill / primary buttons — fully rounded. */
  pill: 24,
  /** Bottom-sheet top corners. */
  sheet: 24,
} as const;

export type RadiusKey = keyof typeof radius;
