import { useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedAnimated from 'react-native-reanimated';
import { EllipsisVertical, Rocket, SquareTerminal, Trash2 } from 'lucide-react-native';

import { Icon, useTheme } from '../../theme';
import { STAGGER_OFFSET_MS, useFadeSlideIn } from '../../theme/motion';
import type { AgentKind, Session, SessionStatus } from '../../types';

const SWIPE_ACTION_WIDTH = 88;
const SWIPE_OPEN_THRESHOLD = SWIPE_ACTION_WIDTH / 2;

const agentMeta: Record<AgentKind, { label: string; icon: typeof SquareTerminal }> = {
  'claude-code': { label: 'Claude Code', icon: SquareTerminal },
  antigravity: { label: 'Antigravity', icon: Rocket },
};

const statusLabel: Record<SessionStatus, string> = {
  active: 'Active',
  idle: 'Idle',
  disconnected: 'Disconnected',
};

/** Small "3h ago" / "just now" formatter — no i18n library in Phase 4. */
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export interface SessionCardProps {
  session: Session;
  /** Index in the list — staggers the first-load entrance animation. */
  index: number;
  onPress: (session: Session) => void;
  onOpenMenu: (session: Session) => void;
  onSwipeKill: (session: Session) => void;
}

export default function SessionCard({ session, index, onPress, onOpenMenu, onSwipeKill }: SessionCardProps) {
  const { colors, spacing, radius, cardPadding, typeScale, minTouchTarget } = useTheme();
  const enterStyle = useFadeSlideIn(index * STAGGER_OFFSET_MS);
  const [translateX] = useState(() => new Animated.Value(0));
  // Plain mutable box (not a React ref) tracking swipe-open state
  // synchronously for the gesture callbacks below, mirrored into `isOpen`
  // state for rendering.
  const [swipeState] = useState(() => ({ open: false }));
  const [isOpen, setIsOpen] = useState(false);

  const closeSwipe = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start();
    swipeState.open = false;
    setIsOpen(false);
  };

  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => {
        const next = swipeState.open ? gesture.dx - SWIPE_ACTION_WIDTH : gesture.dx;
        translateX.setValue(Math.min(0, Math.max(next, -SWIPE_ACTION_WIDTH)));
      },
      onPanResponderRelease: (_, gesture) => {
        const dragged = swipeState.open ? gesture.dx - SWIPE_ACTION_WIDTH : gesture.dx;
        const shouldOpen = dragged < -SWIPE_OPEN_THRESHOLD;
        Animated.spring(translateX, {
          toValue: shouldOpen ? -SWIPE_ACTION_WIDTH : 0,
          useNativeDriver: false,
          bounciness: 0,
        }).start();
        swipeState.open = shouldOpen;
        setIsOpen(shouldOpen);
      },
    }),
  );

  const handleCardPress = () => {
    if (isOpen) {
      closeSwipe();
      return;
    }
    onPress(session);
  };

  const handleSwipeKillPress = () => {
    closeSwipe();
    onSwipeKill(session);
  };

  const agent = agentMeta[session.agent];
  const statusDotColor =
    session.status === 'active'
      ? colors.success
      : session.status === 'disconnected'
        ? colors.destructive
        : colors.idleDot;

  return (
    <ReanimatedAnimated.View style={enterStyle}>
      <View style={[styles.swipeContainer, { borderRadius: radius.card }]}>
        <Pressable
          style={[styles.swipeAction, { width: SWIPE_ACTION_WIDTH, backgroundColor: colors.destructive }]}
          onPress={handleSwipeKillPress}
          accessibilityRole="button"
          accessibilityLabel={`Kill session ${session.name}`}
        >
          <Icon icon={Trash2} size={20} color={colors.onAccent} />
          <Text style={[typeScale.label, { color: colors.onAccent, marginTop: spacing.xxs }]}>Kill</Text>
        </Pressable>

        <Animated.View
          {...panResponder.panHandlers}
          style={[styles.card, { transform: [{ translateX }] }]}
        >
          <Pressable
            onPress={handleCardPress}
            onLongPress={() => onOpenMenu(session)}
            accessibilityRole="button"
            accessibilityLabel={`${session.name}, ${agent.label}, ${statusLabel[session.status]}`}
            style={[
              styles.pressable,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: radius.card,
                padding: cardPadding,
              },
            ]}
          >
            <View style={styles.headerRow}>
              <View style={[styles.agentBadge, { flex: 1 }]}>
                <Icon icon={agent.icon} size={16} color={colors.inkSecondary} />
                <Text style={[typeScale.caption, { color: colors.inkSecondary, marginLeft: spacing.xxs }]}>
                  {agent.label}
                </Text>
              </View>
              <Pressable
                onPress={() => onOpenMenu(session)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Options for ${session.name}`}
                style={[styles.menuButton, { minWidth: minTouchTarget / 2, minHeight: minTouchTarget / 2 }]}
              >
                <Icon icon={EllipsisVertical} size={20} color={colors.inkSecondary} />
              </Pressable>
            </View>

            <Text
              style={[typeScale.subheading, { color: colors.ink, marginTop: spacing.xxs }]}
              numberOfLines={1}
            >
              {session.name}
            </Text>

            <Text
              style={[typeScale.caption, { color: colors.inkSecondary, marginTop: spacing.xxs }]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {session.folder}
            </Text>

            <Text
              style={[typeScale.body, { color: colors.inkSecondary, marginTop: spacing.xs }]}
              numberOfLines={2}
            >
              {session.lastMessagePreview}
            </Text>

            <View style={[styles.footerRow, { marginTop: spacing.sm }]}>
              <View style={styles.statusGroup}>
                <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
                <Text style={[typeScale.caption, { color: colors.inkSecondary, marginLeft: spacing.xxs }]}>
                  {statusLabel[session.status]}
                </Text>
              </View>
              <Text style={[typeScale.caption, { color: colors.inkPlaceholder }]}>
                {formatRelativeTime(session.lastActivityAt)}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </ReanimatedAnimated.View>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    overflow: 'hidden',
  },
  swipeAction: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    // Sits on top of the swipe action, opaque, slides left to reveal it.
  },
  pressable: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
