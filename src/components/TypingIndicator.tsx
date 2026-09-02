import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';

import { useTheme, useTypingDotPulse } from '../theme';

function Dot({ index }: { index: number }) {
  const { colors } = useTheme();
  const pulse = useTypingDotPulse(index);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: colors.inkSecondary }, animatedStyle]} />;
}

/**
 * Typing indicator per pig-loading-states: used specifically while awaiting
 * the agent's first streamed chunk, not a generic spinner.
 */
export function TypingIndicator() {
  return (
    <View style={styles.row} accessibilityLabel="Agent is typing">
      <Dot index={0} />
      <Dot index={1} />
      <Dot index={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
