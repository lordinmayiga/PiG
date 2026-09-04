---
name: pig-icons-branding
description: Use when adding icons anywhere in PiG, or touching the app icon/splash/branding assets.
---

# PiG icons & branding

- **Icon library: `lucide-react-native`, everywhere, no exceptions.**
- **Strict No-Emoji Rule**: **Never use emojis anywhere in the app** (no emojis in buttons, menus, dialogs, status indicators, badges, empty states, toasts, or overlays). Emojis look amateur, render inconsistently across OS versions, and break PiG's restrained terminal-workstation aesthetic. We must always only ever use Lucide SVG icons via the `Icon` component.
- Stroke weight: 2px, consistently.
- Size scale: 16 / 20 / 24 — pick from these three, don't introduce arbitrary icon sizes.
- Icon color always comes from the ink/accent tokens in `pig-color-system`, by context — never a hardcoded color on an icon.
- Every icon-only button (no visible text label) needs an `accessibilityLabel` for TalkBack — this applies to send, mic, kill-session, more-menu, and any future icon-only action.

## App icon — placeholder, concept deferred

The real app-icon concept (literal pig motif vs. abstract mark vs. wordmark lettermark) has **not been decided** and isn't blocking current work. For now: ship a plain **"PiG" text placeholder** as the home-screen/notification/splash icon — Onest, bold, Velvet Orchid on a Snow (light) / Onyx (dark) background.

This placeholder **must be redone** as a proper **Android adaptive icon** (separate foreground + background layers, since the OS masks them into circle/squircle/rounded-square per launcher) once a real concept is picked — don't treat the placeholder as final, and don't build the adaptive-icon layer split around it as if it were the real design.
