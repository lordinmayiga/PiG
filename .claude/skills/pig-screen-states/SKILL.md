---
name: pig-screen-states
description: Use when designing or reviewing any PiG screen's full state set — walk ideal, empty, loading, partial, and error for that screen before shipping it. Complements pig-empty-states and pig-loading-states rather than duplicating them.
---

# PiG screen states

Every screen gets five states, walked deliberately, not discovered in production: **ideal, empty, loading, partial, error.** A screen that only has an ideal state designed is not done — it's untested against the four ways real usage actually looks.

- **Ideal**: the screen with realistic content, fully loaded. This is what most other `pig-*` skills already describe (color, type, layout, motion).
- **Empty**: zero content. Covered by `pig-empty-states` — use that skill's patterns, don't re-derive them here.
- **Loading**: content is on its way. Covered by `pig-loading-states`' skeleton/spinner/typing decision rule — use that, don't invent a fourth loader type.
- **Partial**: some content loaded, some didn't. This is the state every screen skips, and PiG has real cases of it:
  - Transcript: connection drops mid-stream — the agent turn that was rendering keeps its partial text, gets a visible "cut off" marker, and offers Retry/resume. It must **not** look identical to a finished turn (no visible difference between a completed answer and a truncated one is a bug) and must **not** discard the partial text that already streamed in.
  - Sessions list: resync returns some sessions successfully and errors on others — the successful cards render normally; the failed ones render as an inline error card (icon + short reason + Retry) in place of that one card, not a global full-screen error blocking the sessions that *did* load.
  - File Explorer: a directory listing partially fails (e.g. a permission error partway through) — show what did load, plus an inline error row for what didn't, not a blank screen.
  - Rule of thumb: **partial failure gets a local, per-item treatment; total failure gets the screen-level error state below.** Never let one failed item blank out content that loaded fine.
- **Error**: the request failed outright, nothing usable came back. Decide *where* the error renders before writing copy for it (copy patterns are in `pig-microcopy`):
  - **Full-screen replace**: only when the screen has no content to fall back to (e.g. first-ever Sessions load fails outright).
  - **Inline card/row**: when only part of the screen failed (see Partial above) or a single action failed (e.g. one message send).
  - **Non-modal banner**: transient, connection-level issues ("Reconnecting…", offline) that don't block the content already on screen — per `pig-navigation-structure`'s pull-to-refresh note and `pig-microcopy`'s Reconnecting banner copy.
  - Every error state includes a way forward — a `Retry` button, a pull-to-refresh, or (for a single failed send) an inline retry on that item — never a dead end with no action.

## Not yet implemented

This skill is new as of 2026-09-04. No screen in the codebase has been audited against the partial-state rule above — check when touching any screen that streams/paginates/loads in pieces (Transcript, Sessions, File Explorer) rather than assuming it already handles partial failure correctly.

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every state decision here must also satisfy the other `pig-*` skills — an error/partial treatment still follows `pig-color-system`'s tokens, `pig-motion`'s restraint, `pig-microcopy`'s voice.
- **No emojis anywhere in the app**, including as an error/partial-state glyph.
- **Icons are always `lucide-react-native`** for every state's icon (error, retry, cut-off marker).
