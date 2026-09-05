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
    // Cut off mid-stream (connection dropped before `done: true`) reads as
    // "unresolved", not "failed" — the turn may still be running
    // server-side. Warning token, not destructive: distinct from both a
    // finished turn (success) and a server-reported error.
    case 'cutoff':
      return colors.warning;
    case 'done':
    default:
      return colors.success;
  }
}

/**
 * Turn-header status dot (pig-loading-states / pig-motion): pulses only
 * while `streaming` — a "connected"/"done" dot (and a "cutoff" one — it isn't
 * actively streaming anymore) never animates.
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
