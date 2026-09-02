import type { Session } from '../types';

// Fixture data for Phase 4 screen builds — no real backend yet. Keep timestamps
// relative-ish to "now" so empty/relative-time UI (e.g. "2h ago") looks sane whenever
// this is read. Real data arrives in the same Session shape once Phase 6 lands.
const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000).toISOString();

export const mockSessions: Session[] = [
  {
    id: 'sess-1',
    name: 'PiG app build',
    agent: 'claude-code',
    folder: '/root/projects/PiG',
    status: 'active',
    createdAt: hoursAgo(30),
    lastActivityAt: hoursAgo(0.05),
    lastMessagePreview: 'Committed Phase 2+3: design system foundations, navigation shell, ESLint',
  },
  {
    id: 'sess-2',
    name: 'Antigravity refactor',
    agent: 'antigravity',
    folder: '/root/projects/other-app',
    status: 'idle',
    createdAt: hoursAgo(72),
    lastActivityAt: hoursAgo(5),
    lastMessagePreview: 'Ran the test suite — 3 failures left in auth module.',
  },
  {
    id: 'sess-3',
    name: 'Scratch VPS debugging',
    agent: 'claude-code',
    folder: '/root/scratch',
    status: 'disconnected',
    createdAt: hoursAgo(200),
    lastActivityAt: hoursAgo(48),
    lastMessagePreview: 'Reproduced the crash — looks like a null tmux pane id.',
  },
];

export const emptySessions: Session[] = [];
