import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import { monoFontFallback, monoFontFamily, useMonoFont } from './monoFont';

interface CodeBlockProps {
  code: string;
  /** Fence language tag, e.g. "ts" — shown as a small label, no highlighting applied. */
  language?: string;
}

/**
 * Flat, monospace, read-only code block (pig-markdown-rendering: no syntax
 * highlighting). Header shows the language tag (if declared) and a Copy
 * button. Used both for transcript fenced code blocks and, indirectly, by
 * the file viewer's text/code sheet.
 */
export function CodeBlock({ code, language }: CodeBlockProps) {
  const { colors, spacing, radius, typeScale } = useTheme();
  const monoLoaded = useMonoFont();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.neutral[100], borderRadius: radius.chip, borderColor: colors.border }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs }]}>
        <Text
          style={[typeScale.caption, { color: colors.inkSecondary }]}
          maxFontSizeMultiplier={1.3}
        >
          {language || 'text'}
        </Text>
        <Pressable
          onPress={handleCopy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Copied' : 'Copy code'}
          style={styles.copyButton}
        >
          <Icon icon={copied ? Check : Copy} size={16} color={copied ? colors.success : colors.inkSecondary} />
          <Text style={[typeScale.caption, { color: copied ? colors.success : colors.inkSecondary }]} maxFontSizeMultiplier={1.3}>
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ padding: spacing.sm }}>
        <Text
          selectable
          style={[
            styles.code,
            {
              color: colors.ink,
              fontFamily: monoLoaded ? monoFontFamily.regular : monoFontFallback,
            },
          ]}
          maxFontSizeMultiplier={1.3}
        >
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
  },
  code: {
    fontSize: 13,
    lineHeight: 19,
  },
});
