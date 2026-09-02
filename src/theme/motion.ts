/**
 * Shared Reanimated motion primitives (pig-motion). Keep everything here
 * subtle — a couple of reusable pieces, not an animation framework.
 * Screens compose these rather than hand-rolling `useAnimatedStyle` calls.
 */
import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** Standard press feedback: scale to ~0.96 + slight opacity dip. */
export const PRESS_SCALE = 0.96;
export const PRESS_OPACITY = 0.85;
const PRESS_DURATION = 100;

/** Message-arrival / card-load motion. */
const ENTER_DURATION = 220;
const ENTER_SLIDE_DISTANCE = 8;
/** Offset between staggered session cards on first load. */
export const STAGGER_OFFSET_MS = 30;

let reduceMotionEnabled = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((enabled) => {
    reduceMotionEnabled = enabled;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (enabled) => {
  reduceMotionEnabled = enabled;
});

/**
 * Hook for press feedback on a Pressable: spread `pressProps` on the
 * Pressable (onPressIn/onPressOut) and `style` on the Animated.View it
 * wraps.
 *
 *   const { style, pressProps } = usePressScale();
 *   <Pressable {...pressProps}><Animated.View style={style}>...</Animated.View></Pressable>
 */
export function usePressScale() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const pressProps = {
    onPressIn: () => {
      if (reduceMotionEnabled) return;
      scale.value = withTiming(PRESS_SCALE, { duration: PRESS_DURATION, easing: Easing.out(Easing.quad) });
      opacity.value = withTiming(PRESS_OPACITY, { duration: PRESS_DURATION });
    },
    onPressOut: () => {
      scale.value = withTiming(1, { duration: PRESS_DURATION, easing: Easing.out(Easing.quad) });
      opacity.value = withTiming(1, { duration: PRESS_DURATION });
    },
  };

  return { style, pressProps };
}

/**
 * Fade + slide-up entrance, used for transcript messages arriving and
 * (with `delayMs` staggered by `STAGGER_OFFSET_MS` per item) session
 * cards on first load.
 */
export function useFadeSlideIn(delayMs = 0) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(ENTER_SLIDE_DISTANCE);

  useEffect(() => {
    if (reduceMotionEnabled) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withDelay(delayMs, withTiming(1, { duration: ENTER_DURATION, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(
      delayMs,
      withTiming(0, { duration: ENTER_DURATION, easing: Easing.out(Easing.cubic) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delayMs]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
}

/**
 * Slow pulse for the status dot — use ONLY for the "reconnecting" state.
 * Never pulse a connected/idle dot (pig-motion).
 */
export function useStatusDotPulse(active: boolean): SharedValue<number> {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (active && !reduceMotionEnabled) {
      opacity.value = withRepeat(withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      opacity.value = withTiming(1, { duration: 150 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return opacity;
}

/**
 * Typing-indicator dot pulse while awaiting the agent's first streamed
 * token (see pig-loading-states). `index` staggers each of the (usually
 * three) dots.
 */
export function useTypingDotPulse(index: number): SharedValue<number> {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    if (reduceMotionEnabled) {
      opacity.value = 1;
      return;
    }
    opacity.value = withDelay(
      index * 120,
      withRepeat(withTiming(1, { duration: 400, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return opacity;
}
