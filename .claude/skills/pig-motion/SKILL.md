---
name: pig-motion
description: Use when adding animation or motion to any PiG screen or component.
---

# PiG motion

- **Single motion library: Reanimated 3.** Don't add a second animation dependency (e.g. Moti, Lottie) without revisiting this.
- Keep everything **subtle** — PiG is a notes-app, not a flashy consumer app. Restraint over expressiveness.
- Locked interaction patterns:
  - Native stack push/pop for session → transcript navigation (react-native-screens native-stack, not a custom transition).
  - Micro press feedback on every button/card tap: scale to ~0.96 + slight opacity dip.
  - Session cards on first load: staggered fade/slide-in, ~30ms offset between cards.
  - New transcript message: fade + 8px slide-up on arrival.
  - Status dot: pulses only in the "reconnecting" state — static otherwise, never pulse a connected/idle dot.
  - Waiting for the agent's first streamed token: typing-indicator dot pulse (see `pig-loading-states`), not a spinner.
- Respect the OS-level reduced-motion setting — none of the above should be unskippable for a user with that enabled.
