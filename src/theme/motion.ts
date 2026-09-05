/**
 * Shared Reanimated motion primitives (pig-motion). Keep everything here
 * subtle — a couple of reusable pieces, not an animation framework.
 * Screens compose these rather than hand-rolling `useAnimatedStyle` calls.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
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

/** Row-collapse-on-delete motion (e.g. swipe-to-kill on SessionCard). */
const COLLAPSE_DURATION = 200;

/** FAB / control scale-in-on-mount spring — settles in ~150-180ms. */
const SCALE_IN_SPRING = { damping: 14, stiffness: 260, mass: 0.5 };

/** Bottom-sheet scrim fade + slide-up spring (pig-motion "Sheets"). */
const SHEET_SCRIM_DURATION = 180;
const SHEET_SLIDE_DISTANCE = 300;
const SHEET_SPRING = { damping: 20, stiffness: 140, mass: 0.8 };

let reduceMotionEnabled = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((enabled) => {
    reduceMotionEnabled = enabled;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (enabled) => {
  reduceMotionEnabled = enabled;
});

/** Current reduced-motion setting, for screens that hand-roll a one-off animation. */
export function isReduceMotionEnabled(): boolean {
  return reduceMotionEnabled;
}

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

/** File Explorer folder-traversal motion (pig-motion §Phase 3). */
const FOLDER_SLIDE_DURATION = 180;
const FOLDER_SLIDE_DISTANCE = 12;

/**
 * Forward/reverse slide used when navigating the File Explorer: descending
 * into a child folder slides the new entries in from the right, going back
 * up slides them in from the left. Re-fires whenever `navKey` changes —
 * pass the current folder path.
 */
export function useFolderTraverseSlide(navKey: string, direction: 'forward' | 'back') {
  const translateX = useSharedValue(0);

  useEffect(() => {
    if (reduceMotionEnabled) {
      translateX.value = 0;
      return;
    }
    translateX.value = direction === 'forward' ? FOLDER_SLIDE_DISTANCE : -FOLDER_SLIDE_DISTANCE;
    translateX.value = withTiming(0, { duration: FOLDER_SLIDE_DURATION, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  return useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
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

const CROSS_FADE_DURATION = 180;

/**
 * Opacity-only cross-fade, re-triggered whenever `key` changes — used for
 * step transitions (e.g. Setup's connect -> connecting -> result) where a
 * slide would be too busy. Wrap the switched content in a single
 * `Animated.View` with this style; pass the current step/value as `key`.
 */
export function useCrossFade(key: unknown) {
  const opacity = useSharedValue(reduceMotionEnabled ? 1 : 0);

  useEffect(() => {
    if (reduceMotionEnabled) {
      opacity.value = 1;
      return;
    }
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: CROSS_FADE_DURATION, easing: Easing.inOut(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/**
 * Checkmark scale-bounce played once a pending action (e.g. a pairing
 * handshake) is acknowledged: `scale: 0.8 -> 1.05 -> 1.0`. Pass `active`
 * true only once, when the ack lands — settles straight to `1` under
 * reduced motion.
 */
export function useCheckmarkBounce(active: boolean): SharedValue<number> {
  const scale = useSharedValue(0.8);

  useEffect(() => {
    if (!active) return;
    if (reduceMotionEnabled) {
      scale.value = 1;
      return;
    }
    scale.value = 0.8;
    scale.value = withSequence(
      withTiming(1.05, { duration: 140, easing: Easing.out(Easing.cubic) }),
      withTiming(1.0, { duration: 120, easing: Easing.out(Easing.cubic) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return scale;
}

/**
 * Scale-in-on-mount for a control that appears on screen (e.g. the
 * Sessions FAB): `scale: 0 -> 1` via a light spring, settling in
 * ~150-180ms. Skips straight to the settled state under reduced motion.
 */
export function useScaleIn() {
  const scale = useSharedValue(0);

  useEffect(() => {
    if (reduceMotionEnabled) {
      scale.value = 1;
      return;
    }
    scale.value = withSpring(1, SCALE_IN_SPRING);
  }, [scale]);

  return useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
}

/**
 * Row-collapse-and-remove: call with `active=true` once a destructive
 * action (e.g. swipe-to-kill) has been confirmed, passing the row's
 * measured height. Animates height and opacity to 0 (200ms ease-out
 * cubic) and then calls `onComplete` — where the caller actually deletes
 * the item — once the collapse has settled. Under reduced motion (or
 * before a height has been measured), it skips straight to calling
 * `onComplete`.
 */
export function useCollapseOnRemove(active: boolean, measuredHeight: number, onComplete: () => void) {
  const height = useSharedValue<number | null>(null);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!active) return;
    if (reduceMotionEnabled || measuredHeight <= 0) {
      onComplete();
      return;
    }
    height.value = measuredHeight;
    opacity.value = withTiming(0, { duration: COLLAPSE_DURATION, easing: Easing.out(Easing.cubic) });
    height.value = withTiming(
      0,
      { duration: COLLAPSE_DURATION, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onComplete)();
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, measuredHeight]);

  return useAnimatedStyle(() => {
    if (height.value === null) return {};
    return { height: height.value, opacity: opacity.value, overflow: 'hidden' as const };
  });
}

/**
 * Bottom-sheet presence: backdrop scrim fade (opacity 0 -> 1 over the
 * already-translucent scrim color, 180ms) + sheet slide-up on a damped
 * spring (damping 20, stiffness 140, mass 0.8), and the reverse on close.
 * Returns `mounted` to drive the `Modal`'s `visible` prop — it stays true
 * through the exit animation and only flips false once it settles, so
 * pass `animationType="none"` on the Modal and let this hook own the
 * motion instead.
 *
 *   const { mounted, backdropStyle, sheetStyle } = useSheetMotion(visible);
 *   <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
 *     <Animated.View style={[stylesBackdrop, backdropStyle]}>...</Animated.View>
 *     <Animated.View style={[stylesSheet, sheetStyle]}>...</Animated.View>
 *   </Modal>
 */
export function useSheetMotion(visible: boolean) {
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useSharedValue(visible ? 1 : 0);
  const translateY = useSharedValue(visible ? 0 : SHEET_SLIDE_DISTANCE);

  // Mount immediately on open (and on an instant reduced-motion close) via
  // React's "adjusting state when a prop changes" pattern — setState
  // during render rather than in an effect. A normal close instead defers
  // unmounting to the animation-completion callback below.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setMounted(true);
    } else if (reduceMotionEnabled) {
      setMounted(false);
    }
  }

  useEffect(() => {
    if (visible) {
      if (reduceMotionEnabled) {
        backdropOpacity.value = 1;
        translateY.value = 0;
        return;
      }
      backdropOpacity.value = withTiming(1, {
        duration: SHEET_SCRIM_DURATION,
        easing: Easing.out(Easing.cubic),
      });
      translateY.value = withSpring(0, SHEET_SPRING);
    } else {
      if (reduceMotionEnabled) {
        backdropOpacity.value = 0;
        translateY.value = SHEET_SLIDE_DISTANCE;
        return;
      }
      backdropOpacity.value = withTiming(0, {
        duration: SHEET_SCRIM_DURATION,
        easing: Easing.out(Easing.cubic),
      });
      translateY.value = withTiming(
        SHEET_SLIDE_DISTANCE,
        { duration: SHEET_SCRIM_DURATION, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  return { mounted, backdropStyle, sheetStyle };
}
