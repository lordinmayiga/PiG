import { Plus, X } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme';
import { Icon, iconSizes } from '../theme/icons';
import type { BrowserTab } from '../fixtures/browser';

interface TabStripProps {
  tabs: BrowserTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
}

/** Horizontal strip of open browser tabs, for BrowserScreen (SPEC.md §9). */
export function TabStrip({ tabs, activeTabId, onSelect, onClose, onNewTab }: TabStripProps) {
  const { colors, spacing, radius, typeScale, maxFontScale, minTouchTarget } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: colors.border, paddingVertical: spacing.xs }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.sm, gap: spacing.xs, alignItems: 'center' }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onSelect(tab.id)}
              accessibilityRole="button"
              accessibilityLabel={`Switch to tab: ${tab.title}`}
              style={({ pressed }) => [
                styles.tab,
                {
                  minHeight: minTouchTarget,
                  borderRadius: radius.chip,
                  paddingHorizontal: spacing.sm,
                  gap: spacing.xs,
                  backgroundColor: isActive ? colors.accent : colors.card,
                  borderColor: isActive ? colors.accent : colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text
                maxFontSizeMultiplier={maxFontScale}
                numberOfLines={1}
                style={[
                  typeScale.label,
                  { color: isActive ? colors.onAccent : colors.ink, maxWidth: 96 },
                ]}
              >
                {tab.title || 'New tab'}
              </Text>
              <Pressable
                onPress={() => onClose(tab.id)}
                accessibilityRole="button"
                accessibilityLabel={`Close tab: ${tab.title}`}
                hitSlop={8}
                style={styles.closeButton}
              >
                <Icon icon={X} size={iconSizes.sm} color={isActive ? colors.onAccent : colors.inkSecondary} />
              </Pressable>
            </Pressable>
          );
        })}
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

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
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
