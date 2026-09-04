/**
 * Small shared primitives for the Setup flow only — kept local to
 * src/screens/setup rather than src/theme (other workstreams own theme/
 * shared components) since nothing here is reused outside this flow yet.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

import { useTheme } from '../../theme';
import { isReduceMotionEnabled, usePressScale } from '../../theme/motion';
import { Icon, iconSizes } from '../../theme/icons';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'filled' | 'outline';
}

export function PrimaryButton({ label, onPress, disabled, loading, variant = 'filled' }: PrimaryButtonProps) {
  const { colors, radius, spacing, typeScale, minTouchTarget, maxFontScale } = useTheme();
  const { style: pressStyle, pressProps } = usePressScale();
  const isOutline = variant === 'outline';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      {...pressProps}
      style={{ minHeight: minTouchTarget }}
    >
      <Animated.View
        style={[
          pressStyle,
          styles.button,
          {
            minHeight: minTouchTarget,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.lg,
            backgroundColor: isOutline ? 'transparent' : colors.accent,
            borderWidth: isOutline ? 1 : 0,
            borderColor: colors.border,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={isOutline ? colors.accent : colors.onAccent} />
        ) : (
          <Text
            maxFontSizeMultiplier={maxFontScale}
            style={[
              typeScale.label,
              { color: isOutline ? colors.ink : colors.onAccent, fontSize: 15, lineHeight: 20 },
            ]}
          >
            {label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

interface LinkButtonProps {
  label: string;
  onPress: () => void;
  align?: 'center' | 'flex-start';
}

export function LinkButton({ label, onPress, align = 'center' }: LinkButtonProps) {
  const { colors, typeScale, minTouchTarget, maxFontScale } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{ minHeight: minTouchTarget, justifyContent: 'center', alignItems: align === 'center' ? 'center' : 'flex-start' }}
    >
      <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.bodyMedium, { color: colors.accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

interface TextFieldProps extends Pick<TextInputProps, 'autoCapitalize' | 'keyboardType' | 'secureTextEntry'> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  errorText?: string;
  onBlur?: () => void;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  errorText,
  onBlur,
  autoCapitalize = 'none',
  keyboardType,
  secureTextEntry,
}: TextFieldProps) {
  const { colors, radius, spacing, typeScale, minTouchTarget, maxFontScale } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: spacing.xxs }}>
      <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.label, { color: colors.inkSecondary }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkPlaceholder}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        maxFontSizeMultiplier={maxFontScale}
        style={[
          typeScale.body,
          {
            color: colors.ink,
            minHeight: minTouchTarget,
            borderRadius: radius.chip,
            borderWidth: 1,
            borderColor: errorText ? colors.destructive : focused ? colors.accent : colors.border,
            backgroundColor: colors.card,
            paddingHorizontal: spacing.sm,
          },
        ]}
      />
      {errorText ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.caption, { color: colors.destructive }]}>
          {errorText}
        </Text>
      ) : null}
    </View>
  );
}

interface CollapsiblePanelProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export function CollapsiblePanel({ title, expanded, onToggle, children, icon }: CollapsiblePanelProps) {
  const { colors, radius, spacing, typeScale, minTouchTarget, maxFontScale } = useTheme();
  const reduceMotion = isReduceMotionEnabled();

  return (
    <Animated.View
      layout={reduceMotion ? undefined : LinearTransition.duration(200).easing(Easing.out(Easing.cubic))}
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded }}
        style={{
          minHeight: minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 }}>
          {icon}
          <Text
            maxFontSizeMultiplier={maxFontScale}
            style={[typeScale.bodyMedium, { color: colors.ink, flexShrink: 1 }]}
          >
            {title}
          </Text>
        </View>
        {expanded ? <ChevronGlyph up color={colors.inkSecondary} /> : <ChevronGlyph up={false} color={colors.inkSecondary} />}
      </Pressable>
      {expanded ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(150)}
          exiting={reduceMotion ? undefined : FadeOut.duration(120)}
          style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: spacing.xs }}
        >
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function ChevronGlyph({ up, color }: { up: boolean; color: string }) {
  return <Icon icon={up ? ChevronUp : ChevronDown} size={iconSizes.sm} color={color} />;
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
