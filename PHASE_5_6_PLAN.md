# PiG — Phase 5 & 6 Implementation Plan

Companion to SETUP_PLAN.md. Phases 0–4 are done (repo, scaffold, design system,
nav shell, all screens built against fixtures). This plan breaks out Phase 5
(local state & storage) and Phase 6 (networking layer) into concrete tasks.

Two of SPEC.md §12's open questions block these phases going past a stub:
**websocket wire format** and **local transcript storage schema**. Rather than
stall on them, this plan **proposes defaults below** so work can proceed —
flagged clearly as proposed, not yet confirmed with the user. Nothing here is
load-bearing enough to be expensive to change later (all behind interfaces).

---

## Proposed decision: websocket wire format

Envelope, one shape for every message either direction:

```ts
type Envelope = {
  v: 1;
  type: string;        // event name, see below
  id: string;           // uuid, for request/response correlation
  ts: number;            // ms epoch
  sessionId?: string;    // present for session-scoped events
  payload: unknown;      // type narrows by `type`
};
```

Event types (app→backend): `hello` (auth handshake w/ bridge token),
`resync_request`, `route_input` (composer submission), `action_confirm`,
`ping`.

Event types (backend→app): `hello_ack`, `resync_snapshot` (full session list +
active session state — the reconnect path per SPEC §8), `session_list_update`,
`transcript_chunk` (streamed NDJSON-derived chat chunk), `action_result`,
`error` (typed: `bad_token` | `unreachable` | `timeout` | `internal`), `pong`.

Reconnect = send `hello` then `resync_request`, discard anything before the
resulting `resync_snapshot` — matches the settled "resync via fresh fetch, not
stream replay" decision.

## Proposed decision: local transcript storage schema

- AsyncStorage key per session: `pig.transcript.<sessionId>`, value = last
  **200 messages** (ring buffer, oldest evicted first) + a `syncCursor` (id/ts
  of newest cached message).
- On opening a session: render cache immediately (instant paint), then send
  `resync_request`; if the backend's snapshot cursor is ahead, replace/append
  and re-persist.
- Scrolling past the cached window triggers an older-history fetch from the
  VPS (paginated, not cached long-term client-side) — keeps on-device storage
  bounded regardless of transcript age.
- Session list metadata (not full transcripts) can stay in memory/context,
  refetched on each resync — no need to persist separately.

Both of the above go in SPEC.md §12 as resolved (with "proposed by Claude,
confirm or amend") once this plan is reviewed.

---

## Phase 5 — Local state & storage

1. **Secure credential storage** (`expo-secure-store`)
   - New dependency: `expo-secure-store`.
   - Extend `src/storage.ts` (or a new `src/secureStorage.ts` to keep
     credential and preference concerns separate) with
     `saveBridgeCredentials({host, token})` / `loadBridgeCredentials()` /
     `clearBridgeCredentials()`.
   - Wire into `SetupScreen`/`ConnectingStep` (save on successful pairing) and
     `SettingsScreen` (show host, allow re-pair/disconnect which clears it).
   - Replace the current bare `isPaired: boolean` AsyncStorage flag — pairing
     state becomes "do secure credentials exist," not a separate bool.

2. **Transcript cache layer**
   - New `src/transcriptCache.ts` implementing the schema above behind a
     narrow interface (`getCached(sessionId)`, `appendAndPersist(...)`,
     `pruneToWindow(...)`) so Phase 6's websocket client is the only caller
     and the real shape can change without touching screens.
   - `TranscriptScreen` reads through this interface instead of directly from
     `src/fixtures/transcripts.ts` (fixtures become the seed data for the
     interface's dev/mock mode, not a separate path).

3. **State management**
   - Confirmed by SETUP_PLAN: plain Context + hooks, no Redux/Zustand.
   - One `SessionsContext` (session list + active connection status) and one
     `TranscriptContext`/hook per open session, both backed by the Phase 6
     client underneath.

## Phase 6 — Networking layer

1. **Mock backend** (unblocks everything else without a real VPS)
   - `src/dev/mockBridgeServer.ts` — small in-process fake implementing the
     envelope protocol above (session list, canned transcript streaming,
     route_input echo, action confirm/result) — used by the websocket client's
     tests and by a dev-only toggle so the app is exercisable end-to-end
     before the real VPS backend exists.

2. **Websocket client wrapper**
   - `src/network/bridgeClient.ts`: connect, `hello` handshake, auto-reconnect
     with exponential backoff, resync-on-reconnect (per SPEC §8), a typed
     event emitter for screens to subscribe to (`onTranscriptChunk`,
     `onSessionListUpdate`, `onConnectionStatus`, etc).
   - Outgoing actions queued while disconnected are visibly marked pending in
     the UI, never silently dropped or silently sent later — matches SPEC §8.
   - Exposes a `ConnectionStatus` (`connected | reconnecting | disconnected`)
     that `SessionsContext` surfaces as the "disconnected" indicator.

3. **`/route-input` proxy client**
   - `src/network/routeInput.ts`: thin wrapper sending composer text (+
     attachment refs) as a `route_input` envelope, returning the classified
     result (routed action vs. cleaned prompt).
   - Wire into `Composer.tsx`'s send handler — replace the current
     local-only submit with a call through this client; keep the existing
     hardcoded fast-path buttons (kill/new session) as direct `action_confirm`
     sends, per SPEC §6.

4. **QR pairing scan** (currently mocked in `ScanFrame.tsx`)
   - Add `expo-camera`, wire real `CameraView` + barcode listener, decode
     host+token from the QR payload, feed into the Phase 5 credential save +
     Phase 6 `hello` handshake.

5. **Attachment upload**
   - Extend `routeInput`/a sibling `uploadAttachment.ts` to push picked
     files/images to the working folder over the same connection (HTTP or a
     dedicated envelope type — TBD once the backend's upload endpoint shape
     exists; stub behind the interface for now).

Dictation (Web Speech API / RN equivalent) is **not** in this pass — it's
independent of storage/networking and the Composer already has a clearly
labeled "not yet available" stub; picking it up later doesn't block anything
here.

---

## Parallelization plan (this session)

Four workstreams with disjoint file ownership, run as parallel agents:

| # | Workstream | Owns |
|---|---|---|
| A | Secure credential storage | `src/storage.ts`/new secure store file, `SetupScreen`, `setup/ConnectingStep.tsx`, `SettingsScreen.tsx` |
| B | Transcript cache layer | new `src/transcriptCache.ts`, `TranscriptScreen.tsx` read path |
| C | Mock backend + websocket client | new `src/dev/mockBridgeServer.ts`, `src/network/bridgeClient.ts`, envelope types in `src/types/index.ts` |
| D | `/route-input` client + Composer wiring | new `src/network/routeInput.ts`, `Composer.tsx` send handler |

C's envelope types are a shared dependency for B and D's eventual real wiring,
so C defines them first as a standalone types addition; A/B/D consume the
*interface*, not the network internals, so they don't block on C finishing.

QR camera wiring (Phase 6 item 4) and attachment upload (item 5) are follow-up
tasks after this batch — they depend on A/C landing first (credentials +
handshake) and are smaller, sequential work.

## ETA

- Plan authored: now.
- 4 parallel agents on A–D: **~20–30 min** wall clock (independent file sets,
  no merge step needed).
- My integration pass after (typecheck, lint, wire Contexts into
  `RootNavigator`/screens, smoke-check): **~15 min**.
- QR camera + attachment upload follow-ups: **~20–30 min more**, sequential,
  after this batch lands.

**Total for a stub-complete Phase 5/6 (mock backend, no real VPS yet): ~1 hour
of session time.** This gets the app to "fully wired against a fake bridge
server" — not to "talking to your actual VPS," which additionally needs the
backend service itself (SPEC §4, not started, separate multi-hour effort) and
your sign-off on the two proposed decisions above.
