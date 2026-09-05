/**
 * pig-interaction-states primitives: the disabled-opacity constant and the
 * focus-visible ring, shared by every tappable/focusable element. Colocated
 * with (but separate from) motion.ts since these aren't animations — they're
 * static state treatments the skill requires alongside press/loading motion.
 */
import { useRef, useState } from 'react';
import type { NativeSyntheticEvent, TargetedEvent } from 'react-native';

import type { ThemeColors } from './colors';

/** Opacity applied to a disabled element's fill/text/icon (pig-interaction-states).
 * Never hand-roll a different disabled opacity or swap to a separate gray color —
 * this is the one value used everywhere. */
export const DISABLED_OPACITY = 0.4;

const FOCUS_RING_WIDTH = 2;
const FOCUS_RING_OFFSET = 2;
/** A focus event firing this soon after a touch start is treated as touch-derived,
 * not keyboard/D-pad/TalkBack — RN gives no direct input-modality signal, so this
 * timing heuristic (mirrors the common web/RN workaround) stands in for one. */
const TOUCH_SUPPRESSION_WINDOW_MS = 50;

/**
 * Tracks whether the wrapped element is currently focused via a non-touch
 * input (hardware keyboard, D-pad, TalkBack linear navigation) — never via a
 * plain touch. Spread `focusProps` on the focusable element (`Pressable`,
 * `TextInput`) and merge `ringStyle` into its style when `visible` is true.
 *
 *   const { visible, ringStyle, focusProps } = useFocusVisible(colors);
 *   <Pressable {...focusProps} style={[..., visible && ringStyle]}>
 */
export function useFocusVisible(colors: ThemeColors) {
  const [visible, setVisible] = useState(false);
  const lastTouchAt = useRef(0);

  const focusProps = {
    onTouchStart: () => {
      lastTouchAt.current = Date.now();
    },
    onFocus: (_e: NativeSyntheticEvent<TargetedEvent>) => {
      const touchDerived = Date.now() - lastTouchAt.current < TOUCH_SUPPRESSION_WINDOW_MS;
      setVisible(!touchDerived);
    },
    onBlur: () => setVisible(false),
  };

  const ringStyle = {
    borderWidth: FOCUS_RING_WIDTH,
    borderColor: colors.accent,
    // Approximates a 2px offset ring without a second wrapper view — pulls
    // the element's own border out beyond its edge via negative margin.
    margin: -FOCUS_RING_OFFSET,
  };

  return { visible, ringStyle, focusProps };
}
