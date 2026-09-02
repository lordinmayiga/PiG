import { Fragment, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { useTheme, type TextStyleToken } from '../theme';
import { CodeBlock } from './CodeBlock';
import { monoFontFallback, monoFontFamily, useMonoFont } from './monoFont';

// Hand-rolled minimal markdown renderer, not a library. Decision: PiG's
// markdown surface is deliberately small — headings, bold/italic, inline
// code, links, lists, blockquotes, blank-line paragraphs, and fenced code
// blocks (pig-markdown-rendering) — with a very specific code-block chrome
// (Copy button, language label, flat monospace, no highlighting). The
// closest maintained library (react-native-markdown-display) hasn't shipped
// since 2023 and would still need every block renderer overridden to match
// these rules, so a ~100-line parser scoped to exactly this subset is less
// risk than an unmaintained dependency on RN 0.86 / React 19 / new arch.
// Not a general CommonMark implementation — nested lists, tables, and
// multi-paragraph list items aren't supported; agent turns don't need them.

type Block =
  | { type: 'code'; code: string; language?: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'paragraph'; text: string };

const FENCE_RE = /```(\w*)\n([\s\S]*?)```/g;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const QUOTE_RE = /^>\s?/;
const BULLET_RE = /^[-*]\s+/;
const ORDERED_RE = /^\d+\.\s+/;

function parseTextBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoteLines.push(lines[i].replace(QUOTE_RE, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join(' ') });
      continue;
    }

    if (BULLET_RE.test(line) || ORDERED_RE.test(line)) {
      const ordered = ORDERED_RE.test(line);
      const items: string[] = [];
      const itemRe = ordered ? ORDERED_RE : BULLET_RE;
      while (i < lines.length && itemRe.test(lines[i])) {
        items.push(lines[i].replace(itemRe, ''));
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !HEADING_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !BULLET_RE.test(lines[i]) &&
      !ORDERED_RE.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
  }

  return blocks;
}

function parseMarkdown(content: string): Block[] {
  const blocks: Block[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(content))) {
    blocks.push(...parseTextBlocks(content.slice(lastIndex, match.index)));
    blocks.push({ type: 'code', language: match[1] || undefined, code: match[2].replace(/\n$/, '') });
    lastIndex = FENCE_RE.lastIndex;
  }
  blocks.push(...parseTextBlocks(content.slice(lastIndex)));

  return blocks;
}

const INLINE_RE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*([^*]+)\*|_([^_]+)_/g;

interface InlineOpts {
  keyPrefix: string;
  style: TextStyleToken;
  color: string;
  accentColor: string;
  codeBg: string;
  monoLoaded: boolean;
}

function renderInline(text: string, opts: InlineOpts): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  INLINE_RE.lastIndex = 0;

  while ((match = INLINE_RE.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`${opts.keyPrefix}-t${n++}`}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    const [, bold, code, linkText, linkUrl, italicStar, italicUnderscore] = match;
    if (bold !== undefined) {
      nodes.push(
        <Text key={`${opts.keyPrefix}-b${n++}`} style={{ fontFamily: opts.style.fontFamily, fontWeight: '600' }}>
          {bold}
        </Text>,
      );
    } else if (code !== undefined) {
      nodes.push(
        <Text
          key={`${opts.keyPrefix}-c${n++}`}
          style={{
            fontFamily: opts.monoLoaded ? monoFontFamily.regular : monoFontFallback,
            fontSize: opts.style.fontSize - 1,
            backgroundColor: opts.codeBg,
          }}
        >
          {' '}
          {code}{' '}
        </Text>,
      );
    } else if (linkText !== undefined) {
      nodes.push(
        <Text
          key={`${opts.keyPrefix}-l${n++}`}
          style={{ color: opts.accentColor, textDecorationLine: 'underline' }}
          onPress={() => {
            Linking.openURL(linkUrl).catch(() => {});
          }}
        >
          {linkText}
        </Text>,
      );
    } else if (italicStar !== undefined || italicUnderscore !== undefined) {
      nodes.push(
        <Text key={`${opts.keyPrefix}-i${n++}`} style={{ fontStyle: 'italic' }}>
          {italicStar ?? italicUnderscore}
        </Text>,
      );
    }
    lastIndex = INLINE_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`${opts.keyPrefix}-t${n++}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return nodes;
}

const HEADING_ROLE: Record<number, 'heading' | 'subheading' | 'bodyMedium'> = {
  1: 'heading',
  2: 'subheading',
  3: 'bodyMedium',
};

interface MarkdownBodyProps {
  content: string;
}

/** Renders agent-turn markdown per pig-markdown-rendering: rich for agent turns only. */
export function MarkdownBody({ content }: MarkdownBodyProps) {
  const { colors, typeScale, spacing } = useTheme();
  const monoLoaded = useMonoFont();
  const blocks = parseMarkdown(content);

  return (
    <View style={{ gap: spacing.sm }}>
      {blocks.map((block, i) => {
        const key = `block-${i}`;
        if (block.type === 'code') {
          return <CodeBlock key={key} code={block.code} language={block.language} />;
        }
        if (block.type === 'heading') {
          const role = HEADING_ROLE[Math.min(block.level, 3)] ?? 'bodyMedium';
          return (
            <Text key={key} style={[typeScale[role], { color: colors.ink }]} maxFontSizeMultiplier={1.3}>
              {renderInline(block.text, {
                keyPrefix: key,
                style: typeScale[role],
                color: colors.ink,
                accentColor: colors.accent,
                codeBg: colors.card,
                monoLoaded,
              })}
            </Text>
          );
        }
        if (block.type === 'blockquote') {
          return (
            <View
              key={key}
              style={[styles.blockquote, { borderLeftColor: colors.border, paddingLeft: spacing.sm }]}
            >
              <Text style={[typeScale.body, { color: colors.inkSecondary, fontStyle: 'italic' }]} maxFontSizeMultiplier={1.3}>
                {renderInline(block.text, {
                  keyPrefix: key,
                  style: typeScale.body,
                  color: colors.inkSecondary,
                  accentColor: colors.accent,
                  codeBg: colors.card,
                  monoLoaded,
                })}
              </Text>
            </View>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={key} style={{ gap: spacing.xxs }}>
              {block.items.map((item, itemIndex) => (
                <View key={`${key}-${itemIndex}`} style={styles.listRow}>
                  <Text style={[typeScale.body, { color: colors.ink, width: 20 }]} maxFontSizeMultiplier={1.3}>
                    {block.ordered ? `${itemIndex + 1}.` : '•'}
                  </Text>
                  <Text style={[typeScale.body, { color: colors.ink, flex: 1 }]} maxFontSizeMultiplier={1.3}>
                    {renderInline(item, {
                      keyPrefix: `${key}-${itemIndex}`,
                      style: typeScale.body,
                      color: colors.ink,
                      accentColor: colors.accent,
                      codeBg: colors.card,
                      monoLoaded,
                    })}
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={key} style={[typeScale.body, { color: colors.ink }]} maxFontSizeMultiplier={1.3}>
            {renderInline(block.text, {
              keyPrefix: key,
              style: typeScale.body,
              color: colors.ink,
              accentColor: colors.accent,
              codeBg: colors.card,
              monoLoaded,
            })}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  blockquote: {
    borderLeftWidth: 3,
  },
  listRow: {
    flexDirection: 'row',
  },
});
