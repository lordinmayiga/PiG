import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '../theme';
import type { LucideIconComponent } from '../theme/icons';
import { Icon } from '../theme/icons';
import { usePressScale } from '../theme/motion';
import { DISABLED_OPACITY } from '../theme/interaction';

interface SettingsRowProps {
  icon: LucideIconComponent;
  label: string;
  /** Secondary line under the label — e.g. a host, a masked key, a status. */
  value?: string;
  /** Rendered at the row's trailing edge instead of `value` (e.g. a Switch). */
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}

/**
 * One tappable (or static, if `onPress` is omitted) settings row: leading
 * icon, label + optional secondary value, optional trailing control.
 * Shared by the VPS, OpenRouter, and security sections on SettingsScreen.
 */
export function SettingsRow({ icon, label, value, trailing, onPress, disabled }: SettingsRowProps) {
  const { colors, spacing, typeScale, minTouchTarget, fontFamily, maxFontScale } = useTheme();
  const { style: pressStyle, pressProps } = usePressScale();

  // Disabled is opacity-only per pig-interaction-states — never swap to a
  // separate hardcoded gray for icon/label (that's the "unvalidated color"
  // pig-color-system warns against), and disabled rows skip press feedback
  // entirely rather than scale-and-bounce-back on a tap that no-ops.
  const content = (
    <View
      style={[
        styles.row,
        { minHeight: minTouchTarget, paddingVertical: spacing.sm, gap: spacing.sm, opacity: disabled ? DISABLED_OPACITY : 1 },
      ]}
    >
      <View style={styles.iconSlot}>
        <Icon icon={icon} color={colors.inkSecondary} />
      </View>
      <View style={styles.textSlot}>
        <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.bodyMedium, { color: colors.ink, fontFamily: fontFamily.medium }]}>
          {label}
        </Text>
        {value ? (
          <Text
            maxFontSizeMultiplier={maxFontScale}
            style={[typeScale.caption, { color: colors.inkSecondary, marginTop: 2 }]}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailingSlot}>{trailing}</View> : null}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      {...(disabled ? {} : pressProps)}
    >
      <Animated.View style={disabled ? undefined : pressStyle}>{content}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconSlot: {
    width: 24,
    alignItems: 'center',
  },
  textSlot: {
    flex: 1,
  },
  trailingSlot: {
    alignItems: 'flex-end',
  },
});
