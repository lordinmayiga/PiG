/**
 * Classifies a markdown link target as a local file reference (should open
 * PiG's in-app FileViewerSheet) vs. a real external URL (should open via
 * Linking.openURL). Confirmed live (AGENT_ACTIONS_STREAM_PLAN.md §0) that
 * agent replies really do contain `file://` links with a `#L<n>` line
 * anchor (e.g. `file:///root/projects/PiG/package.json#L2`), as well as
 * bare relative paths (the convention FileAttachmentChip already uses).
 */

export interface FileLinkInfo {
  isFileLink: boolean;
  /** Filesystem path (scheme/anchor stripped), when isFileLink is true. Otherwise the original URL, unchanged. */
  path: string;
  /** 1-based line number from a `#L<n>` anchor, if present. */
  line?: number;
}

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const FILE_URI_RE = /^file:\/\/(\/[^\s#]*)(?:#L(\d+))?/;

export function classifyLink(url: string): FileLinkInfo {
  const fileMatch = FILE_URI_RE.exec(url);
  if (fileMatch) {
    return { isFileLink: true, path: fileMatch[1], line: fileMatch[2] ? Number(fileMatch[2]) : undefined };
  }
  // No URI scheme at all (and not protocol-relative, `//host/...`) means
  // it's a bare relative/absolute filesystem path, e.g. `analysis_summary.md`
  // or `backend/src/server.ts` — the same convention agent-surfaced
  // attachment chips already use.
  if (!SCHEME_RE.test(url) && !url.startsWith('//')) {
    return { isFileLink: true, path: url };
  }
  return { isFileLink: false, path: url };
}

/**
 * Extensions recognized when auto-detecting a bare filename mention in plain
 * agent prose (no markdown `[text](path)` brackets), e.g. "I edited
 * src/App.tsx". Deliberately scoped to code/doc/config files an agent would
 * plausibly reference — not a general "anything with a dot" matcher.
 */
const BARE_PATH_EXTENSIONS =
  'tsx?|jsx?|mjs|cjs|py|md|markdown|json|css|scss|less|html?|ya?ml|txt|sh|bash|go|rs|java|kt|rb|c|cc|cpp|h|hpp|swift|xml|csv|sql|toml|ini|conf|log';

/** Matches a bare path/filename token: optional `dir/` segments, a basename, one of the extensions above. No markdown brackets involved — this is for plain prose. */
export const BARE_PATH_RE = new RegExp(`\\b(?:[\\w.-]+/)*[\\w-]+\\.(?:${BARE_PATH_EXTENSIONS})\\b`, 'g');

/**
 * Common "Product.js"-shaped proper nouns (Node.js, Vue.js, ...) that match
 * BARE_PATH_RE's `.js` extension but are never actually a file reference in
 * agent prose — the one deny-list a pure regex can't avoid. Not a claim of
 * completeness, just the frameworks likely to come up in conversation.
 */
const BARE_PATH_DENYLIST = new Set([
  'node.js', 'vue.js', 'express.js', 'next.js', 'react.js', 'd3.js', 'three.js', 'chart.js', 'p5.js',
  'ember.js', 'angular.js', 'nuxt.js',
]);

/** True if a BARE_PATH_RE match is a real-looking file reference, not a denylisted framework name. */
export function isLikelyFilePath(token: string): boolean {
  return !BARE_PATH_DENYLIST.has(token.toLowerCase());
}
