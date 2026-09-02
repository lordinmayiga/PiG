import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { StyleSheet } from 'react-native';

import { useStatusDotPulse, useTheme, type Theme } from '../theme';
import type { AgentTurnStatus } from '../types';

interface AgentStatusDotProps {
  status: AgentTurnStatus;
}

function dotColor(status: AgentTurnStatus, colors: Theme['colors']): string {
  switch (status) {
    case 'streaming':
      return colors.accent;
    case 'error':
      return colors.destructive;
    case 'done':
    default:
      return colors.success;
  }
}

/**
 * Turn-header status dot (pig-loading-states / pig-motion): pulses only
 * while `streaming` — a "connected"/"done" dot never animates.
 */
export function AgentStatusDot({ status }: AgentStatusDotProps) {
  const theme = useTheme();
  const pulse = useStatusDotPulse(status === 'streaming');
  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: dotColor(status, theme.colors) }, animatedStyle]}
      accessibilityLabel={`Agent turn status: ${status}`}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
