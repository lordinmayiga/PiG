# Plan: implement pig-interaction-states, pig-network-states, pig-screen-states

Three new `.claude/skills/pig-*` skills were added 2026-09-04 (currently untracked in
git) and are not yet reflected in the app. Each skill's own "Not yet implemented"
section names the gap; this plan turns those into concrete, ordered work. Per
AGENTS.md these skills are non-negotiable — this is not optional polish.

## Why this order

The three skills are not independent:

- **pig-interaction-states** defines the *primitives* (disabled look, element-level
  spinner, field error, focus ring) that other skills' UI is built from.
- **pig-network-states** is the skill's own top pick for highest priority ("the
  killer") — a failed/dropped send currently has no defined UI outcome at all — but
  its Retry buttons and pending-send indicators are literally interaction-states
  primitives applied to one case.
- **pig-screen-states** is a per-screen audit (partial/error placement) that consumes
  both of the above once they exist.

So: **Phase A (primitives) → Phase B (network-states / composer send status, the
highest-value fix) → Phase C (per-screen partial/error audit).** Phases B and C touch
different screens for the most part and could run in parallel once A is done, but B
should land first since it's the one real users will hit hardest (any flaky VPS
connection).

---

## Phase A — pig-interaction-states primitives

**New shared pieces (build once, reuse everywhere):**

1. `src/theme/colors.ts` — no new color needed (opacity-based per the skill, not a new
   token), but audit every existing hardcoded disabled opacity for the `0.4` value the
   skill specifies. `SetupUI.tsx`'s `PrimaryButton` currently uses `0.5` — fix to `0.4`
   and treat that as the canonical constant (export `DISABLED_OPACITY = 0.4` from
   `src/theme/motion.ts` or `src/theme/index.ts` so every component references one
   source instead of re-typing `0.4`).
2. `src/hooks/useDelayedLoading.ts` (new) — `useDelayedLoading(active: boolean, delayMs = 300): boolean`,
   the 300ms delay-before-show rule from `pig-loading-states` that nothing in the repo
   currently implements as a reusable hook (grepped: no hits). Element-level spinners
   (below) and any future skeleton/spinner use this instead of hand-rolling a timer.
3. `src/components/InlineActionSpinner.tsx` (new, small) — a sized `ActivityIndicator`
   meant to replace a button's label/icon while its own action is in flight, gated by
   `useDelayedLoading`. `SetupUI.tsx`'s `PrimaryButton` already has an inline pattern
   for this (`loading` prop + `ActivityIndicator`) — extract/generalize that into this
   shared component rather than leaving it SetupUI-only, then reuse it from Composer's
   Send button (Phase B) and `SessionCard`'s swipe-kill/menu actions.
4. `src/theme/motion.ts` — add `useFocusVisible()`: tracks whether the current focus
   arrived via non-touch input (RN Web's native `focus`/`blur` work as-is; native
   Android needs `onFocus`/`onBlur` combined with a "was this a touch start" ref, since
   RN doesn't expose input modality directly — mirror the common workaround of
   suppressing the ring for `type distanceFromLastTouch < ~50ms`). Returns a style
   object: `{ borderWidth: 2, borderColor: colors.accent }` offset per the skill,
   applied only when true.
5. Field-level error: extend `TextField` in `src/screens/setup/SetupUI.tsx` with an
   optional `error?: string` prop — swaps border to `colors.destructive` and renders a
   caption-styled helper line below in the same token, replacing any place that
   currently has no such affordance.

**Apply the primitives where `disabled` already exists but only wires the prop
through** (named explicitly in the skill's gap note):

- `src/components/Composer.tsx` — Send button while a send is pending (ties into
  Phase B).
- `src/screens/sessions/NewSessionSheet.tsx`, `RenameSessionSheet.tsx` — submit
  buttons: disabled state (opacity 0.4, no press feedback, `accessibilityState`) while
  the name field is empty/invalid, and loading state while the create/rename call is
  in flight.
- `src/components/SettingsRow.tsx` — already closest to correct; fix the opacity
  constant and add `accessibilityState={{ disabled }}` (currently missing — only the
  Pressable's own `disabled` prop is set, not the a11y state RN needs for TalkBack).
- `src/screens/setup/OpenRouterStep.tsx`'s `TextField` — malformed-key case: wire the
  new `error` prop instead of only surfacing failures via `Alert.alert` after submit.

**Focus-visible ring**: apply to the composer's Send/Attach/Slash buttons,
`SessionCard`'s menu button, and `SettingsRow` — anywhere a D-pad/hardware-keyboard
user would tab through. Lower priority than the disabled/loading work above since PiG
is primarily a touch app, but the skill is explicit that this is required for
TalkBack linear navigation, not just keyboard use.

---

## Phase B — pig-network-states (highest priority per the skill itself)

The core gap: **no `sendStatus` tracking anywhere** (`pending`/`succeeded`/`failed`/
`unknown`) for a composer send. Today, `TranscriptScreen.handleSend` in
`src/screens/TranscriptScreen.tsx` (~line 328) synthesizes an optimistic `agentReply`
bubble whose only two states are `'streaming'` or `'error'` (set once, at send time,
purely from `client.getStatus() === 'connected'`) — there is no path that marks a
message failed *after* it was sent pending, no unknown-after-disconnect handling, and
no Retry action anywhere in the transcript.

1. **Extend the domain type.** `src/types/index.ts`'s `TranscriptMessage` currently
   only has `status?: AgentTurnStatus` (`'streaming' | 'done' | 'error'`) for agent
   turns. Add a *separate* `sendStatus?: 'pending' | 'sent' | 'failed'` field that
   applies to **user** messages (the thing that can fail to send), distinct from the
   agent turn's own streaming/done/error lifecycle. Do not conflate the two — a failed
   send never even reached the agent, so it has no agent turn at all yet.
2. **Track send outcome in `TranscriptScreen.handleSend`**:
   - Mark the new user message `sendStatus: 'pending'` immediately (optimistic,
     already the current behavior for appending it).
   - On `sendRouteInput`'s promise resolving (already awaited in `Composer.handleSend`,
     but the result currently only ever produces a normal/action outcome, not a
     network failure) — flip to `'sent'`.
   - On the promise rejecting (the existing `catch` in `Composer.handleSend`, which
     today only pops an `Alert`) — flip the just-sent message to `'failed'` instead of
     just alerting, so the failure is visible in the transcript per the skill
     ("**Never silently drop the attempted action**").
   - **Unknown case**: if `client.getStatus()` transitions away from `'connected'`
     while a send is pending and no response has arrived (listen via
     `client.onConnectionStatus`, mirroring `SessionsContext`'s existing subscription
     at `src/contexts/SessionsContext.tsx:42`), flip any still-`'pending'` message for
     this session to `'failed'` — per the skill, unknown is treated identically to
     failed for UI purposes.
3. **Render the failed state** in `TranscriptRow` (`TranscriptScreen.tsx`'s
   `TranscriptRow`, user-message branch ~line 95): a small error icon
   (`lucide-react-native`, `colors.destructive`) + inline `Retry` text button next to
   the bubble when `item.sendStatus === 'failed'`. Retry re-invokes the same
   `sendRouteInput` call with the original text/attachments/sessionId (the message
   already carries them) and flips back to `'pending'` — this is the "manual, never
   silent-automatic" retry the skill requires; do not add any auto-retry-on-reconnect
   logic.
4. **Composer stays usable regardless.** Already true today (`Composer` has no
   knowledge of transcript state), but explicitly verify: sending message N+1 while
   message N is `'failed'`/`'pending'` must not be blocked — no change needed here if
   `handleSend`/`Composer` stay decoupled as they are, just confirm with a manual test
   once B.2/B.3 land.
5. **Reuse Phase A's element-level loading** on the Send button itself while the
   in-flight send's promise is unresolved (currently the button has no loading state
   at all — a fast double-tap during a slow `sendRouteInput` call can double-send).
6. **`killSession`/`renameSession` in `SessionsContext.tsx`** are the other network
   actions named by the skill's examples ("kill a session, resyncing"). They currently
   fire-and-forget with no failure UI: `killSession` (line 75) sets a 1s timeout and
   calls `requestResync()` regardless of outcome, silently doing nothing if the
   `kill session` route_input truly failed. Lower priority than the composer (no
   Retry UI exists for these today either), but note as a follow-up: at minimum,
   surface a toast on failure per the skill's "succeeded = brief past-tense toast"
   pattern for a fire-and-forget action, and don't optimistically remove the session
   card until an `action_executed`/`action_pending_confirm` result actually confirms
   it (today `SessionsScreen.handleKillAnimationComplete` removes it locally
   unconditionally, ahead of the network call resolving).

---

## Phase C — pig-screen-states per-screen audit

Apply the ideal/empty/loading/partial/error walk to each screen that streams,
paginates, or loads in pieces. Empty and loading are already covered by the existing
`pig-empty-states`/`pig-loading-states` skills — this phase is specifically the
**partial** state (currently absent everywhere) and confirming **error** placement
matches the skill's full-screen/inline/banner rule.

1. **Transcript** (`TranscriptScreen.tsx`): connection drops mid-stream. Today
   `onTranscriptChunk`'s handler just stops receiving chunks with no visible marker —
   a truncated agent turn looks identical to a finished one, which the skill calls out
   explicitly as a bug. Add a "cut off" marker (small caption + Retry/resume, reusing
   the agent-turn status affordance already in `AgentStatusDot`) when a turn's
   `status === 'streaming'` and the bridge's connection status drops before a `done:
   true` chunk arrives — track this via the same `onConnectionStatus` subscription
   added in Phase B.2.
2. **Sessions list** (`SessionsScreen.tsx` / `SessionsContext.tsx`): resync currently
   has no per-session partial-failure path — `onResyncSnapshot`/`onSessionListUpdate`
   just replace the whole list. This requires a backend-side capability (per-session
   error in the resync snapshot) that doesn't exist yet in
   `ResyncSnapshotPayload`/`SessionListUpdatePayload` (`src/types/index.ts`) — flag as
   blocked on a backend change (out of this plan's app-only scope; note it rather than
   fake a client-only partial state that the server can't actually produce).
3. **File Explorer** (`FileExplorerScreen.tsx`): today a failed `fsList` call
   (~line 90, the `.catch(() => setFsEntries([]))`) silently renders the *empty-folder*
   state — indistinguishable from a folder that's genuinely empty. Per the skill this
   must instead render an inline error row (icon + reason + Retry), not reuse the
   empty state. `FsListResultPayload` already carries an optional `error` field
   (`src/types/index.ts` ~line 272) that the client-side `fsList()` promise wrapper
   apparently discards on error today — surface it instead of collapsing to `[]`.
4. Full-screen-replace error state (only when a screen has no fallback content) —
   audit whether Sessions' very first load, before any cache/resync has returned, has
   one; today `isLoadingSessions` from `SessionsContext` only distinguishes
   loading-vs-not, no error branch exists if the very first `resync_request` never
   resolves.

---

## Suggested sequencing

1. Phase A shared primitives (`useDelayedLoading`, `InlineActionSpinner`,
   `useFocusVisible`, `TextField` error prop, `DISABLED_OPACITY` constant) — small,
   self-contained, unblocks B and C.
2. Phase B.1–B.5 (composer send status + Retry) — the single highest-impact fix named
   by the skill itself.
3. Phase C.1 (Transcript cut-off marker) and C.3 (File Explorer error row) — same
   session as B since they share the `onConnectionStatus` wiring and touch adjacent
   code.
4. Phase A's remaining disabled/loading rollout across `NewSessionSheet`,
   `RenameSessionSheet`, `OpenRouterStep`, `SettingsRow` — mechanical, can trail.
5. Phase B.6 (kill/rename session failure UI) and C.2/C.4 (Sessions list
   partial/full-screen error) — C.2 is blocked on a backend payload change, so split
   it out if backend work isn't in scope for this pass.
6. Phase A's focus-visible ring — lowest priority (touch-first app), do last.

## Definition of done, per skill

- **pig-interaction-states**: no `disabled` prop anywhere renders with the old ad hoc
  opacity/no-opacity treatment; every element-level async action shows the shared
  spinner after 300ms; the OpenRouter key field shows a real inline error instead of
  only a post-submit Alert.
- **pig-network-states**: a failed or dropped composer send is visible in the
  transcript with Retry, survives app foreground/background, and the composer stays
  usable while it's showing.
- **pig-screen-states**: Transcript, Sessions, and File Explorer each have a
  documented partial-failure behavior (or a documented backend blocker), and no
  screen's error state silently degrades to its empty state.
