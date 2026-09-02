# PiG — React Native Project Setup Plan (high level)

Companion to SPEC.md (product) and DESIGN.md (design system). This is the sequencing
for going from an empty repo to a running Expo app with the mockup's screens wired up
against mock data — no live backend yet. Detailed step-by-step tasks get broken out
per phase when we start executing it.

---

## Phase 0 — Repo & tooling

- `git init`, initial commit of the existing docs (SPEC.md, DESIGN.md, the mockup
  reference), `.gitignore` for Expo/Node.
- Confirm package manager: **npm** (already on the machine, no reason to add pnpm/yarn
  for a solo project).
- Confirm Expo account / EAS project linkage happens here too (needed later for
  `eas build`), but doesn't block local dev.

## Phase 1 — Expo app scaffold

- `create-expo-app` with the TypeScript template.
- **Navigation library: React Navigation** (confirmed with user 2026-09-02, overriding
  the earlier Expo Router lean) — bottom tabs + native stack, hand-wired rather than
  file-based routing.
- Android-only config in `app.json`/`app.config.ts` (no iOS build target); edge-to-edge
  enabled per DESIGN.md's Android 15 note.
- Install `expo-dev-client` and produce a first dev-client build here rather than
  waiting for Phase 7 — see that phase for why (Expo Go version drift / native deps).

## Phase 2 — Design system foundations

Port DESIGN.md's locked decisions into code before any real screen work, so every
screen after this point pulls from the same source instead of hardcoding values:

- **Theme tokens** — colors (light/dark), spacing scale, radius scale, as a typed
  theme module; system/light/dark switching.
- **Typography** — Onest via `@expo-google-fonts/onest` (400/500/600/700), font-scale
  cap at 1.3×.
- **Icons** — `lucide-react-native` installed, a thin wrapper if useful for consistent
  sizing/stroke.
- **Motion** — Reanimated 3 installed + babel plugin configured; a couple of shared
  primitives (press scale, fade/slide-in) so screens don't each reinvent them.

## Phase 3 — Navigation shell

- Bottom tabs: Browser | Sessions | Settings (per the 2026-09-02 reorder).
- Pushed-stack routes on top of Sessions: Transcript → File Explorer.
- First-run Setup as a route that gates the tab shell entirely (per the resolved
  first-run flow) — until a VPS is paired, this is the only thing rendered.

## Phase 4 — Screen builds against mock data

Build in this order, matching the mockup and unblocking the most first:

1. **First-run Setup** — all steps from the mockup (QR/manual connect, error states,
   success, optional OpenRouter key), driven by local mock state, no real websocket yet.
2. **Sessions** (including the empty state) + New Session sheet.
3. **Session Transcript** + Composer (markdown rendering, code blocks, file chips —
   all against fixture data).
4. **File Explorer**.
5. **Settings** (VPS connection row, OpenRouter key row, lock/security).
6. **Embedded Browser** (WebView tab strip) — lower priority, most self-contained.

Each screen ships from the same fixture data shape the mockup already uses, so wiring
the real backend later is a data-source swap, not a rebuild.

## Phase 5 — Local state & storage

- Decide state management: plain React Context + hooks is almost certainly enough at
  this app's size — avoid pulling in Redux/Zustand without a concrete reason.
- `expo-secure-store` for the VPS host + bridge token (this is a credential, not cache).
- A storage layer for cached transcripts — blocked on the still-open "local storage
  schema for transcripts" question in SPEC.md §12; stub it behind an interface so the
  screen work in Phase 4 isn't blocked on resolving it.

## Phase 6 — Networking layer (stubbed against a fake backend)

- Websocket client wrapper: connect, auto-reconnect with backoff, resync-on-reconnect
  (per SPEC.md §8) — built against a local mock server or an in-memory fake first.
- `/route-input` proxy client for composer submissions.
- This phase is blocked on the still-open **websocket wire format** decision
  (SPEC.md §12) — needs resolving before this becomes more than a stub.

## Phase 7 — Dev workflow & build

- **Custom dev client (`expo-dev-client`), not plain Expo Go**, for the day-to-day
  live-reload loop — actually stood up back in Phase 1, kept here as the ongoing
  workflow: PiG's native deps (WebView, camera/QR scan) plus avoiding Expo Go's
  auto-update-breaks-old-SDK-projects problem both argue for it from the start.
  One `eas build --profile development` produces an installable dev-client APK pinned
  to the project's own SDK version; `npx expo start --dev-client` connects to it like
  Expo Go but without the shared-app version-drift risk.
- `eas build --platform android` (production profile) for installable release APKs
  once there's something worth installing outside the dev loop.

## Phase 8 — Testing

- Stand up whatever SPEC.md §10 settles on (not yet detailed) once there's real code
  to test — premature to scaffold test infra against zero components.

---

## Open items that will block later phases (not this plan)

- **Websocket wire format** (SPEC.md §12) — blocks Phase 6 going past a stub.
- **Local storage schema for transcripts** (SPEC.md §12) — blocks Phase 5's storage
  layer going past a stub.
- **Agent subprocess ownership model** (SPEC.md §12) — backend-side, doesn't block
  any app-side phase above, but blocks the backend service itself.
- **Navigation library confirmation** (Phase 1) — leaning Expo Router, not yet
  confirmed with the user.

None of these block starting Phase 0–4; they block specific later phases going from
stub to real.
