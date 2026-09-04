# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# PiG design skills are mandatory, not advisory

Every `.claude/skills/pig-*` skill governs a real part of this app's UI (color, typography, motion, layout, icons, loading states, empty states, microcopy, markdown rendering, navigation, keyboard handling). Before writing or reviewing any UI code, check which of them apply and follow them exactly — including each skill's own "Cross-skill guardrails" section.

**Non-negotiable, no exceptions**:
- Never violate a `pig-*` skill's rule — not for speed, not because a screen "looks better" without it, not as a "temporary" fix. A violation found in review gets fixed, not justified.
- **No emojis anywhere in the app**, ever — buttons, chips, dialogs, empty states, toasts, badges, overlays, status indicators. Use text + a Lucide icon instead.
- **Icons are always `lucide-react-native`** via the shared `Icon` component — no other icon set, no raster stand-ins, no text-glyph icons (e.g. a bare "/" character standing in for an icon).
- If two `pig-*` skills appear to conflict, that is a bug in the skills themselves — stop and raise it rather than silently picking one side.
