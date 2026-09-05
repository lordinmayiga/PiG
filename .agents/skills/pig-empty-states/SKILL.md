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
   - Provide 3 to 4 actionable starter prompt chips above the composer:
     - `🔎 Explain this project`
     - `📜 Summarize recent git commits`
     - `🧪 Run test suite`
     - `🛠️ What tasks are open?`
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
- **Typography & Touch Targets**: All interactive chips and buttons must observe `minTouchTarget` (44px) and `maxFontScale`.
- **Microcopy**: Active voice, concise, no apologies.
