import { ActivityIndicator } from 'react-native';

import { useTheme } from '../theme';
import { useDelayedLoading } from '../hooks/useDelayedLoading';

export interface InlineActionSpinnerProps {
  /** True while the element's own action is in flight. */
  active: boolean;
  /** Sized to match the icon/label it replaces — pass the button's icon size. */
  size?: number;
  /** Defaults to the accent token; pass onAccent when the button has a filled accent background. */
  color?: string;
}

/**
 * pig-interaction-states' element-level loading spinner: replaces a single
 * button's label/icon while its own action (not the whole screen) is
 * pending. Gated by pig-loading-states' 300ms delay-before-show so a fast
 * round-trip never flashes a spinner.
 *
 *   {isSending ? <InlineActionSpinner active size={20} color={colors.onAccent} /> : <Icon .../>}
 */
export function InlineActionSpinner({ active, size = 20, color }: InlineActionSpinnerProps) {
  const { colors } = useTheme();
  const show = useDelayedLoading(active);
  if (!show) return null;
  return <ActivityIndicator size={size < 24 ? 'small' : 'large'} color={color ?? colors.accent} />;
}
