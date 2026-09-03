# Plan: Universal Animation & Motion Rollout Across All PiG Screens

This document outlines the phased rollout plan for applying the universal **`pig-motion`** animation system across all remaining screens and interaction components in PiG.

---

## 1. Scope & Implementation Status

| Screen / Surface | Current Status | Planned Motion Upgrades |
| :--- | :--- | :--- |
| **Transcript & Chat** (`TranscriptScreen`) | ✅ **Implemented** | Auto-scroll on send, stream tracking, scroll-lock, `useFadeSlideIn` entrances, typing indicator. |
| **Sessions List** (`SessionsScreen`) | ⚠️ **Partial** (Cards stagger) | Swipe-to-kill row collapse, FAB enter/press scale, sheet slide-up physics. |
| **Setup & Pairing** (`SetupScreen`) | ⏳ **Pending** | Scanline laser pulse, connecting spinner-to-success bounce, dev accordion expand. |
| **File Explorer** (`FileExplorerScreen`) | ⏳ **Pending** | Folder drill-down horizontal slide, breadcrumb auto-center, viewer drawer gesture. |
| **Embedded Browser** (`BrowserScreen`) | ⏳ **Pending** | TabStrip active tab sliding pill, tab scale-in, loading progress line. |
| **Settings** (`SettingsScreen`) | ⏳ **Pending** | `usePressScale` on rows, smooth modal transitions on disconnect alert. |

---

## 2. Detailed Rollout Phases

### Phase 1: Setup & Pairing Screen (`src/screens/setup/`)
- **Viewfinder Scanline Animation (`ConnectStep.tsx`)**:
  - Implement an animated vertical laser line inside the QR viewfinder using Reanimated `useAnimatedStyle` with `withRepeat(withTiming(...))` ($1200\text{ms}$ ease-in-out loop).
  - Skips cleanly if `AccessibilityInfo.isReduceMotionEnabled` is true.
- **Connecting Transition (`ConnectingStep.tsx`)**:
  - Cross-fade from `ConnectStep` to `ConnectingStep` ($180\text{ms}$).
  - Replace static `ActivityIndicator` with an animated sequence: spinner $\to$ checkmark scale bounce (`scale: 0.8 -> 1.05 -> 1.0`) on handshake ack.
- **Dev Token Accordion (`ConnectStep.tsx` / `DevOutcomeSwitcher.tsx`)**:
  - Smooth height expansion when toggling the dev pairing token panel using Reanimated `LinearTransition`.

---

### Phase 2: Sessions Screen & Modals (`src/screens/sessions/`)
- **Swipe-to-Kill Row Collapse (`SessionCard.tsx`)**:
  - When a session kill is confirmed, animate the card height from $100\text{px} \to 0\text{px}$ and opacity $\to 0$ ($200\text{ms}$ ease-out cubic) so adjacent cards smoothly close the gap before the state deletion.
- **Card Press Feedback (`SessionCard.tsx`)**:
  - Wrap card press interaction with `usePressScale()` ($100\text{ms}$, `scale: 0.96`, `opacity: 0.85`).
- **FAB Floating Button Motion (`SessionsScreen.tsx`)**:
  - Enter animation on mount (`scale: 0 -> 1`, `180ms` spring).
  - Touch compression via `usePressScale()`.
- **Bottom Sheets (`NewSessionSheet.tsx`, `RenameSessionSheet.tsx`, `SessionActionMenu.tsx`)**:
  - Backdrop scrim fade (`opacity: 0 -> 0.4`, $180\text{ms}$).
  - Sheet slide-up with Reanimated spring physics (`damping: 20, stiffness: 140, mass: 0.8`).

---

### Phase 3: File Explorer (`src/screens/FileExplorerScreen.tsx`)
- **Folder Traversal Transitions**:
  - When descending into a child folder: animate entries with subtle forward slide (`translateX: 12 -> 0`, $180\text{ms}$ ease-out).
  - When navigating up to parent: animate entries with reverse slide (`translateX: -12 -> 0`, $180\text{ms}$).
- **Breadcrumb Bar Centering**:
  - Use `ScrollView`'s `scrollTo({ x, animated: true })` to automatically bring the active breadcrumb segment into view.
- **File Viewer Sheet (`src/components/FileViewerSheet.tsx`)**:
  - Reanimated sheet drawer with gesture-driven drag-down to dismiss.

---

### Phase 4: Embedded Browser (`src/screens/BrowserScreen.tsx` & `TabStrip.tsx`)
- **Active Tab Sliding Pill (`TabStrip.tsx`)**:
  - Render an animated pill indicator that smoothly slides horizontally between tab tabs when the active tab changes.
- **Tab Add / Close Animations**:
  - New tab chip scales in (`scale: 0.8 -> 1.0`, $150\text{ms}$).
  - Closed tab shrinks width to 0 before removal.
- **Loading Progress Bar**:
  - Render a slim $2\text{px}$ `colors.accent` bar beneath the address bar that animates progress during WebView navigation events.

---

### Phase 5: Settings Screen (`src/screens/SettingsScreen.tsx`)
- **Interactive Rows (`SettingsRow.tsx`)**:
  - Attach `usePressScale()` to selectable rows (theme, OpenRouter key editor, clear credentials).
- **Smooth Switch Feedback**:
  - Ensure native switch toggles animate smoothly with haptic tick.

---

## 3. Verification & Compliance Checklist

1. **Reanimated 3 Consistency**: No competing animation libraries imported.
2. **Reduced Motion**: Verify `reduceMotionEnabled` disables or settles all transitions to static state.
3. **No Frame Drops (60fps / 120fps)**: All transforms (`scale`, `opacity`, `translateY`, `translateX`) run on the native UI thread.
4. **Touch Target Preservation**: All pressables preserve `minTouchTarget: 44px`.
