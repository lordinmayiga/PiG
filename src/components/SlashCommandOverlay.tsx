import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  Activity,
  BarChart2,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Cpu,
  Minimize2,
  RotateCcw,
  Search,
  X,
  Zap,
} from 'lucide-react-native';

import { useTheme } from '../theme';
import { isReduceMotionEnabled } from '../theme/motion';
import { useBridge } from '../contexts/BridgeContext';
import type { ModelInfo, SlashCommandItem, TokenUsage } from '../types';

const SHEET_SPRING = { damping: 20, stiffness: 140, mass: 0.8 };

export interface SlashCommandOverlayProps {
  visible: boolean;
  onClose: () => void;
  sessionId?: string;
  onSelectCommand?: (cmd: SlashCommandItem) => void;
  onSelectModel?: (model: ModelInfo) => void;
  initialView?: 'commands' | 'models' | 'usage';
}

const PRELOADED_COMMANDS: SlashCommandItem[] = [
  { name: '/model', description: 'Choose active AI model & reasoning', badge: 'Gemini 3.8 Flash' },
  { name: '/usage', description: 'Session token counts & context breakdown' },
  { name: '/cost', description: 'View estimated session cost' },
  { name: '/compact', description: 'Truncate older context to save tokens' },
  { name: '/clear', description: 'Reset conversation history' },
  { name: '/doctor', description: 'Run bridge and tmux diagnostics' },
];

export function SlashCommandOverlay({
  visible,
  onClose,
  sessionId,
  onSelectCommand,
  onSelectModel,
  initialView = 'commands',
}: SlashCommandOverlayProps) {
  const { colors, spacing, radius, typeScale } = useTheme();
  const { client } = useBridge();

  const [currentView, setCurrentView] = useState<'commands' | 'models' | 'usage'>(initialView);
  const [searchQuery, setSearchQuery] = useState('');
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setCurrentView(initialView);
      setSearchQuery('');
    }
  }

  const [modelsList, setModelsList] = useState<ModelInfo[]>([
    { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)', badge: 'Low' },
    { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash (Medium)', badge: 'Medium' },
    { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', badge: 'High' },
    { id: 'gemini-3.7-flash-low', name: 'Gemini 3.7 Flash (Low)', badge: 'Low' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)', badge: 'Thinking' },
  ]);
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-3.8-flash-low');
  const [sessionUsage, setSessionUsage] = useState<TokenUsage>({
    inputTokens: 13890,
    outputTokens: 720,
    thinkingTokens: 840,
    cacheReadTokens: 11200,
    totalTokens: 26650,
  });

  const translateY = useSharedValue(600);
  const scrimOpacity = useSharedValue(0);

  // Sync open/close animation
  useEffect(() => {
    if (visible) {
      if (isReduceMotionEnabled()) {
        translateY.value = 0;
        scrimOpacity.value = 1;
      } else {
        translateY.value = withSpring(0, SHEET_SPRING);
        scrimOpacity.value = withTiming(1, { duration: 180 });
      }
    } else {
      if (isReduceMotionEnabled()) {
        translateY.value = 600;
        scrimOpacity.value = 0;
      } else {
        translateY.value = withTiming(600, { duration: 160 });
        scrimOpacity.value = withTiming(0, { duration: 160 });
      }
    }
  }, [visible, initialView, translateY, scrimOpacity]);

  // Tier 2: Debounced WebSocket sync (150ms)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLiveCommandData = useCallback(
    async (query: string) => {
      if (!client || !visible) return;
      try {
        const result = await client.searchCommands(query, sessionId);
        if (result.models && Array.isArray(result.models) && result.models.length > 0) {
          setModelsList(result.models);
        }
        if (result.usage) {
          setSessionUsage(result.usage);
        }
      } catch (err) {
        console.error('[SlashCommandOverlay] bridge searchCommands failed:', err);
      }
    },
    [client, sessionId, visible],
  );

  // Listen for bridge responses
  useEffect(() => {
    if (!client) return;
    const unsub = client.onCommandSearchResult((payload) => {
      if (payload.models && Array.isArray(payload.models) && payload.models.length > 0) {
        setModelsList(payload.models);
      }
      if (payload.usage) {
        setSessionUsage(payload.usage);
      }
    });
    return () => unsub();
  }, [client]);

  // Handle search input changes (Tier 1 instant, Tier 2 debounced)
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchLiveCommandData(text);
    }, 150);
  };

  // Tier 1 instant in-memory filter
  const filteredCommands = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return PRELOADED_COMMANDS;
    return PRELOADED_COMMANDS.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const filteredModels = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return modelsList;
    return modelsList.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
  }, [searchQuery, modelsList]);

  const handleCommandPress = (cmd: SlashCommandItem) => {
    if (cmd.name === '/model') {
      setSearchQuery('');
      setCurrentView('models');
      fetchLiveCommandData('model');
      return;
    }
    if (cmd.name === '/usage') {
      setSearchQuery('');
      setCurrentView('usage');
      fetchLiveCommandData('usage');
      return;
    }
    onSelectCommand?.(cmd);
    onClose();
  };

  const handleModelPress = (model: ModelInfo) => {
    setSelectedModelId(model.id);
    if (client && sessionId) {
      client
        .setSessionModel(sessionId, model.id, model.badge?.toLowerCase() ?? 'low')
        .catch((err) => {
          console.error('[SlashCommandOverlay] set_session_model failed:', err);
        });
    }
    onSelectModel?.(model);
    onClose();
  };

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const scrimAnimatedStyle = useAnimatedStyle(() => ({
    opacity: scrimOpacity.value,
  }));

  if (!visible) return null;

  const renderIcon = (name: string) => {
    switch (name) {
      case '/model':
        return <Cpu size={18} color={colors.accent} />;
      case '/usage':
        return <BarChart2 size={18} color={colors.accent} />;
      case '/cost':
        return <Coins size={18} color={colors.accent} />;
      case '/compact':
        return <Minimize2 size={18} color={colors.accent} />;
      case '/clear':
        return <RotateCcw size={18} color={colors.accent} />;
      case '/doctor':
        return <Activity size={18} color={colors.accent} />;
      default:
        return <Zap size={18} color={colors.accent} />;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        {/* Scrim Backdrop */}
        <Animated.View
          style={[styles.scrim, { backgroundColor: colors.scrim }, scrimAnimatedStyle]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="slash-overlay-backdrop" />
        </Animated.View>

        {/* Elevated Sheet */}
        <Animated.View
          testID="slash-command-sheet"
          style={[
            styles.sheet,
            {
              backgroundColor: colors.elevated,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
              borderColor: colors.border,
            },
            sheetAnimatedStyle,
          ]}
        >
          {/* Sheet Handle */}
          <View style={[styles.handle, { backgroundColor: colors.neutral[300] }]} />

          {/* Header */}
          <View style={[styles.header, { paddingHorizontal: spacing.sm }]}>
            {currentView !== 'commands' ? (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  setCurrentView('commands');
                }}
                style={styles.backButton}
                accessibilityRole="button"
                accessibilityLabel="Back to commands"
                hitSlop={8}
              >
                <ChevronLeft size={20} color={colors.ink} />
              </Pressable>
            ) : null}

            <Text
              testID="slash-sheet-title"
              style={[typeScale.subheading, { color: colors.ink, flex: 1 }]}
            >
              {currentView === 'commands'
                ? 'Commands & Tools'
                : currentView === 'models'
                ? 'Choose AI Model'
                : 'Session Usage'}
            </Text>

            <Pressable
              testID="slash-close-btn"
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: colors.card }]}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <X size={16} color={colors.inkSecondary} />
            </Pressable>
          </View>

          {/* Search bar (for commands and models) */}
          {currentView !== 'usage' ? (
            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: radius.card,
                },
              ]}
            >
              <Search size={16} color={colors.inkSecondary} />
              <TextInput
                testID="slash-search-input"
                value={searchQuery}
                onChangeText={handleSearchChange}
                placeholder={currentView === 'models' ? 'Search models…' : 'Search commands or choose below…'}
                placeholderTextColor={colors.inkPlaceholder}
                style={[typeScale.body, styles.searchInput, { color: colors.ink }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ) : null}

          {/* Content Lists */}
          <ScrollView
            testID="slash-content-scroll"
            style={styles.scrollList}
            contentContainerStyle={{ paddingBottom: spacing.lg }}
            keyboardShouldPersistTaps="handled"
          >
            {/* View 1: Commands List */}
            {currentView === 'commands' ? (
              <View testID="commands-list" style={styles.listContainer}>
                {filteredCommands.map((cmd) => (
                  <Pressable
                    key={cmd.name}
                    testID={`command-item-${cmd.name.replace('/', '')}`}
                    onPress={() => handleCommandPress(cmd)}
                    style={({ pressed }) => [
                      styles.itemCard,
                      {
                        backgroundColor: pressed ? colors.neutral[100] : colors.card,
                        borderColor: colors.border,
                        borderRadius: radius.card,
                      },
                    ]}
                  >
                    <View style={styles.itemLeft}>
                      <View style={[styles.iconWrap, { backgroundColor: colors.card }]}>
                        {renderIcon(cmd.name)}
                      </View>
                      <View style={styles.itemTextWrap}>
                        <Text
                          style={[typeScale.label, { color: colors.ink, fontWeight: '600' }]}
                        >
                          {cmd.name}
                        </Text>
                        <Text style={[typeScale.caption, { color: colors.inkSecondary }]}>
                          {cmd.description}
                        </Text>
                      </View>
                    </View>
                    {cmd.badge ? (
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: colors.card, borderRadius: radius.pill },
                        ]}
                      >
                        <Text style={[typeScale.caption, { color: colors.inkSecondary, fontSize: 11 }]}>
                          {cmd.badge}
                        </Text>
                      </View>
                    ) : (
                      <ChevronRight size={16} color={colors.inkSecondary} />
                    )}
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* View 2: Model Picker */}
            {currentView === 'models' ? (
              <View testID="model-picker-list" style={styles.listContainer}>
                {filteredModels.map((model) => {
                  const isSelected = selectedModelId === model.id;
                  return (
                    <Pressable
                      key={model.id}
                      testID={`model-item-${model.id}`}
                      onPress={() => handleModelPress(model)}
                      style={({ pressed }) => [
                        styles.itemCard,
                        {
                          backgroundColor: isSelected
                            ? colors.accentTint
                            : pressed
                            ? colors.neutral[100]
                            : colors.card,
                          borderColor: isSelected ? colors.accent : colors.border,
                          borderRadius: radius.card,
                        },
                      ]}
                    >
                      <View style={styles.itemLeft}>
                        <View
                          style={[
                            styles.iconWrap,
                            {
                              backgroundColor: isSelected ? colors.accentTint : colors.card,
                            },
                          ]}
                        >
                          <Cpu size={18} color={isSelected ? colors.accent : colors.inkSecondary} />
                        </View>
                        <View style={styles.itemTextWrap}>
                          <Text style={[typeScale.label, { color: colors.ink, fontWeight: '600' }]}>
                            {model.name}
                          </Text>
                          <Text style={[typeScale.caption, { color: colors.inkSecondary }]}>
                            {model.description ?? model.id}
                          </Text>
                        </View>
                      </View>
                      {isSelected ? (
                        <Check size={18} color={colors.accent} />
                      ) : model.badge ? (
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: colors.card, borderRadius: radius.pill },
                          ]}
                        >
                          <Text style={[typeScale.caption, { color: colors.inkSecondary, fontSize: 11 }]}>
                            {model.badge}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* View 3: Usage Breakdown Card */}
            {currentView === 'usage' ? (
              <View testID="usage-view-list" style={styles.usageContainer}>
                <View
                  style={[
                    styles.usageCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      borderRadius: radius.card,
                    },
                  ]}
                >
                  <UsageRow
                    label="Input Tokens"
                    value={`${sessionUsage.inputTokens.toLocaleString()} tokens`}
                  />
                  <UsageRow
                    label="Thinking Tokens"
                    value={`${sessionUsage.thinkingTokens.toLocaleString()} tokens`}
                    highlight={colors.accent}
                  />
                  <UsageRow
                    label="Output Tokens"
                    value={`${sessionUsage.outputTokens.toLocaleString()} tokens`}
                  />
                  <UsageRow
                    label="Cache Read Tokens"
                    value={`${sessionUsage.cacheReadTokens.toLocaleString()} tokens`}
                    subtext="80% saved via cache"
                  />
                  <View style={[styles.usageDivider, { backgroundColor: colors.border }]} />
                  <UsageRow
                    label="Total Tokens"
                    value={`${sessionUsage.totalTokens.toLocaleString()} tokens`}
                    isBold
                  />
                </View>
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function UsageRow({
  label,
  value,
  subtext,
  highlight,
  isBold = false,
}: {
  label: string;
  value: string;
  subtext?: string;
  highlight?: string;
  isBold?: boolean;
}) {
  const { colors, typeScale } = useTheme();
  return (
    <View style={styles.usageRow}>
      <Text
        style={[
          typeScale.label,
          { color: colors.inkSecondary, fontWeight: isBold ? '600' : '400' },
        ]}
      >
        {label}
      </Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={[
            typeScale.label,
            {
              color: highlight || colors.ink,
              fontWeight: isBold ? '700' : '500',
            },
          ]}
        >
          {value}
        </Text>
        {subtext ? (
          <Text style={[typeScale.caption, { color: colors.inkSecondary, fontSize: 11 }]}>
            {subtext}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    maxHeight: '82%',
    paddingTop: 8,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 8,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 4,
  },
  scrollList: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  listContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemTextWrap: {
    flex: 1,
    gap: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  usageContainer: {
    paddingVertical: 8,
  },
  usageCard: {
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  usageDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
});
