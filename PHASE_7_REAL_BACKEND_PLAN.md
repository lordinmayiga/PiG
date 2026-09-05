# PiG — Wiring the app to the real VPS backend (Phase 7)

Companion to PHASE_5_6_PLAN.md and BACKEND_SETUP_PLAN.md. Both are done and
merged (PR #1) but the app still talks to the in-process mock
(`src/dev/mockBridgeServer.ts`), not the real `pig-bridge` service running on
this VPS. This plan is what's left to actually connect them.

## Current state (for reference)

- `src/network/bridgeConnection.ts` hardcodes `USE_MOCK_TRANSPORT = true` —
  the only thing standing between "code exists" and "code is used."
- `WebSocketTransport` (in `bridgeClient.ts`) is implemented and was smoke
  tested against the real backend directly (not through the RN app) during
  Phase 6 integration.
- `pig-bridge.service` is installed + enabled on this VPS but **not
  started** (`systemctl start pig-bridge` is blocked for Claude by this
  session's permission classifier — needs a human to run it).
- No APK has been built against any of this Phase 5/6/backend work yet —
  everything's been verified via `tsc`, ESLint, and Node-level script tests,
  never on-device.

## Steps

### 1. Settings-screen mock/real toggle
- Replace the `USE_MOCK_TRANSPORT` constant with a persisted preference
  (`src/storage.ts`, plain AsyncStorage — not secure storage, it's not a
  secret) defaulting to mock.
- Add a dev-visible toggle in `SettingsScreen.tsx` ("Use real VPS backend").
  Flipping it should call `disconnectBridge()` + reconnect (or just prompt
  "restart the app" if that's simpler — a live-swap mid-session adds
  complexity for a dev toggle that doesn't earn it).
- `bridgeConnection.ts`'s `connectBridge` reads the preference instead of
  the hardcoded constant.

### 2. Start the backend service
- You run: `sudo systemctl start pig-bridge && sudo systemctl status pig-bridge`
- Confirm `ufw status` still shows 22 + 8787 allowed (it does, verified this
  session) and `journalctl -u pig-bridge -f` shows `listening on
  0.0.0.0:8787`.

### 3. Pair a real device against it
- Run `npx tsx bin/pig-bridge.ts pair` (from `backend/`) on the VPS.
- Scan the QR from the app's Setup screen — **but check first**: Phase 6's
  own agent found `ConnectStep.tsx`'s scan flow is still
  `MOCK_SCANNED_HOST`/`MOCK_SCANNED_TOKEN`, not a real camera decoder. QR
  camera wiring is PHASE_5_6_PLAN.md's explicit Phase 6 item 4, never
  picked up. Until that lands, pair by typing the host:port + token into
  the manual-entry fields instead (if the Setup screen has one — confirm;
  if not, add one, it's a small win either way).

### 4. Build a real APK and install it
- Per your build-local-only rule (`[[pig-build-local-only]]` memory):
  compile on this VPS, never EAS cloud.
- `eas.json`'s `development`/`preview` profiles are already `buildType: apk`
  — use the local build path (`eas build --local` or the plain `expo
  run:android` / gradle path, whichever this repo's actual local-build
  setup uses — confirm the exact command against
  `pig-vps-build-constraints` memory's RAM/swap/JDK tuning notes before
  running it blind, this VPS is small).
- Sideload onto your phone (or note if you're testing via an emulator
  instead — changes how "on the VPS's LAN/public IP" reachability plays
  out).

### 5. End-to-end smoke test on-device
- Pair (step 3), flip the Settings toggle (step 1) to real backend.
- Sessions screen should show this VPS's actual tmux sessions, not the mock
  fixture's 3 canned ones.
- Send a prompt from the Composer — expect it to classify correctly
  (`route_input` → `action_result`), but **no live agent reply will
  stream** yet (see gap below) — the screen will sit on the local
  fake-stream fallback or nothing, depending on what lands in step 6.
- Watch `journalctl -u pig-bridge -f` on the VPS side to see the real
  session list poll and route_input handling happening live.

### 6. Close the "no live agent turn" gap (the big remaining piece)
This is the one that makes the app *actually useful*, not just *connected*:
- `server.ts`'s `route_input` handler currently only classifies/cleans text
  — it never calls `agentProcess.ts`'s `spawnAgentInTmuxWindow` for a
  `prompt_routed` result.
- Needs: on `prompt_routed`, spawn (or reuse an existing) agent process for
  that `sessionId`, pipe its `TranscriptChunkPayload`s back out as real
  `transcript_chunk` envelopes to every authed client subscribed to that
  session (`server.ts` doesn't currently track "which sockets care about
  which session" — right now `session_list_update` broadcasts to everyone,
  but per-session transcript streaming needs a subscription list, not a
  blind broadcast).
- Also needs a decision on session continuity: `claude --print` is
  one-shot-per-process (per `agentProcess.ts`'s doc comment) — a second
  message in the same session needs either a fresh spawn with
  `--resume/--continue <session-id>`, or keeping the process alive somehow.
  Worth confirming with you before building either way, since it affects
  the tmux-window-per-turn vs. tmux-window-per-session shape.

### 7. Structured actions (kill/create/rename) — smaller follow-up
- Flagged in `SessionsContext.tsx`'s header comment already: these are
  optimistic-local-only today. Real wiring needs either a new envelope type
  for structured actions, or routing UI actions through `route_input`'s
  text classifier (e.g. synthesizing `"kill session <name>"` client-side).
  Smaller than step 6, but a protocol decision either way — flagging here
  so it doesn't get silently skipped.

## Sequencing

Steps 1–5 are mechanical (~30–45 min combined, mostly steps 1 and 4) and get
you to "the app really talks to the real VPS" for session list + prompt
classification. Step 6 is the substantial remaining piece — probably
1–2 hours — and is what turns that into "I can actually chat with my agent
from my phone." Step 7 is smaller, do it after 6.

Recommend: steps 1–5 first (fast, satisfying, proves the plumbing), confirm
step 6's session-continuity question with you, then build it.
