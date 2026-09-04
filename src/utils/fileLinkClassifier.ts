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
