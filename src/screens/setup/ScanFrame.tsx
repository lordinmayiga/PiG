/**
 * Mock QR-scanner viewport. No `expo-camera` dependency was wired up —
 * this app has no way to exercise a real camera in this build environment,
 * and Phase 4 explicitly targets local mock state (see the phase brief).
 * This renders the scanning chrome (corner brackets + a moving scan line,
 * matching common QR-scanner conventions) and "Simulate scan" stands in
 * for a real capture, filling in a pairing code and moving the flow on —
 * swap in a real `CameraView` + barcode listener here in Phase 6.
 */
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useTheme } from '../../theme';

const FRAME_SIZE = 220;
const BRACKET_LENGTH = 28;
const BRACKET_THICKNESS = 3;

export default function ScanFrame() {
  const { colors, radius } = useTheme();
  const lineY = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((reduced) => {
        if (cancelled || reduced) return;
        lineY.value = withRepeat(
          withTiming(FRAME_SIZE - 4, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: lineY.value }] }));

  return (
    <View style={[styles.frame, { width: FRAME_SIZE, height: FRAME_SIZE, backgroundColor: colors.neutral[800] }]}>
      <Corner color={colors.accent} position="top-left" />
      <Corner color={colors.accent} position="top-right" />
      <Corner color={colors.accent} position="bottom-left" />
      <Corner color={colors.accent} position="bottom-right" />
      <Animated.View
        style={[styles.scanLine, lineStyle, { backgroundColor: colors.accent, borderRadius: radius.chip }]}
      />
    </View>
  );
}

function Corner({ color, position }: { color: string; position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
  const isTop = position.startsWith('top');
  const isLeft = position.endsWith('left');
  return (
    <View
      style={[
        styles.corner,
        {
          borderColor: color,
          top: isTop ? 0 : undefined,
          bottom: isTop ? undefined : 0,
          left: isLeft ? 0 : undefined,
          right: isLeft ? undefined : 0,
          borderTopWidth: isTop ? BRACKET_THICKNESS : 0,
          borderBottomWidth: isTop ? 0 : BRACKET_THICKNESS,
          borderLeftWidth: isLeft ? BRACKET_THICKNESS : 0,
          borderRightWidth: isLeft ? 0 : BRACKET_THICKNESS,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  corner: {
    position: 'absolute',
    width: BRACKET_LENGTH,
    height: BRACKET_LENGTH,
  },
  scanLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 2,
    height: 2,
    opacity: 0.9,
  },
});
