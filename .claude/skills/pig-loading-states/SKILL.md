---
name: pig-loading-states
description: Use when implementing any loading, waiting, or "in progress" UI in PiG — deciding between a skeleton, a spinner, or a typing indicator.
---

# PiG loading-state rule

Decision rule — apply this instead of picking ad hoc per screen:

- **Skeleton**: content shape is already known AND load is likely >500ms. Examples: Sessions grid first load, transcript scrollback resync after a long absence.
- **Spinner**: duration is short/unknown AND there's no content shape to preview. Examples: app cold-start / VPS handshake, action-confirmation round-trips.
- **Typing indicator** (not a generic spinner): specifically while awaiting the agent's first streamed response chunk — matches the chat framing better than a spinner.
- **300ms delay-before-show**: never render a loader (of any of the three kinds above) until 300ms has passed since the operation started, to avoid a flash of skeleton/spinner on fast loads.

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every loading state here must also satisfy the other `pig-*` skills — never trade this skill's rules off against another to make one screen work; a perceived conflict is a bug in the skills to raise, not a license to violate either.
- **No emojis anywhere in the app**, including as a loading glyph — use a Lucide icon or the platform-native spinner instead.
- **Icons are always `lucide-react-native`.**
