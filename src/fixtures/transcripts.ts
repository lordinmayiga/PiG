import type { FileAttachment, TranscriptMessage } from '../types';

// Fixture data for Phase 4 screen builds — no real websocket yet. Covers the
// cases TranscriptScreen needs to render: plain prose, a fenced code block,
// an attachment chip, a mid-stream agent turn, and an error turn. Real data
// arrives in the same TranscriptMessage shape once Phase 6 lands.
const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60 * 1000).toISOString();

const screenshotAttachment: FileAttachment = {
  id: 'att-1',
  name: 'screenshot.png',
  mimeType: 'image/png',
  sizeBytes: 812_004,
  path: 'assets/screenshot.png',
  kind: 'image',
};

const notesAttachment: FileAttachment = {
  id: 'att-2',
  name: 'notes.txt',
  mimeType: 'text/plain',
  sizeBytes: 156,
  path: 'notes.txt',
  kind: 'text',
};

const reportAttachment: FileAttachment = {
  id: 'att-3',
  name: 'coverage-report.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 233_512,
  path: 'coverage-report.pdf',
  kind: 'other',
};

export const mockTranscript: TranscriptMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    timestamp: minutesAgo(42),
    content: 'Can you take a look at the auth module test failures and fix them?',
  },
  {
    id: 'msg-2',
    role: 'agent',
    timestamp: minutesAgo(41),
    status: 'done',
    content:
      "Sure — I'll start by reproducing the failures, then look at what changed recently in `src/auth`.\n\nHere's the failing test output:\n\n```text\nFAIL src/auth/session.test.ts\n  ● validates an expired token\n    Expected: false\n    Received: true\n```\n\nThat looks like the expiry check is inverted. Let me fix it.",
  },
  {
    id: 'msg-3',
    role: 'agent',
    timestamp: minutesAgo(40),
    status: 'done',
    content:
      "Found it — the comparison in `isExpired` was flipped. Fixed:\n\n```ts\n// src/auth/session.ts\nexport function isExpired(token: Token): boolean {\n  return token.expiresAt < Date.now();\n}\n```\n\nRe-ran the suite:\n\n- `session.test.ts` — 4 passed\n- `auth.test.ts` — 2 passed\n- `refresh.test.ts` — 1 skipped (needs a live token, unrelated to this fix)\n\nAll good. Want me to commit this?",
  },
  {
    id: 'msg-4',
    role: 'user',
    timestamp: minutesAgo(38),
    content: "Yes please. Also here's a screenshot of the dashboard bug I mentioned, and my running notes file.",
    attachments: [screenshotAttachment, notesAttachment],
  },
  {
    id: 'msg-5',
    role: 'agent',
    timestamp: minutesAgo(37),
    status: 'done',
    content:
      "Committed as `fix: correct inverted expiry check in isExpired`. Thanks for the screenshot — I can see the stale-badge issue on the dashboard now. I'll take a look at that next.\n\nHere's the coverage report from the fixed run:",
    attachments: [reportAttachment],
  },
  {
    id: 'msg-6',
    role: 'user',
    timestamp: minutesAgo(2),
    content: 'Great, go ahead and dig into the dashboard badge issue.',
  },
  {
    id: 'msg-7',
    role: 'agent',
    timestamp: minutesAgo(1),
    status: 'streaming',
    content:
      "Looking at the dashboard component now. The stale badge seems to come from a memoized selector that isn't invalidating on",
  },
];

/** A conversation whose last agent turn ended in an error, for status-dot coverage. */
export const mockTranscriptWithError: TranscriptMessage[] = [
  {
    id: 'err-1',
    role: 'user',
    timestamp: minutesAgo(5),
    content: 'Kill the dev server and restart it on port 4000.',
  },
  {
    id: 'err-2',
    role: 'agent',
    timestamp: minutesAgo(4),
    status: 'error',
    content: "Couldn't reach the VPS bridge to run that — connection timed out. Try again once you're back online.",
  },
];

/**
 * Longer markdown reply, "streamed" into the transcript in chunks by
 * TranscriptScreen after a local send — stands in for the real websocket
 * stream. Deliberately mixes prose, a list, and a code block.
 */
export const mockStreamingReply = `Got it — here's what's causing the stale badge:

The \`useDashboardCounts\` selector memoizes on \`sessionId\` only, so it never recomputes when a session's \`status\` changes in place.

\`\`\`ts
// before
const counts = useMemo(() => computeCounts(sessions), [sessionId]);

// after
const counts = useMemo(() => computeCounts(sessions), [sessionId, sessions]);
\`\`\`

Next steps:
- Add \`sessions\` to the memo dependency list
- Add a regression test that flips a session's status and asserts the badge updates
- Re-run the dashboard test suite

I'll make these changes now.`;
