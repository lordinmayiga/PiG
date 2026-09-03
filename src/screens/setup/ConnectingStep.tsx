import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { CircleCheck } from 'lucide-react-native';

import { useTheme } from '../../theme';
import { useCheckmarkBounce } from '../../theme/motion';
import { Icon, iconSizes } from '../../theme/icons';

interface ConnectingStepProps {
  /** True once the (mock) handshake has been acknowledged as a success — swaps the spinner for a bouncing checkmark just before the flow moves on to ResultStep. */
  ack?: boolean;
}

/** Spinner shown while the (mock) pairing attempt is "in flight", swapping to a checkmark bounce once the handshake acks. */
export default function ConnectingStep({ ack = false }: ConnectingStepProps) {
  const { colors, spacing, typeScale, maxFontScale } = useTheme();
  const scale = useCheckmarkBounce(ack);
  const checkmarkStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxxl }}>
      {ack ? (
        <Animated.View style={checkmarkStyle}>
          <Icon icon={CircleCheck} size={iconSizes.lg} color={colors.success} />
        </Animated.View>
      ) : (
        <ActivityIndicator size="large" color={colors.accent} />
      )}
      <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.body, { color: colors.inkSecondary }]}>
        {ack ? 'Connected' : 'Connecting…'}
      </Text>
    </View>
  );
}
