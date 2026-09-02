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
