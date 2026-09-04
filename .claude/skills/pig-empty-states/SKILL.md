---
name: pig-empty-states
description: Use when designing or implementing any empty screen or empty state in PiG — empty chat transcripts, empty session lists, empty file explorer folders, and internal browser starters.
---

# PiG empty states

Empty screens in PiG must never be dead whitespace. They are guidance surfaces that establish workspace context, confirm agent readiness, and provide clear next actions.

## 1. Empty Chat / Transcript (`TranscriptScreen`)

Shown when a new session is launched and has 0 messages.

### Structure & Content
1. **Agent & Workspace Header**:
   - Agent icon (`SquareTerminal` for Claude Code, `Rocket` for Antigravity).
   - Agent title and status dot + text label (`● Ready` using `colors.idleDot` and `typeScale.label`). Status is always dot + text together, never color alone.
   - Working folder path on the VPS (`folder` property of the session, rendered with `colors.inkSecondary`).
2. **Starter Prompt Chips (Quick Actions)**:
   - Provide 3 to 4 actionable starter prompt chips above the composer, each a Lucide icon (`pig-icons-branding`: 16px, 2px stroke, `colors.inkSecondary`) beside plain text — **never an emoji**, per `pig-icons-branding`'s and `pig-microcopy`'s no-emoji rules (this row previously specified emoji leads; that was a bug in this skill, fixed 2026-09-04, not a sanctioned exception):
     - `Search` icon — "Explain this project"
     - `GitCommitHorizontal` icon — "Summarize recent git commits"
     - `FlaskConical` icon — "Run test suite"
     - `ListTodo` icon — "What tasks are open?"
   - Tapping a chip immediately populates or sends the prompt through the composer.
3. **Microcopy**:
   - *"Ready to work. Tap a starter prompt above or message the agent below."*
   - Composer placeholder remains: *"Message the agent…"*

---

## 2. Empty Sessions List (`SessionsScreen`)

Shown when no active tmux sessions exist on the VPS.

### Structure & Content
Per `pig-microcopy` locked copy:
- **Title**: *"No sessions yet"* (`typeScale.heading`, `colors.ink`)
- **Body**: *"Start one to begin working with an agent on your VPS."* (`typeScale.body`, `colors.inkSecondary`)
- **Primary Button**: `New session` (pill button, `colors.accent` filled, `colors.onAccent` text)
- **Background Context**: Remind user that sessions persist in tmux even if the app closes or disconnects.

---

## 3. Empty Folder in File Explorer (`FileExplorerScreen`)

Shown when navigating into an empty directory or when no search results match.

### Structure & Content
- **Icon**: `FolderOpen` (`colors.inkSecondary`, `size: 32`)
- **Title**: *"This folder is empty"*
- **Action**: A breadcrumb link or tap target allowing the user to navigate back to the parent directory.

---

## 4. Empty Browser View (`BrowserScreen`)

Shown when no web tabs are currently open.

### Structure & Content
- Search/URL address bar ready for focus.
- Quick shortcut chips for active development services:
  - `Metro Bundler` (`http://localhost:8081`)
  - `Expo Docs`
  - `GitHub`

---

## Design System Constraints

- **Color**: Adhere strictly to `pig-color-system` — use semantic tokens (`colors.canvas`, `colors.card`, `colors.inkSecondary`, `colors.accent`).
- **Typography & Touch Targets**: All interactive chips and buttons must observe `minTouchTarget` — **48dp**, matching `pig-layout-spacing`'s floor (this file previously said 44px; that was this skill under-stating the real floor, fixed 2026-09-04) — and `maxFontScale` (1.3×, per `pig-typography`).
- **Microcopy**: Active voice, concise, no apologies, per `pig-microcopy`.
- **Icons**: Lucide only (`pig-icons-branding`), never emoji, on every chip/icon above.

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every empty state here must also satisfy the other `pig-*` skills — never trade a rule off against another to make one screen work; a perceived conflict is a bug in the skills to raise, not a license to violate either.
- **No emojis anywhere in the app**, full stop — this file is not an exception, and the starter-chip glyphs above are Lucide icons for exactly that reason.
- **Icons are always `lucide-react-native`** via the shared `Icon` component.
