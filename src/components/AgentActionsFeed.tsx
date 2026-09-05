import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  ChevronDown,
  Check,
  FileText,
  PencilLine,
  Search,
  Terminal,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import { useFadeSlideIn, useStatusDotPulse } from '../theme/motion';
import { categorizeTool } from '../utils/actionLabels';
import type { AgentAction } from '../types';

const CATEGORY_ICON: Record<string, LucideIcon> = {
  run: Terminal,
  read: FileText,
  write: PencilLine,
  edit: PencilLine,
  search: Search,
  find: Search,
  other: Wrench,
};

interface ActionRowProps {
  action: AgentAction;
}

function ActionRow({ action }: ActionRowProps) {
  const { colors, spacing, typeScale } = useTheme();
  const animatedStyle = useFadeSlideIn();
  const pulseOpacity = useStatusDotPulse(action.status === 'running');
  const dotPulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  const RowIcon = CATEGORY_ICON[categorizeTool(action.tool)] ?? Wrench;
  const iconColor =
    action.status === 'error' ? colors.destructive : action.status === 'running' ? colors.accent : colors.inkSecondary;

  return (
    <Animated.View style={[styles.row, { paddingVertical: spacing.xxs }, animatedStyle]}>
      <View style={styles.rowIconWrap}>
        <Icon icon={RowIcon} size={16} color={iconColor} />
      </View>
      <Text
        style={[typeScale.caption, styles.rowLabel, { color: action.status === 'error' ? colors.destructive : colors.inkSecondary }]}
        numberOfLines={1}
      >
        {action.label}
      </Text>
      {action.status === 'running' ? (
        <Animated.View testID="action-pulse-dot" style={[styles.statusDot, { backgroundColor: colors.accent }, dotPulseStyle]} />
      ) : action.status === 'error' ? (
        <Icon icon={TriangleAlert} size={16} color={colors.destructive} />
      ) : (
        <Icon icon={Check} size={16} color={colors.success} />
      )}
    </Animated.View>
  );
}

interface AgentActionsFeedProps {
  actions: AgentAction[];
}

/**
 * Live feed of the agent's tool calls this turn — replaces the old
 * ThinkingAccordion's role per AGENT_ACTIONS_STREAM_PLAN.md: this is real,
 * always-present data (verified against both CLIs), so it stays visible
 * while the turn streams instead of auto-collapsing, and only offers a
 * one-line "N actions" summary once the turn is done, per
 * pig-layout-spacing's density rules.
 */
export function AgentActionsFeed({ actions }: AgentActionsFeedProps) {
  const { colors, spacing, radius, typeScale } = useTheme();
  // Starts uncollapsed (per row below, disabled while running anyway) but is
  // auto-flipped to collapsed the instant the turn finishes — see the effect
  // below. `userExpandedRef` remembers a manual tap so a later actions-array
  // update (e.g. a fresh turn re-using this same feed instance) doesn't fight
  // the user's own choice to re-open it.
  const [collapsed, setCollapsed] = useState(false);
  const autoCollapsedRef = useRef(false);

  const stillRunning = useMemo(() => actions.some((a) => a.status === 'running'), [actions]);

  // Auto-collapse to the one-line "N actions" summary the moment nothing is
  // running any more (i.e. the turn's tool use just finished) — per
  // AGENT_ACTIONS_STREAM_PLAN.md / UI_FIXES_PLAN.md item 1: collapsed by
  // default once done, never mid-stream (that's the exact "what is it doing
  // right now" moment this feed exists to answer), and only once per turn so
  // a manual re-expand sticks.
  useEffect(() => {
    if (!stillRunning && !autoCollapsedRef.current) {
      autoCollapsedRef.current = true;
      setCollapsed(true);
    }
    if (stillRunning) {
      autoCollapsedRef.current = false;
    }
  }, [stillRunning]);

  if (actions.length === 0) return null;

  const isCollapsed = !stillRunning && collapsed;
  // Cap the expanded list at 7 rows — older entries scroll off (oldest first)
  // so the feed's height stays predictable regardless of how many tool calls
  // a turn makes.
  const visibleActions = actions.slice(-7);

  return (
    <View
      testID="agent-actions-feed"
      style={[
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.card },
      ]}
    >
      <Pressable
        testID="agent-actions-header"
        onPress={() => setCollapsed((prev) => !prev)}
        disabled={stillRunning}
        style={[styles.header, { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs }]}
        accessibilityRole="button"
        accessibilityLabel={isCollapsed ? `${actions.length} actions, collapsed` : 'Agent actions'}
      >
        <Text style={[typeScale.label, { color: colors.inkSecondary, fontWeight: '500' }]}>
          {stillRunning ? 'Working…' : `${actions.length} action${actions.length === 1 ? '' : 's'}`}
        </Text>
        {!stillRunning ? (
          <Animated.View style={{ transform: [{ rotate: isCollapsed ? '0deg' : '180deg' }] }}>
            <Icon icon={ChevronDown} size={16} color={colors.inkSecondary} />
          </Animated.View>
        ) : null}
      </Pressable>
      {!isCollapsed ? (
        <View testID="agent-actions-list" style={[styles.list, { paddingHorizontal: spacing.sm, paddingBottom: spacing.xxs }]}>
          {visibleActions.map((action) => (
            <ActionRow key={action.id} action={action} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  list: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowIconWrap: {
    width: 16,
    alignItems: 'center',
  },
  rowLabel: {
    flex: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
