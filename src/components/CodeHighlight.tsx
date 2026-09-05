import { Text } from 'react-native';

import { useTheme } from '../theme';
import { monoFontFallback, monoFontFamily, useMonoFont } from './monoFont';

/**
 * Minimal syntax highlighting for the file-viewer's code display
 * (pig-markdown-rendering: scoped to the file/text viewer only — chat's
 * fenced code blocks in CodeBlock.tsx stay flat/unhighlighted, unchanged).
 * Hand-rolled, same spirit as MarkdownBody's parser: three token classes
 * only (comment, string, keyword), everything else stays the default ink
 * color. Not a real lexer — good enough to make a code file scannable,
 * not a claim of 100% correctness for every language edge case.
 */
export type CodeLanguage = 'js' | 'py' | 'html' | 'css';

const EXT_TO_LANGUAGE: Record<string, CodeLanguage> = {
  js: 'js',
  jsx: 'js',
  ts: 'js',
  tsx: 'js',
  mjs: 'js',
  cjs: 'js',
  py: 'py',
  html: 'html',
  htm: 'html',
  css: 'css',
};

/** Maps a filename's extension to a supported highlight language, or undefined (render flat). */
export function languageForFilename(name: string): CodeLanguage | undefined {
  const ext = name.toLowerCase().split('.').pop();
  return ext ? EXT_TO_LANGUAGE[ext] : undefined;
}

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
  'case', 'default', 'break', 'continue', 'class', 'extends', 'new', 'this', 'import', 'export',
  'from', 'as', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in',
  'of', 'null', 'undefined', 'true', 'false', 'void', 'yield', 'static', 'get', 'set', 'super',
  'interface', 'type', 'enum', 'implements', 'public', 'private', 'protected', 'readonly',
  'namespace', 'declare',
]);

const PY_KEYWORDS = new Set([
  'def', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'class', 'import',
  'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'pass', 'lambda', 'yield', 'async',
  'await', 'None', 'True', 'False', 'and', 'or', 'not', 'in', 'is', 'global', 'nonlocal', 'del',
  'assert',
]);

/** One combined regex per language matches comments and strings in one pass (mutually exclusive spans); whatever's left over gets word-tokenized for keywords/tags. */
const COMMENT_OR_STRING_RE: Record<CodeLanguage, RegExp> = {
  js: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g,
  py: /#[^\n]*|'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g,
  html: /<!--[\s\S]*?-->|'[^'\n]*'|"[^"\n]*"/g,
  css: /\/\*[\s\S]*?\*\/|'[^'\n]*'|"[^"\n]*"/g,
};

function isCommentMatch(text: string): boolean {
  return text.startsWith('//') || text.startsWith('#') || text.startsWith('/*') || text.startsWith('<!--');
}

/** Regex used to tokenize whatever's left after comments/strings are stripped out — language-specific, so identifiers/keywords or (for HTML) tag delimiters get picked out. Absent for CSS: v1 only highlights its comments/strings, not selectors/properties. */
const WORD_RE: Partial<Record<CodeLanguage, RegExp>> = {
  js: /[A-Za-z_$][\w$]*/g,
  py: /[A-Za-z_][\w]*/g,
  html: /<\/?[a-zA-Z][\w:-]*|\/?>/g,
};

const KEYWORD_SETS: Partial<Record<CodeLanguage, Set<string>>> = {
  js: JS_KEYWORDS,
  py: PY_KEYWORDS,
  // html has no keyword set — every WORD_RE match (a tag delimiter) counts as a "keyword" token.
};

export type TokenKind = 'comment' | 'string' | 'keyword' | 'plain';
export interface CodeToken {
  text: string;
  kind: TokenKind;
}

function tokenizePlainSegment(segment: string, language: CodeLanguage, tokens: CodeToken[]): void {
  const wordRe = WORD_RE[language];
  if (!wordRe) {
    tokens.push({ text: segment, kind: 'plain' });
    return;
  }
  const keywords = KEYWORD_SETS[language];
  wordRe.lastIndex = 0;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(segment))) {
    if (m.index > idx) tokens.push({ text: segment.slice(idx, m.index), kind: 'plain' });
    const isKeyword = keywords ? keywords.has(m[0]) : true;
    tokens.push({ text: m[0], kind: isKeyword ? 'keyword' : 'plain' });
    idx = wordRe.lastIndex;
  }
  if (idx < segment.length) tokens.push({ text: segment.slice(idx), kind: 'plain' });
}

export function tokenizeCode(code: string, language: CodeLanguage): CodeToken[] {
  const tokens: CodeToken[] = [];
  const re = COMMENT_OR_STRING_RE[language];
  re.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code))) {
    tokenizePlainSegment(code.slice(lastIndex, match.index), language, tokens);
    tokens.push({ text: match[0], kind: isCommentMatch(match[0]) ? 'comment' : 'string' });
    lastIndex = re.lastIndex;
  }
  tokenizePlainSegment(code.slice(lastIndex), language, tokens);
  return tokens;
}

interface CodeHighlightProps {
  code: string;
  language: CodeLanguage;
}

/** Highlighted, read-only, monospace code display — file viewer only (see module doc above). */
export function CodeHighlight({ code, language }: CodeHighlightProps) {
  const { colors } = useTheme();
  const monoLoaded = useMonoFont();
  const tokens = tokenizeCode(code, language);

  const colorFor = (kind: TokenKind): string => {
    switch (kind) {
      case 'comment':
        return colors.inkSecondary;
      case 'string':
        return colors.syntaxString;
      case 'keyword':
        return colors.accent;
      default:
        return colors.ink;
    }
  };

  return (
    <Text
      selectable
      style={{ fontFamily: monoLoaded ? monoFontFamily.regular : monoFontFallback, fontSize: 13, lineHeight: 19 }}
      maxFontSizeMultiplier={1.3}
    >
      {tokens.map((token, i) => (
        <Text key={i} style={{ color: colorFor(token.kind) }}>
          {token.text}
        </Text>
      ))}
    </Text>
  );
}
