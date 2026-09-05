---
name: pig-interaction-states
description: Use when building or reviewing any tappable/focusable element in PiG — the full interaction-state set (default, pressed, disabled, loading, error, focus-visible) an element needs beyond just its resting look.
---

# PiG interaction states

Every interactive element (button, chip, row, input) needs its full state set designed, not just its default look. This skill is the missing middle between `pig-color-system` (tokens) and `pig-motion` (transforms) — it says which states must exist.

- **Default** — covered by whichever skill styles that element (color, layout, typography).
- **Pressed/active** — covered: `pig-color-system`'s pressed-fill table (light reuses `neutral[100]`, dark reuses `surface.elevated`) + `pig-motion`'s `usePressScale` (scale 0.96, opacity 0.85, 100ms).
- **Disabled** — a `Pressable`/button/icon-button that can't currently be activated (composer Send with empty input, a Retry already in flight, a form submit with invalid fields) must look visibly inert *before* the user taps it, not just silently no-op:
  - Reduce opacity to **0.4** on the element's fill/text/icon (not a separate disabled color — a new hardcoded gray is exactly the kind of unvalidated color `pig-color-system` warns against).
  - No press feedback at all — disabled elements skip `usePressScale` entirely, they don't scale-and-bounce-back on a tap that does nothing.
  - `accessibilityState={{ disabled: true }}` alongside the existing `accessibilityLabel` requirement from `pig-icons-branding`, so TalkBack announces it correctly.
- **Loading (element-level)** — a button whose own action is in flight (Retry, Send while the network call is pending) shows a small inline spinner replacing its label/icon, sized to the button, not a full-screen loader — this is `pig-loading-states`' spinner case applied to one element rather than a screen; it still gets that skill's 300ms delay-before-show.
- **Error (field-level)** — a `TextInput` that failed validation (e.g. a malformed OpenRouter key in Setup) gets its border swapped to the destructive token (`Rosy Copper` / `Rosy Copper — Dark` per `pig-color-system`) plus a helper-text line in the same token below the field. Never rely on a placeholder-text change alone to signal the error, and never use red for anything on that field except this — no red icon *and* red border *and* red text stacked for one error.
- **Focus-visible** — the ring/outline a keyboard, D-pad, or accessibility-scanning cursor shows on the currently-selected element (distinct from touch, which has no equivalent). Use a **2px `accent` token outline**, offset 2px from the element's edge, applied only when focus arrived via a non-touch input (RN's `Pressable` gets this via `focus`/`blur` handlers checked against the input modality, not a permanent ring on every tap). This matters for TalkBack linear navigation and any hardware-keyboard use, both of which PiG must support per the TalkBack `accessibilityLabel` rule already in `pig-icons-branding`.

## Not yet implemented

This skill is new as of 2026-09-04. As of this pass, the codebase has no disabled-state token in `src/theme`, no element-level loading spinner convention, no field-level error border, and no focus-visible ring anywhere — `disabled` props exist on a handful of components (`Composer`, `NewSessionSheet`, `RenameSessionSheet`, `SettingsRow`, and others) but only wire the prop through, with no shared visual treatment behind it. Treat every element above as a gap to close, not a state already handled, when next touched.

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every interaction state here must also satisfy the other `pig-*` skills — a disabled/error/focus treatment still uses `pig-color-system`'s validated tokens and `pig-motion`'s restraint, never a new hardcoded color or an unvetted animation.
- **No emojis anywhere in the app**, including as a disabled/error/focus indicator.
- **Icons are always `lucide-react-native`**, colored from the ink/accent/destructive tokens, never a hardcoded hex, for any icon inside a stateful element.
