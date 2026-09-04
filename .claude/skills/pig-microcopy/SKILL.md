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
