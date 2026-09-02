import { ActivityIndicator, Text, View } from 'react-native';

import { useTheme } from '../../theme';

/** Brief spinner shown while the (mock) pairing attempt is "in flight". */
export default function ConnectingStep() {
  const { colors, spacing, typeScale, maxFontScale } = useTheme();

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxxl }}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.body, { color: colors.inkSecondary }]}>
        Connecting…
      </Text>
    </View>
  );
}
