import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Brain, ChevronDown } from 'lucide-react-native';

import { useTheme } from '../theme';
import { useStatusDotPulse, isReduceMotionEnabled } from '../theme/motion';
import { tokenizeThoughtLine } from '../utils/thoughtHighlight';
import { monoFontFallback, monoFontFamily, useMonoFont } from './monoFont';

const LINE_HEIGHT = 22;
const MAX_VISIBLE_STREAM_LINES = 7;

interface ThinkingAccordionProps {
  /** Complete or streaming thought text */
  thinking?: string;
  /** True while the turn is actively streaming thoughts/answer */
  isStreaming?: boolean;
  /** True once non-thinking answer content has begun streaming */
  hasAnswerContent?: boolean;
}

export function ThinkingAccordion({
  thinking = '',
  isStreaming = false,
  hasAnswerContent = false,
}: ThinkingAccordionProps) {
  const { colors, spacing, radius, typeScale } = useTheme();
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number>(0);

  // Split thinking text into lines
  const allLines = useMemo(() => {
    if (!thinking.trim()) return [];
    return thinking
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }, [thinking]);

  const numLines = allLines.length;

  // Track elapsed time while streaming
  useEffect(() => {
    if (isStreaming && !hasAnswerContent) {
      startTimeRef.current = Date.now();
      const interval = setInterval(() => {
        setElapsedSeconds((Date.now() - startTimeRef.current) / 1000);
      }, 200);
      return () => clearInterval(interval);
    }
  }, [isStreaming, hasAnswerContent]);

  // Auto-expand during thought-only streaming, auto-collapse when answer content begins
  const isAutoStreaming = isStreaming && !hasAnswerContent;
  const isExpanded = userExpanded !== null ? userExpanded : isAutoStreaming;

  // Height animation for dynamic growth from 1 to 7 lines (during streaming)
  const targetHeight = useMemo(() => {
    if (!isExpanded) return 0;
    if (isAutoStreaming) {
      const visibleCount = Math.max(1, Math.min(numLines, MAX_VISIBLE_STREAM_LINES));
      return visibleCount * LINE_HEIGHT + 12;
    }
    // Full expanded history: fit content or max 260px scrollable
    return Math.min(Math.max(1, numLines) * LINE_HEIGHT + 16, 260);
  }, [isExpanded, isAutoStreaming, numLines]);

  const heightAnim = useSharedValue(isAutoStreaming ? LINE_HEIGHT + 12 : 0);
  const chevronRotation = useSharedValue(isExpanded ? 1 : 0);

  useEffect(() => {
    if (isReduceMotionEnabled()) {
      heightAnim.value = targetHeight;
      chevronRotation.value = isExpanded ? 1 : 0;
      return;
    }
    heightAnim.value = withTiming(targetHeight, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
    chevronRotation.value = withTiming(isExpanded ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [targetHeight, isExpanded, heightAnim, chevronRotation]);

  const animatedBodyStyle = useAnimatedStyle(() => ({
    maxHeight: heightAnim.value,
    opacity: heightAnim.value > 2 ? 1 : 0,
  }));

  const animatedChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value * 180}deg` }],
  }));

  // Status dot pulsing during streaming
  const pulseOpacity = useStatusDotPulse(isAutoStreaming);
  const dotPulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  if (!thinking.trim() && !isAutoStreaming) {
    return null;
  }

  // Active lines to show during streaming (teleprompter rolling 7 lines)
  const displayLines = isAutoStreaming
    ? allLines.slice(-MAX_VISIBLE_STREAM_LINES)
    : allLines;

  const headerTitle = isAutoStreaming
    ? `Thinking… (${elapsedSeconds.toFixed(1)}s)`
    : elapsedSeconds > 0
    ? `Thought for ${elapsedSeconds.toFixed(1)}s`
    : 'Thought process';

  return (
    <View
      testID="thinking-accordion"
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: isAutoStreaming ? colors.accent : colors.border,
          borderRadius: radius.card,
        },
        isAutoStreaming && {
          shadowColor: colors.accent,
          shadowOpacity: 0.12,
          shadowRadius: 6,
          elevation: 2,
        },
      ]}
    >
      <Pressable
        testID="thinking-header"
        onPress={() => setUserExpanded((prev) => (prev !== null ? !prev : !isExpanded))}
        style={[styles.header, { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm }]}
        accessibilityRole="button"
        accessibilityLabel={headerTitle}
      >
        <View style={styles.headerLeft}>
          <Brain size={16} color={isAutoStreaming ? colors.accent : colors.inkSecondary} />
          {isAutoStreaming ? (
            <Animated.View
              testID="thinking-pulse-dot"
              style={[styles.pulseDot, { backgroundColor: colors.accent }, dotPulseStyle]}
            />
          ) : null}
          <Text
            testID="thinking-title"
            style={[typeScale.label, { color: colors.inkSecondary, fontWeight: '500' }]}
          >
            {headerTitle}
          </Text>
        </View>
        <Animated.View style={animatedChevronStyle}>
          <ChevronDown size={16} color={colors.inkSecondary} />
        </Animated.View>
      </Pressable>

      <Animated.View
        testID="thinking-body"
        style={[
          styles.body,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            borderLeftColor: colors.accent,
          },
          animatedBodyStyle,
        ]}
      >
        {isAutoStreaming ? (
          <View testID="thinking-lines-container" style={styles.linesContainer}>
            {displayLines.map((line, idx) => (
              <ThoughtLine key={`stream-line-${idx}-${line.slice(0, 10)}`} line={line} />
            ))}
          </View>
        ) : (
          <ScrollView
            testID="thinking-scroll-view"
            style={styles.fullScrollView}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
            {allLines.map((line, idx) => (
              <ThoughtLine key={`full-line-${idx}`} line={line} />
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

function ThoughtLine({ line }: { line: string }) {
  const { colors, typeScale } = useTheme();
  const monoLoaded = useMonoFont();
  const segments = useMemo(() => tokenizeThoughtLine(line), [line]);

  return (
    <View style={styles.thoughtLineRow}>
      <Text style={[typeScale.caption, styles.thoughtLineText]} numberOfLines={2}>
        {segments.map((seg, i) => {
          switch (seg.type) {
            case 'keyword':
              return (
                <Text
                  key={i}
                  style={{ color: colors.ink, fontWeight: '600' }}
                >
                  {seg.text}
                </Text>
              );
            case 'path':
              // Highlighted by color/pill, not font — a bare path mentioned
              // in a thought line isn't a code block, inline `code` span, or
              // the file viewer, so pig-typography's Roboto-Mono scope
              // doesn't cover it. Distinguish it with color instead.
              return (
                <Text
                  key={i}
                  style={{
                    color: colors.accent,
                    backgroundColor: colors.accentTint,
                  }}
                >
                  {` ${seg.text} `}
                </Text>
              );
            case 'number':
              // Same reasoning as 'path' above — a duration/count in prose
              // isn't a code context, so it stays in the UI typeface.
              return (
                <Text
                  key={i}
                  style={{
                    color: colors.warning,
                    fontWeight: '500',
                  }}
                >
                  {seg.text}
                </Text>
              );
            case 'code':
              // This one IS a genuine inline `code` span (backtick-delimited
              // identifier), which pig-typography does scope Roboto Mono to —
              // use the app's real mono loader, not a raw system fallback.
              return (
                <Text
                  key={i}
                  style={{
                    color: colors.ink,
                    backgroundColor: colors.canvas,
                    fontFamily: monoLoaded ? monoFontFamily.regular : monoFontFallback,
                  }}
                >
                  {` ${seg.text} `}
                </Text>
              );
            default:
              return (
                <Text key={i} style={{ color: colors.inkSecondary }}>
                  {seg.text}
                </Text>
              );
          }
        })}
      </Text>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  body: {
    borderTopWidth: 1,
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  linesContainer: {
    flexDirection: 'column',
    gap: 2,
  },
  fullScrollView: {
    maxHeight: 240,
  },
  thoughtLineRow: {
    minHeight: LINE_HEIGHT,
    justifyContent: 'center',
  },
  thoughtLineText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
