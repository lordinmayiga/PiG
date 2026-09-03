import { useEffect, useRef } from 'react';
import { Plus, X } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme';
import { isReduceMotionEnabled } from '../theme/motion';
import { Icon, iconSizes } from '../theme/icons';
import type { BrowserTab } from '../fixtures/browser';

const CHIP_SCALE_IN_DURATION = 150;
const CHIP_CLOSE_DURATION = 150;
const PILL_SLIDE_DURATION = 220;

interface TabStripProps {
  tabs: BrowserTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
}

interface TabLayout {
  x: number;
  width: number;
}

/** Horizontal strip of open browser tabs, for BrowserScreen (SPEC.md §9). */
export function TabStrip({ tabs, activeTabId, onSelect, onClose, onNewTab }: TabStripProps) {
  const { colors, spacing, radius, minTouchTarget } = useTheme();

  const tabLayouts = useRef<Record<string, TabLayout>>({});
  const pillX = useSharedValue(0);
  const pillWidth = useSharedValue(0);
  const pillOpacity = useSharedValue(0);

  const movePill = (layout: TabLayout, animate: boolean) => {
    if (!animate || isReduceMotionEnabled()) {
      pillX.value = layout.x;
      pillWidth.value = layout.width;
      pillOpacity.value = 1;
      return;
    }
    pillX.value = withTiming(layout.x, { duration: PILL_SLIDE_DURATION, easing: Easing.out(Easing.cubic) });
    pillWidth.value = withTiming(layout.width, {
      duration: PILL_SLIDE_DURATION,
      easing: Easing.out(Easing.cubic),
    });
    pillOpacity.value = withTiming(1, { duration: PILL_SLIDE_DURATION });
  };

  const handleTabMeasured = (id: string, layout: TabLayout) => {
    const wasKnown = Boolean(tabLayouts.current[id]);
    tabLayouts.current[id] = layout;
    if (id === activeTabId) {
      movePill(layout, wasKnown);
    }
  };

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: pillWidth.value,
    opacity: pillOpacity.value,
  }));

  return (
    <View style={[styles.container, { borderBottomColor: colors.border, paddingVertical: spacing.xs }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.sm, gap: spacing.xs, alignItems: 'center' }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            pillStyle,
            { height: minTouchTarget, borderRadius: radius.chip, backgroundColor: colors.accent },
          ]}
        />
        {tabs.map((tab) => (
          <TabChip
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={onSelect}
            onClose={onClose}
            onMeasure={handleTabMeasured}
          />
        ))}
        <Pressable
          onPress={onNewTab}
          accessibilityRole="button"
          accessibilityLabel="Open new tab"
          style={({ pressed }) => [
            styles.newTabButton,
            {
              width: minTouchTarget,
              height: minTouchTarget,
              borderRadius: radius.chip,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Icon icon={Plus} size={iconSizes.md} color={colors.ink} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

interface TabChipProps {
  tab: BrowserTab;
  isActive: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onMeasure: (id: string, layout: TabLayout) => void;
}

/** One tab chip: scales in on mount, shrinks to nothing before it's closed. */
function TabChip({ tab, isActive, onSelect, onClose, onMeasure }: TabChipProps) {
  const { colors, spacing, radius, typeScale, maxFontScale, minTouchTarget } = useTheme();

  const reduceMotion = isReduceMotionEnabled();
  const scale = useSharedValue(reduceMotion ? 1 : 0.8);
  const opacity = useSharedValue(1);
  const widthOverride = useSharedValue(-1);
  const measuredWidth = useRef(0);
  const closing = useRef(false);

  useEffect(() => {
    if (reduceMotion) return;
    scale.value = withTiming(1, { duration: CHIP_SCALE_IN_DURATION, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    measuredWidth.current = width;
    onMeasure(tab.id, { x, width });
  };

  const handleClose = () => {
    if (closing.current) return;
    closing.current = true;
    if (reduceMotion) {
      onClose(tab.id);
      return;
    }
    widthOverride.value = measuredWidth.current;
    opacity.value = withTiming(0, { duration: CHIP_CLOSE_DURATION });
    widthOverride.value = withTiming(
      0,
      { duration: CHIP_CLOSE_DURATION, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onClose)(tab.id);
      },
    );
  };

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
    width: widthOverride.value >= 0 ? widthOverride.value : undefined,
  }));

  return (
    <Animated.View style={[styles.tabWrapper, chipStyle]} onLayout={handleLayout}>
      <Pressable
        onPress={() => onSelect(tab.id)}
        accessibilityRole="button"
        accessibilityLabel={`Switch to tab: ${tab.title}`}
        style={[
          styles.tab,
          {
            minHeight: minTouchTarget,
            borderRadius: radius.chip,
            paddingHorizontal: spacing.sm,
            gap: spacing.xs,
            borderColor: isActive ? 'transparent' : colors.border,
          },
        ]}
      >
        <Text
          maxFontSizeMultiplier={maxFontScale}
          numberOfLines={1}
          style={[typeScale.label, { color: isActive ? colors.onAccent : colors.ink, maxWidth: 96 }]}
        >
          {tab.title || 'New tab'}
        </Text>
        <Pressable
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={`Close tab: ${tab.title}`}
          hitSlop={8}
          style={styles.closeButton}
        >
          <Icon icon={X} size={iconSizes.sm} color={isActive ? colors.onAccent : colors.inkSecondary} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  tabWrapper: {
    overflow: 'hidden',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  newTabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
