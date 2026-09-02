/**
 * Thin wrapper around lucide-react-native for consistent icon usage
 * (pig-icons-branding): 2px stroke always, size from a fixed 16/20/24
 * scale, color always passed in from the color tokens (never hardcoded).
 *
 * Usage:
 *   import { Icon } from '../theme/icons';
 *   import { Send } from 'lucide-react-native';
 *   <Icon icon={Send} size={20} color={colors.accent} />
 *
 * For icon-only buttons, the *consumer* must still supply
 * `accessibilityLabel` on the wrapping Pressable/TouchableOpacity — this
 * wrapper only renders the glyph.
 */
import React from 'react';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

/**
 * lucide-react-native doesn't export its `LucideIcon` component type, so
 * this mirrors its public shape (icon components accept the usual SVG
 * props plus `size`/`strokeWidth`).
 */
export type LucideIconComponent = ComponentType<SvgProps & { size?: string | number }>;

export const ICON_STROKE_WIDTH = 2;

/** The only sizes PiG icons should use. */
export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
} as const;

export type IconSize = (typeof iconSizes)[keyof typeof iconSizes];

export interface IconProps {
  icon: LucideIconComponent;
  /** Defaults to `iconSizes.md` (20). */
  size?: IconSize;
  color: string;
}

export function Icon({ icon: LucideIconComponent, size = iconSizes.md, color }: IconProps) {
  return React.createElement(LucideIconComponent, {
    size,
    color,
    strokeWidth: ICON_STROKE_WIDTH,
  });
}
