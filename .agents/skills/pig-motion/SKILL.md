---
name: pig-motion
description: Universal motion & animation system for PiG — page-by-page transitions, micro-interactions, Reanimated 3 standards, and reduced-motion accessibility.
---

# PiG Motion System

PiG is a mobile terminal & agent workstation, not a consumer social app. Motion must feel **fast, tactile, and restrained**. Animations exist to clarify state transitions, confirm physical touch, and maintain spatial orientation — never as decoration.

---

## 1. Core Engineering Principles

- **Single Animation Engine**: **React Native Reanimated 3 exclusively**. Never introduce competing animation dependencies (e.g. Moti, Lottie, or legacy React Native `Animated` unless interfacing with an un-migrated third-party library).
- **Subtlety & Restraint**: Animations use gentle easing curves (`Easing.out(Easing.cubic)` or `Easing.out(Easing.quad)`) with short durations ($\le$ 220ms).
- **Springs vs. Timing**:
  - **Press feedback & micro-interactions**: Timing (`100ms`).
  - **Entrances (messages, cards)**: Timing with cubic ease (`220ms`).
  - **Sheets, drawers, & gestures**: Damped springs (`damping: 20, stiffness: 140, mass: 0.8`) with zero overshoot.
- **Accessibility & Reduced Motion**:
  - Always check `AccessibilityInfo.isReduceMotionEnabled`.
  - Every custom motion hook (`usePressScale`, `useFadeSlideIn`, `useTypingDotPulse`, `useStatusDotPulse`) must immediately skip or settle to final state if reduced motion is enabled.

---

## 2. Standard Motion Tokens (`src/theme/motion.ts`)

| Token / Hook | Target Duration | Value / Transform | Usage |
| :--- | :--- | :--- | :--- |
| `usePressScale()` | `100ms` | `scale: 0.96`, `opacity: 0.85` | Every pressable card, button, tab, and chip. |
| `useFadeSlideIn(delayMs)` | `220ms` | `opacity: 0 -> 1`, `translateY: 8 -> 0` | Message arrivals, staggered session cards. |
| `STAGGER_OFFSET_MS` | `30ms` per item | Stagger delay | Cascading list entrances (cards, files). |
| `useStatusDotPulse(active)` | `700ms` loop | `opacity: 1.0 <-> 0.35` | Reconnecting / active turn thinking status dot. |
| `useTypingDotPulse(index)` | `400ms` loop | `opacity: 0.3 <-> 1.0` (stagger 120ms) | Agent 3-dot typing indicator. |

---

## 3. Page-by-Page Consistent Motion Map

### 1. Setup & Pairing (`SetupScreen`)
- **Step Transitions**: Cross-fade (`180ms`) between `ConnectStep`, `ConnectingStep`, and `OpenRouterStep`.
- **Viewfinder Scanner**: Subtle vertical laser indicator (`translateY: -40 -> 40`, `1200ms` loop, soft opacity).
- **Connecting State**: Native spinning indicator transitioning to a green success checkmark with slight scale bounce (`scale: 0.8 -> 1.05 -> 1.0`).
- **Dev Token Accordion**: Smooth height expansion via Reanimated `Layout` transitions.

### 2. Sessions List (`SessionsScreen`)
- **Initial Grid / List Load**: Cards enter staggered with `useFadeSlideIn(index * STAGGER_OFFSET_MS)`.
- **Card Tap**: `usePressScale` feedback before native stack navigation push.
- **Swipe-to-Kill Action**:
  - Horizontal drag reveals red destructive surface (`SWIPE_ACTION_WIDTH = 88`).
  - On confirm: Card height collapses to 0 (`200ms`), and remaining cards smoothly slide up to close the gap.
- **Floating Action Button (FAB)**: Scale-in on mount (`150ms`).
- **Sheets (`NewSessionSheet`, `RenameSessionSheet`, `SessionActionMenu`)**:
  - Scrim backdrop fades in (`opacity: 0 -> 0.4`, `180ms`).
  - Elevated sheet slides up from bottom (`translateY: 300 -> 0`, damped spring).

### 3. Transcript & Chat Screen (`TranscriptScreen`)
- **Sent Message Arrival**:
  - User bubble immediately enters with `useFadeSlideIn` (8px upward slide, `220ms`).
  - List executes smooth animated auto-scroll to keep the bubble pinned in view.
- **Agent Thinking & Typing State**:
  - Agent turn card enters with `useFadeSlideIn`.
  - Three-dot pulsing typing indicator (`useTypingDotPulse`) while awaiting first token.
  - Header status dot pulses (`useStatusDotPulse(true)`).
- **Real-Time Streaming Fluidity**:
  - Smooth token expansion with throttled auto-scroll tracking.
  - **Scroll-Lock Protection**: If user manually scrolls up $> 80\text{px}$, auto-scroll disengages so text doesn't jerk out of reading focus.
  - Settle animation: On turn completion (`done: true`), dot stops pulsing and typing dots cross-fade out.
- **Starter Prompt Chips**:
  - Press scale feedback on tap; chip immediately dispatches and composer resets.

### 4. File Explorer (`FileExplorerScreen` & `FileViewerSheet`)
- **Breadcrumb Navigation**: Horizontal scroll smoothly auto-centers the active folder segment.
- **Folder Traversal**:
  - Descending into a folder: subtle forward slide (`translateX: 12 -> 0`, `180ms`).
  - Ascending to parent: subtle reverse slide (`translateX: -12 -> 0`, `180ms`).
  - File Viewer Sheet: Bottom sheet slides up with code/markdown content.

### 5. Embedded Browser (`BrowserScreen`)
- **Tab Strip (`TabStrip.tsx`)**:
  - Active tab selection: sliding pill indicator tracks between tabs.
  - New tab addition: scale-in from `0.8 -> 1.0` (`150ms`).
  - Tab close: tab width shrinks to 0 before unmounting.
- **Address Bar**: Border highlight and cancel icon fade in on focus.
- **Web Navigation**: Slim accent loading progress bar directly beneath the URL bar during page loads.

### 6. Settings Screen (`SettingsScreen`)
- **Switches & Toggles**: Platform-native spring toggle without custom delay.
- **Action Confirmation Dialogs**: Damped scale transition (`scale: 0.95 -> 1.0`, `150ms`).
- **Rows**: Standard `usePressScale` on interactive settings cells.

---

## 4. How Cloud Agents & Subagents Must Implement Motion

1. **Import directly from theme**: Always use `import { usePressScale, useFadeSlideIn, useStatusDotPulse, useTypingDotPulse } from '../theme'`.
2. **Never inline arbitrary `Animated.timing` without reduced motion checks**.
3. **Wrap list items**: When implementing flatlists, wrap list items in `Animated.View` with `useFadeSlideIn` for consistent entry feel.
