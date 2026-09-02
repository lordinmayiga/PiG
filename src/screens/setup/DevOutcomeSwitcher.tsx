/**
 * Dev-only control for forcing a specific pairing outcome, so every state
 * (success + all three error variants) can be demoed without a real VPS.
 * Only renders when `__DEV__` is true — never shown in a release build.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme';
import type { ConnectOutcome } from './types';

const OPTIONS: { value: ConnectOutcome; label: string }[] = [
  { value: 'success', label: 'Success' },
  { value: 'unreachable', label: 'Bad host' },
  { value: 'invalid-token', label: 'Bad token' },
  { value: 'timeout', label: 'Timeout' },
];

export default function DevOutcomeSwitcher({
  forced,
  onChange,
}: {
  forced: ConnectOutcome | null;
  onChange: (value: ConnectOutcome | null) => void;
}) {
  const { colors, spacing, radius, typeScale, maxFontScale } = useTheme();

  if (!__DEV__) return null;

  return (
    <View style={{ gap: spacing.xxs }}>
      <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.caption, { color: colors.inkSecondary }]}>
        Dev: force outcome
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: spacing.xxs }}>
          {OPTIONS.map((option) => {
            const active = forced === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => onChange(active ? null : option.value)}
                accessibilityRole="button"
                accessibilityLabel={`Force outcome: ${option.label}`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  {
                    borderRadius: radius.chip,
                    borderColor: active ? colors.accent : colors.border,
                    backgroundColor: active ? colors.accent : 'transparent',
                    paddingHorizontal: spacing.xs,
                  },
                ]}
              >
                <Text
                  maxFontSizeMultiplier={maxFontScale}
                  style={[typeScale.caption, { color: active ? colors.onAccent : colors.inkSecondary }]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
