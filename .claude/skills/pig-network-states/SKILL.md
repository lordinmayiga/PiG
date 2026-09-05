---
name: pig-network-states
description: Use when building or reviewing any action in PiG that crosses the network — sending a message, killing a session, resyncing — so it handles all four outcomes (pending, succeeded, failed, unknown) with a consistent retry policy, not just the happy path.
---

# PiG network-action states

Every action that crosses the network (composer send, kill session, resync, Setup's connect/pair step, OpenRouter key save) has **four** possible outcomes, not two. Design and copy for all four before shipping the action.

| Outcome | What it is | PiG's rule |
|---|---|---|
| **Pending** | Request sent, no response yet | Use `pig-loading-states`' decision rule (spinner for short/unknown duration, typing indicator specifically for the agent's first streamed chunk). The action's own trigger (button, chip) shows its element-level loading state per `pig-interaction-states` — don't block the whole screen for a single action unless nothing else on it is usable meanwhile. |
| **Succeeded** | Response confirms it worked | A brief, past-tense toast (`pig-microcopy`'s "Session killed." pattern) for a fire-and-forget action; for anything that changes visible state (a message appearing in the transcript), the state change itself is the confirmation — don't *also* toast it. |
| **Failed** | Response confirms it didn't work | Inline error at the site of the action (per `pig-screen-states`' error-placement rule) with a `Retry` action, per `pig-microcopy`'s error copy pattern. **Never silently drop the attempted action** — a failed message send stays visible in the transcript (with an error icon + Retry), it does not vanish as if never typed. |
| **Unknown** | Request went out, then the connection dropped before any response arrived | This is the outcome every other skill under-specifies, and the one most likely to be mishandled. PiG's rule: **treat unknown the same as failed for the purposes of user-facing state** (show it as failed, with Retry) — never leave an action spinning indefinitely waiting for a response that may never come. Pair this with the "Reconnecting…" banner (`pig-microcopy`) so the user understands *why* it failed, not just that it did. |

## Cancellation — a fifth, user-initiated outcome (orthogonal to the four above)

Some pending actions have a meaningful window where the user can reasonably want out before either a real outcome arrives — a file download in the File Explorer viewer sheet, an attachment upload. That's the case this section covers; a quick round-trip (kill session, save a key) doesn't need a Cancel affordance just because pending-network-states exist for it.

- **Cancel is always available, not a hidden gesture.** If the action can take a while, its pending state shows an explicit `Cancel`, not just an implicit "back out and hope it stops" (e.g. FileExplorerScreen closing the viewer sheet mid-load aborts the fetch behind it, rather than letting it finish unseen).
- **Cancelling never blocks anything else.** Per `pig-network-states`' existing pending rule, the action's own trigger shows the loading state — the rest of the screen was never disabled by it, so there's nothing to "unfreeze" on cancel; cancel just stops that one thing.
- **Cancelled is not Failed.** It gets no destructive styling, no error icon, no `Retry` — the user chose to stop, nothing went wrong. The UI returns to its pre-attempt resting state (the closed sheet, the un-sent draft) as if the action had simply not been started, not to a "this broke" state.
- **A response that arrives after cancellation is discarded, not applied.** Matching each request by its own id (not by a shared key like a file path) is what makes this safe — see bridgeClient.ts's `fsRead`/`getRawFileUrl` for the pattern: a stale response for an abandoned request must never overwrite what the user has since done instead.

## Retry policy — answered, not left ambiguous

- **Retry is always manual, never silent-automatic.** The user taps `Retry`; PiG does not re-send a failed/unknown action on its own without a tap, even after reconnecting — an auto-retry that succeeds *after* the user already moved on (typed something else, navigated away) is more confusing than a visible failed state waiting for them.
- **The automatic reconnect-resync described in `pig-navigation-structure`** is a different thing from action-retry above: resync re-fetches current server state (sessions list, transcript scrollback) automatically on reconnect; it does not re-send any action the user took while disconnected. Don't conflate the two.
- **A failed/unknown send is preserved, never lost.** It stays in the transcript/list at the position it would have occupied, marked as failed, until the user retries or explicitly dismisses it.
- **The composer stays usable while a previous send is unresolved.** The user can keep typing and send the next message; a pending/failed send on message N does not block composing message N+1. Each message tracks its own outcome independently.

## Not yet implemented

This skill is new as of 2026-09-04. As of this pass there is no `sendStatus`/pending-failed-unknown tracking anywhere in `src/components` or `src/screens` — a search for that pattern in the composer and session-action code turns up nothing, meaning today a failed or dropped send has no defined UI outcome at all. This is the highest-priority gap of the three new skills to close, since it's the one the original prompt called out as "the killer."

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every network-state decision here must also satisfy the other `pig-*` skills — the failed/unknown treatment still uses `pig-color-system`'s destructive token, `pig-microcopy`'s copy voice, and `pig-screen-states`' error-placement rule.
- **No emojis anywhere in the app**, including as a status glyph for any of these four outcomes.
- **Icons are always `lucide-react-native`** for pending/failed indicators (e.g. an error icon on a failed message bubble).
