---
name: pig-navigation-structure
description: Use when building or reviewing PiG's screen navigation, information architecture, or status-display conventions.
---

# PiG navigation & information design

- **Bottom tab bar**: exactly three top-level destinations, in this order — **Browser | Sessions | Settings**. Sessions sits in the middle (it's the primary/most-used destination); Browser and Settings flank it. Decided 2026-09-02 when the mockup shipped with Sessions first — moved deliberately, don't revert without re-raising it.
- **Transcript and Composer are not tabs** — they're pushed on top of a session (nested stack) when a session card is tapped. Don't add them to the tab bar.
- **Sessions screen**: single-column card list (Keep/Notes-style), not a grid.
- **Status is always dot + text label together**, never color alone (this is also a `pig-color-system` rule — it applies to layout/placement too: don't design a status indicator that's a bare colored dot with no adjacent label).
- **Reconnect**: pull-to-refresh triggers a manual resync, on top of the automatic reconnect-resync the backend already does. Don't build pull-to-refresh as the *only* resync path.

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every navigation decision here must also satisfy the other `pig-*` skills — never trade this skill's rules off against another to make one screen work; a perceived conflict is a bug in the skills to raise, not a license to violate either.
- **No emojis anywhere in the app**, including as tab-bar glyphs or status markers — those are Lucide icons and dot+label per `pig-icons-branding`/`pig-color-system`.
- **Icons are always `lucide-react-native`** for tab bar icons and every nav affordance.
