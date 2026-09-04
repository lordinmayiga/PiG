---
name: pig-microcopy
description: Use when writing any user-facing text in PiG — button labels, dialogs, empty states, error messages, toasts.
---

# PiG microcopy / voice

Voice rules: name things by what people recognize, not how the system is built. Active voice. A control says exactly what happens. Errors explain what went wrong and how to fix it — no apologies, no vagueness. Specific over clever.

## Locked copy patterns — reuse these verbatim where they apply, match their tone elsewhere

- **No emojis**: Never use emojis in any UI copy, button label, dialog title, toast, chip, or empty state. Always use clean text with adjacent Lucide icons where visual grounding is needed.
- **Buttons**: "New session", "Send", "Kill session", "Retry" — plain verbs. Never "Submit", "Delete" (use "Kill session" instead — matches how the product already talks about it), or a generic "OK".
- **Kill-session confirm dialog**:
  - Title: "Kill this session?"
  - Body: "This stops the agent and closes the session. Anything not saved elsewhere will be lost."
  - Buttons: `Cancel` · `Kill session` (destructive style)
- **Empty state** (no sessions yet):
  - "No sessions yet"
  - "Start one to begin working with an agent."
  - `New session`
- **Reconnecting banner**: "Reconnecting…" — non-modal, self-dismissing on resync.
- **Offline state**: "You're offline. Actions won't send until you're back."
- **Error** (VPS unreachable): "Couldn't reach your VPS. Check your connection and try again." `Retry`
- **Kill success toast**: "Session killed." (past tense, matches the button's own verb)
- **Composer placeholder**: "Message the agent…"
- **Misrouted-input recovery** (composer sent a prompt as a command by mistake): inline note under the sent bubble — "Sent as a command." with an `Undo` action. Not a blocking dialog — it's already been routed, the user needs an easy way back, not a lecture.

## Reversibility — every irreversible action gets one of two treatments

Before shipping any action that can't be trivially undone, decide explicitly: **confirm-before** (a dialog the user must actively dismiss to proceed, for actions where losing the "undo" window entirely would be bad — kill-session's dialog above is the model) or **undo-after** (the action already happened, but a visible, time-limited `Undo` lets the user reverse it — the misrouted-input recovery above is the model). Never ship a third option of "neither" for something genuinely irreversible, and never require *both* for the same action (a confirm dialog followed by an undo option on the same action is redundant friction).

Known irreversible actions and their assigned treatment:

| Action | Treatment | Status |
|---|---|---|
| Kill session | Confirm-before | Implemented (dialog copy above) |
| Composer sent as a command by mistake | Undo-after | Implemented (inline note above) |
| Delete/rename a file (File Explorer) | **Not yet assigned** | Open — decide before shipping file-mutation actions in File Explorer |
| Close a browser tab (loses that tab's history) | **Not yet assigned** | Open — decide before shipping tab-close in `BrowserScreen` |
| Remove/replace the OpenRouter key (Settings) | **Not yet assigned** | Open — decide before shipping key removal in Settings |

Any new irreversible action added to the app gets a row in this table before it ships, not after.

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every copy decision here must also satisfy the other `pig-*` skills — never trade this skill's rules off against another to make one screen work; a perceived conflict is a bug in the skills to raise, not a license to violate either.
- **No emojis anywhere in the app** — this file's own "No emojis" rule above is the same rule `pig-icons-branding` states; if any other skill or component is found contradicting it (as `pig-empty-states`' starter chips briefly did), that skill is wrong and gets fixed, not this one.
- **Icons are always `lucide-react-native`**, used beside text per the rule above, never emoji.
