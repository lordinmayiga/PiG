# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# PiG design skills are mandatory, not advisory

Every `.claude/skills/pig-*` skill governs a real part of this app's UI (color, typography, motion, layout, icons, loading states, empty states, microcopy, markdown rendering, navigation, keyboard handling). Before writing or reviewing any UI code, check which of them apply and follow them exactly — including each skill's own "Cross-skill guardrails" section.

**Non-negotiable, no exceptions**:
- Never violate a `pig-*` skill's rule — not for speed, not because a screen "looks better" without it, not as a "temporary" fix. A violation found in review gets fixed, not justified.
- **No emojis anywhere in the app**, ever — buttons, chips, dialogs, empty states, toasts, badges, overlays, status indicators. Use text + a Lucide icon instead.
- **Icons are always `lucide-react-native`** via the shared `Icon` component — no other icon set, no raster stand-ins, no text-glyph icons (e.g. a bare "/" character standing in for an icon).
- If two `pig-*` skills appear to conflict, that is a bug in the skills themselves — stop and raise it rather than silently picking one side.

# E2E testing skills (any coding agent, not just Claude Code)

Two skills govern how end-to-end browser tests get written and run in this
repo. They live at `.claude/skills/e2e-test-methodology/SKILL.md` and
`.claude/skills/e2e-test-selector/SKILL.md` — read both in full before
writing, reviewing, or executing any Playwright/E2E test, regardless of
which agent or tool you are:

- **`e2e-test-methodology`** — how to write a Playwright E2E test so a pass
  actually proves the feature works for a real user (full journeys, no
  shortcuts, fidelity to real starting conditions, meaningful state
  coverage). Load this before writing or reviewing E2E test code.
- **`e2e-test-selector`** — the mandatory pre-flight conversation before any
  E2E test executes: confirm with the user exactly which tests are about to
  run, which state variations to include this run, and what starting
  conditions each test uses (flagging any deviation from how a real user
  actually arrives). Load this before running any E2E test, even a single
  one that already exists — never skip straight to execution.

Use them together: `e2e-test-selector` decides scope/confirmation for a
given run, `e2e-test-methodology` decides how the tests themselves are
structured. Never skip the pre-flight step to save time.
