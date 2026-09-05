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

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every icon/branding decision here must also satisfy the other `pig-*` skills — never trade this skill's rules off against another to make one screen work; a perceived conflict is a bug in the skills to raise, not a license to violate either.
- **No emojis anywhere in the app — this is the source rule the other skills point back to.** Any skill or component found substituting an emoji for an icon is wrong and should be fixed to use a Lucide icon instead, not treated as a sanctioned exception.
- **Icons are always `lucide-react-native`**, no exceptions, no other icon set, no raster stand-ins.
