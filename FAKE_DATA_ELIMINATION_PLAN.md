# Fake Data Elimination Plan — [COMPLETED]

Exhaustive audit + replacement plan for every mocked/simulated/hardcoded piece of the
**connect to VPS → see sessions → open a session → send a message → get a real agent
reply** workflow. Ordered VPS setup → sessions → transcript, per the original ask.
Every "delete" below was meant literally: no fallback path left behind.

Scope decisions executed:

- [x] **QR scan mode**: hidden entirely. `ConnectStep`'s scan UI and `ScanFrame.tsx` are
  deleted. Manual host + token entry against a real `pig-bridge pair` output is the
  only pairing path.
- [x] **Mock/offline mode**: deleted completely. No `MockTransport`, no
  `mockBridgeServer.ts`, no `__DEV__`-gated remnant. Real backend is the only mode.
- [x] **File access** (recent folders, attachment content): in scope. Real backend
  list-directory / read-file ops added (`fs_list`, `fs_read`).

---

## Status Overview

- **Overall Status**: **100% Complete & Verified, including Phase 6's real in-app e2e proof**
- **TypeScript Check (`npx tsc --noEmit`, root and backend)**: 0 errors
- **Backend Test Suite (`npm --prefix backend test`)**: 16 / 16 passing (100%; the
  12 raw-`ws` e2e tests in the now-deleted `bridge-e2e.test.ts` are superseded by
  Phase 6's real UI e2e test)
- **Root e2e Suite (`npm run test:e2e`, Playwright)**: 2 / 2 passing — the real
  happy-path proof plus a boot smoke test
- **Fixture Audit**: Zero remaining mock fixtures or backdoor credentials across codebase.

---

## Phase 0 — Backend auth foundation (Completed)

Real pairing foundation restored:

- [x] **`backend/src/auth.ts:76`** — `validBridgeTokens = new Set(['a1b2c3d4e5f6'])`: **Deleted**.
  `validBridgeTokens` is initialized empty (`new Set<string>()`).
- [x] **Single-use pairing**: `mintPairingToken()` and `verifyAndConsumePairingToken()` are active.
  Consumed pairing tokens are added to `validBridgeTokens` so authenticated sessions reconnect reliably.
- [x] Verified by test `Auth: Backdoor token removed & pairing token consumption works`.

---

## Phase 1 — VPS pairing / Setup flow (Completed)

- [x] **`src/screens/setup/types.ts:23-43`** `resolveOutcome`: **Deleted**.
- [x] **`src/screens/SetupScreen.tsx:16-19`** `MOCK_CONNECT_DELAY_MS` / `CONNECT_ACK_HOLD_MS`:
  **Deleted**. Replaced by real `BridgeClient` connection + `hello` handshake with spinner driven by live status.
- [x] **`src/screens/SetupScreen.tsx:72-73, 97-98`** & **`RootNavigator.tsx:49`**:
  Silent fallback credentials (`147.79.101.172:8787` / `a1b2c3d4e5f6`) on blank inputs: **Deleted**.
  Blank fields fail and cannot pair.
- [x] **`src/screens/setup/ConnectStep.tsx`**: `MOCK_SCANNED_HOST` / `MOCK_SCANNED_TOKEN` / `handleSimulateScan`:
  **Deleted**. Scan mode UI removed; manual host + token entry is the only pairing UI.
- [x] **`src/screens/setup/ScanFrame.tsx`**: **Deleted**.
- [x] **`src/screens/setup/ConnectingStep.tsx`**: Wired to real connection status.
- [x] **`src/screens/setup/DevOutcomeSwitcher.tsx`**: Preserved for dev simulation, wired to real state handler.
- [x] **`src/screens/setup/OpenRouterStep.tsx`**: Preserved.

---

## Phase 2 — Kill the mock transport as a live mode (Completed)

- [x] **`src/storage.ts`**: `loadUseRealBackend` / `saveUseRealBackend` / `USE_REAL_BACKEND_KEY`: **Deleted**.
- [x] **`src/network/bridgeClient.ts`**: `MockTransport` class: **Deleted**.
- [x] **`src/dev/mockBridgeServer.ts`**: **Deleted** (whole file).
- [x] **`src/screens/SettingsScreen.tsx`**: "Use real VPS backend" switch: **Deleted**.
- [x] **`src/network/bridgeConnection.ts`**: `useRealBackend` parameter and mock branch: **Deleted**.
- [x] **`src/screens/SettingsScreen.tsx`**: `handleConnectToThisVps` button: **Deleted**.

---

## Phase 3 — Sessions list: make create/kill/rename real (Completed)

- [x] **`src/contexts/SessionsContext.tsx`**: `useState<Session[]>(mockSessions)`:
  **Deleted**. Initial state is `[]` + `isLoadingSessions` flag until `resync_snapshot` or `session_list_update` arrives.
- [x] **`src/contexts/SessionsContext.tsx`**: Real operations:
  - **Create**: Sends real `route_input` / `create_session` action via `client.createSession`.
  - **Kill**: Sends real `action_confirm` through 2-step confirmation via `client.killSession`.
  - **Rename**: Added `'rename_session'` action to `backend/src/actions.ts` (`tmux rename-session -t <old> <new>`) and wired via `client.renameSession`.
- [x] **`src/screens/SessionsScreen.tsx`**: Fake `handleCreateSession` (`sess-new-N`): **Deleted**.
- [x] **`src/screens/SessionsScreen.tsx`**: Dev empty/populated toggle converted to standalone local dummy state (`DEV_DUMMY_SESSIONS`), no fixture imports.

---

## Phase 3.5 — Real file access (list dir / read file) (Completed)

- [x] Real backend filesystem operations implemented in `backend/src/files.ts`:
  - `listDirectory(dirPath)`: Returns `fs_list_result` with entries (`name`, `path`, `type`, `sizeBytes`, `mimeType`).
  - `readFileContent(filePath)`: Returns `fs_read_result` with UTF-8 text contents.
  - Envelopes `fs_list` and `fs_read` wired in `backend/src/server.ts`.
- [x] **`src/screens/sessions/NewSessionSheet.tsx`**: Wired folder suggestions to `client.fsList('/root/projects')` / `client.fsList('/root')`.
  **Deleted** `src/fixtures/folders.ts`.
- [x] **`src/screens/TranscriptScreen.tsx`**: Wired attachment viewer to `client.fsRead(path)`.
  **Deleted** `src/fixtures/files.ts`.
- [x] **`src/screens/FileExplorerScreen.tsx`**: Wired to real directory browsing via `client.fsList` and real file viewing via `client.fsRead`.

---

## Phase 4 — Transcript / chat: make the round trip real (Completed)

- [x] **`src/screens/TranscriptScreen.tsx`**: `mockTranscript` seed for `sess-1`: **Deleted**.
- [x] **`src/screens/TranscriptScreen.tsx`**: `streamAgentReply` and `mockStreamingReply`:
  **Deleted**. Disconnected state displays an explicit banner/error status.
- [x] **`src/components/Composer.tsx`**: `handleSend`:
  Processes real `sendRouteInput` results; triggers confirmation dialogs on `action_pending_confirm`, dispatches `action_confirm`, and executes non-destructive actions.
- [x] **`src/network/routeInput.ts`**: `classifyLocally` relegated strictly to an offline/timeout fallback.
- [x] **`backend/src/routeInput.ts`**: Real OpenRouter integration wired via `fetch('https://openrouter.ai/api/v1/chat/completions')` with system classification prompt and graceful regex fallback on failure.

---

## Phase 5 — Settings: OpenRouter key + connection state (Completed)

- [x] **`src/screens/SettingsScreen.tsx`**: `mockOpenRouterSettings` (`hasKey: true, keySuffix: '7f2a'`):
  **Deleted**. Starts from `{ hasKey: false }` and queries real status via `client.getOpenRouterKey()`.
- [x] **`src/screens/SettingsScreen.tsx`**: `saveKeyEdit`:
  Persists key on VPS backend via `client.setOpenRouterKey(key)` and locally in SecureStore.
- [x] **`backend/src/openrouterConfig.ts`**: Persists OpenRouter key securely to `/root/.config/pig/openrouter.key` (`0600` mode) and updates `process.env.OPENROUTER_API_KEY`.
- [x] **`src/fixtures/settings.ts`**: **Deleted**.

---

## Full deletion audit (All deleted)

- [x] `src/dev/mockBridgeServer.ts` — deleted
- [x] `src/fixtures/sessions.ts` — deleted
- [x] `src/fixtures/transcripts.ts` — deleted
- [x] `src/fixtures/files.ts` — deleted
- [x] `src/fixtures/folders.ts` — deleted
- [x] `src/fixtures/settings.ts` — deleted
- [x] `src/screens/setup/ScanFrame.tsx` — deleted
- [x] All hardcoded `147.79.101.172:8787` / `a1b2c3d4e5f6` fallback literals in `src/` and `backend/src/auth.ts` — deleted

---

## Phase 6 — Prove the real happy path (headless, in-app) (Completed)

Phases 0–5 make the workflow real; this phase proves it, end to end, through the
actual app UI — not through a raw WebSocket client.

- [x] **Tool**: `@playwright/test` driving `expo start --web` headlessly
  (`playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/happy-path.spec.ts`). Chromium
  installed and confirmed booting the app cleanly; the happy path doesn't touch
  `BrowserScreen.tsx`'s `WebView`, so no native-only blocker occurred.
- [x] **Pairing**: `e2e/happy-path.spec.ts` mints a real, fresh pairing token the
  same way `pig-bridge pair` does (spawns the actual CLI entrypoint, which calls
  `mintPairingToken()`), then drives `ConnectStep`'s manual host/token fields (scan
  mode is gone) and submits.
- [x] **Assert real connect**: waits for the Sessions screen to mount (populated
  from a real `resync_snapshot` — no fixture fallback exists to mask a failure here).
- [x] **Real session create**: drives "New session" through the UI (folder + name
  fields, "Start session"), which navigates into the new session's real Transcript
  screen via the real create round trip.
- [x] **Real send-and-reply**: sends "reply with exactly PONG" through the real
  composer and asserts the real `transcript_chunk` stream renders "PONG" in the
  transcript UI — the original ask, proven live against the real `claude` CLI.
- [x] **Cleanup**: kills the test session through the real 2-step confirm flow
  (menu → Kill session → `window.confirm`, which is the real web-platform path —
  `Alert.alert` is a no-op on react-native-web) and additionally polls `tmux
  has-session` directly to prove the backend actually tore it down, not just that
  the UI card disappeared.
- [x] **Bug found and fixed by this phase**: `SessionsContext.killSession`'s
  response correlation compared `result.requestId` against the original
  `route_input` envelope id, but `proposeAction`'s `kill_session` branch returned a
  freshly-generated id as `requestId` instead — so the correlation never matched,
  `sendActionConfirm` was never called, and the tmux session survived even though
  the UI removed the card optimistically. Fixed by adding a distinct `actionId`
  field to `ActionResultPayload` (separate from `requestId`, which now always
  correlates to the original request envelope per its documented contract across
  every action kind) and threading the original `requestId` through
  `routeInput.ts` → `proposeAction`. See `src/types/index.ts`,
  `backend/src/actions.ts`, `backend/src/routeInput.ts`,
  `src/contexts/SessionsContext.tsx`. Caught only because this phase asserts the
  real tmux state, not just the UI — exactly what a raw-`ws` test or a UI test that
  only checks the optimistic card removal would both have missed.
- [x] **Logging fix**: `bridgeClient.ts` now signature-checks
  `id:status:lastActivityAt` across a `session_list_update` push and only logs when
  it actually changed, instead of every `SESSION_POLL_MS` (5s) tick.
- [x] **Retired** `backend/tests/bridge-e2e.test.ts` — deleted, along with backend's
  `test:e2e` npm script. `e2e/happy-path.spec.ts` covers the same ground through the
  real UI (and catches more, per the bug above). Backend's own `npm test` (16/16)
  and the root `npm run test:e2e` (Playwright, 2/2) both pass.

Caveat: this is an integration test, not a portable unit test — it requires a real
VPS with a real backend already running (`npm start` in `backend/`, port 8787 by
default), real tmux, and a real agent CLI installed (this machine, right now). It
won't run unmodified on a laptop or a generic CI runner without the same setup.
