# PiG — Project Spec (working notes)

A personal mobile app for managing coding-agent sessions (Claude Code, Antigravity) on your own VPS over SSH/tmux, without the terminal-passthrough lag of apps like Moshi.

---

## 1. Platform & stack

- **React Native + Expo** (managed workflow) — chosen because there's no existing codebase yet, and Expo removes most Android Studio/Gradle friction.
- Build/distribution: `eas build --platform android` → installable APK, no local Android Studio needed.
- Dev loop: Expo Go app + QR code + live reload on your Android phone.
- One backend service, self-hosted on your VPS (Node or Python) — handles the websocket bridge, tmux introspection, agent process management, and the LLM proxy. No separate relay server, no third-party hosted bridge.

## 2. What we explicitly ditched (from Moshi/competitors) and why

- **iOS-only features** — Face ID, iCloud sync, Apple Watch companion, Live Activities/Dynamic Island, App Store licensing. (Android-only target.)
- **Zellij / Herdr multiplexer support** — tmux only.
- **Tailscale / jump hosts** — you have a single VPS with a public IP; not needed.
- **moshi-hook-style daemon** — decided against a persistent host-side daemon; agent processes are launched/managed directly by the backend service instead.
- **Raw PTY passthrough as the primary interface** — this is the biggest departure. See §5.
- **Raw Terminal screen / any live PTY view** — decided 2026-09-02: no raw-terminal passthrough exists anywhere in PiG, not even as a fallback. See §5. (Note: this is narrower than it first was — rendering *code the agent sends in a message* is back in scope as of 2026-09-02, see §5. What's still cut is a live interactive terminal/PTY.)

## 3. Screens

Bottom tab bar order (decided 2026-09-02): **Browser | Sessions | Settings** — Sessions in the middle as the primary destination, Browser and Settings flanking it.

1. **Sessions** — single-column card list, Keep/Notes-style (not a grid — decided 2026-09-02). Tap to open, swipe/long-press to delete (with confirm) or rename, "+" to create new (choose agent + starting folder).
2. **Session Transcript** (pushed on top of a session, not a tab) — full-width, Claude-app-style layout (decided 2026-09-02, reversing the earlier "prose-only, no code" call — see §5): agent turns are full-width with no bubble background, a turn header (agent name + status dot + timestamp), and rich markdown including real monospace code blocks with a copy button. User turns stay visually distinct — right-aligned, tinted bubble. This is *not* a rendering of the tmux pane.
3. **Composer** — attached to the bottom of the transcript, chat-app style. Type or dictate; input is purely local state until you hit send (no network calls while typing). One LLM call on send both cleans up your prompt and (if applicable) routes environment commands. See §6. Also supports attaching images/files (see §6.1) via a paperclip button next to the input.
4. **Embedded Browser** — tabbed, native WebView-based (via `react-native-webview`, not an iframe — needed for real desktop/mobile UA switching and storage clearing). Refresh, hard refresh, clear local storage, tab switching.
5. **Settings** — VPS connection details, OpenRouter API key (never stored/called client-side — see §7), lock/security.
6. **File Explorer** (pushed on top of the transcript, decided 2026-09-02) — browses the session's working folder on the VPS: breadcrumb path bar, folders listed before files, tap a folder to descend, tap a file to open it in the same lightbox/file-viewer sheets used by transcript file chips. Reached via a folder-icon button in the transcript header. Resolves the open question in §12 about whether attachments writing into the working folder need any browsing UI beyond agent-surfaced chips.
7. **Initial setup / first run** (decided 2026-09-02) — shown instead of the tab bar whenever no VPS is paired yet. No separate welcome screen; opens straight on a **Connect** step: a QR-scanner view by default (scan a code printed by a `pig-bridge pair` command run on the VPS, encoding host + a one-time pairing token, valid 10 minutes) with an "Enter host & token manually instead" fallback link, and vice versa from the manual form. Both surfaces share a collapsible "Don't have a pairing token yet?" panel with the copyable setup command. Connecting shows a brief spinner, then either **Success** (host confirmed, "Continue") or an **error state** with distinct copy for the three failure modes — bad/unreachable host, bad or expired token, timeout — each with "Try again" back to the form, input preserved. After success, an **optional** OpenRouter key entry step ("Save & continue" or "Skip for now" — both proceed) — the key is never required to finish setup and can be added later in Settings. The flow ends by landing on Sessions in a genuine **empty state** ("No sessions yet — tap + to start your first session"), not the populated list. Mocked up in the PiG Screens artifact.

## 4. Backend service (runs on the VPS)

Single service responsible for:
- **Websocket bridge** — auth via token (not raw SSH exposed to the browser/app). Bridges the app to tmux/agent processes.
- **tmux introspection** — `list-sessions` / `list-windows` parsed into data for the Sessions screen.
- **Agent process management** — launches Claude Code / Antigravity with structured output flags (see §5), inside tmux for persistence, and streams their structured output back over the websocket.
- **LLM proxy endpoint** (`/route-input`) — holds the OpenRouter key server-side, does prompt cleanup + command routing (see §6 and §7).
- **Action executor** — carries out routed environment commands (kill/create/switch session, cd, etc.), with a confirmation round-trip required for anything destructive.

## 5. Why no PTY passthrough for the main interface

Moshi (and similar apps) forward a live PTY: every keystroke and scroll action is a round trip to the VPS, which redraws its terminal screen and sends that back — this is why it feels laggy/nauseating, especially on scroll and keyboard-open.

PiG instead treats the transcript like a chat app:
- Composer never sends anything until you hit send.
- Agent responses arrive as **discrete streamed data chunks**, not "screen redraws" — appended to local state, rendered as a normal scrollable list (zero network cost to scroll).

This is possible because **both target agents support structured streaming output modes**, so the backend doesn't need to scrape/infer message boundaries from a terminal pane:
- **Claude Code**: `--output-format stream-json`
- **Antigravity (`agy`)**: `--output-format stream-json` (typed NDJSON event stream)

The backend launches agents with these flags (inside tmux, for persistence if the app disconnects), reads the structured event stream, and forwards it over the websocket as chat-style chunks tagged with role/content type. This also naturally gives the "scroll through everything sent on either side" transcript view.

**Resolved 2026-09-02:** the backend directly owns/pipes the agent subprocess (tmux just keeps it alive in the background), rather than the agent running as a normal interactive tmux command the backend tails separately. The second option's only advantage was "you could also attach to it by hand like a normal terminal session" — moot now that PiG has no raw-terminal/manual-attach use case at all (see §2).

**Reopened 2026-09-02:** code blocks and diffs the agent emits now render as real monospace code (Roboto Mono, flat/no syntax highlighting, copy button per block) — the transcript takes on a full-width, Claude-app-style layout instead of chat bubbles. See `pig-markdown-rendering` and `pig-typography` for the current, authoritative rules; this section's original "no code, ever" framing is superseded. What's still cut is a *live interactive terminal* (raw PTY) — that remains out of scope.

## 6. Composer: prompt cleanup + command routing

One LLM call (via OpenRouter, see §7) on every composer submission does double duty:
- **Classifies intent**: is this an environment command ("kill this session," "cd to project X," "start a new session with Antigravity") or an actual prompt for the agent?
- **Environment commands** → routed to a structured action executed by the backend. **Destructive actions (kill/delete) always require a confirm step before executing** — decided explicitly, no silent execution.
- **Agent prompts** → cleaned up (using context like available skill names) and then sent to the live agent session.
- A couple of hardcoded fast-path buttons (e.g. kill session, new session) may sit alongside the composer for the most common actions, to avoid an LLM round trip for simple taps.

Dictation uses the Web Speech API / RN equivalent, feeding into the same composer box.

## 6.1 Attachments, files, and download (decided 2026-09-02)

- **What you can attach**: general — images and arbitrary files (PDFs, zips, docs), not images-only. Picked from the composer's paperclip button (photo/camera vs. file picker).
- **Where it goes**: uploaded into the session's working folder on the VPS, so the agent can actually act on it (open/edit/run against it) — not just see it once as inline LLM context.
- **Agent-surfaced files**: the agent can also push an output file (a report, a generated doc) into the transcript as a viewable/downloadable chip — this isn't limited to echoing back what you sent.
- **In-chat file viewer**, split by type:
  - Image → full-screen lightbox.
  - Text/code file → rendered like a code block (monospace, read-only).
  - Anything else (PDF, zip, binary) → name/size/type only, no render attempt — Download is the only action. A real in-app PDF renderer was explicitly cut; Download + share-sheet covers that need.
- **Download mechanism**: hands off to the Android OS share sheet ("Save to…") rather than writing straight to the Downloads folder — avoids broad storage permissions, matches platform convention.

## 7. LLM provider

- **OpenRouter**, not a direct Anthropic key.
- Key is held **server-side only**, on the VPS backend, behind the `/route-input` endpoint. Never shipped in the app bundle — anything client-side is extractable.

## 8. Connection resilience

tmux/agent processes keep running on the VPS regardless of your phone's connection. The app's job on reconnect:
- Auto-reconnect with backoff.
- On reconnect, **resync via a fresh state fetch** (not stream replay) — avoids accumulating a broken diff.
- Outgoing actions queued or clearly discarded during a drop, with a visible "disconnected" indicator — no silent queuing of risky commands.

## 9. Embedded browser

Needs a **native WebView** (`react-native-webview`), not an iframe, because:
- Desktop/mobile mode = UA override, a page-level iframe can't control this; WebView has a direct `userAgent` prop.
- Storage clearing / hard refresh needs direct WebView APIs; cross-origin iframes are sandboxed from the parent page.
- Some sites block iframing outright via headers.

Features: tabs with easy switching, refresh, hard refresh, clear local storage, desktop/mobile toggle.

## 10. Testing strategy

No direct Playwright equivalent for RN (RN compiles to native views, not a browser). Layered approach instead:
- **Unit/component**: Jest + React Native Testing Library (RNTL) — equivalent to Jest + RTL on web.
- **E2E**: Maestro (YAML-based flows, low setup friction — chosen over Detox given no prior RN experience) once a working build exists.
- Recommendation: hold off on tests until core flows (SSH connect, session switch, composer routing) work, then add Maestro flows for the ones most likely to break silently.

## 11. User journeys to support / test

**Happy path**
Open app → Sessions → tap session → transcript loads with scrollback of prior exchanges → scroll to review → dictate or type new message → composer shows cleaned-up version → send → transcript streams the agent's markdown response live, formatted as it arrives.

**Session lifecycle**
- First-time setup: no sessions exist, VPS just connected — empty state, create first session.
- Create a session with a specific agent (Claude Code vs Antigravity) and starting folder.
- Kill a session via composer routing → confirm dialog → success.
- Reconnect to a session that's been running unattended for hours (large scrollback resync).

**Connection resilience**
- Open app with no signal — clear offline state, no hang.
- Connection drops mid-agent-response — transcript shows a "reconnecting" marker, then resumes without losing the tail of the stream.
- Switch from wifi to cellular mid-session.

**Transcript/data**
- Very long transcript (weeks of history) — scrollback performance, possible pagination/lazy-load.
- Agent response containing a large code block — renders as a real monospace block with a copy button (reopened 2026-09-02); prose portions of the response render normally alongside it.
- Copy a message, or a single code block, out of the transcript.

**Attachments & files** (added 2026-09-02)
- Attach a photo and a general file to the same message, send, and see both echoed as chips in your turn.
- Open an image you sent in the lightbox; open a text file you sent in the monospace viewer.
- Agent surfaces an output file (e.g. a report) mid-conversation — tap it, view or download it without leaving the transcript.
- Attempt to preview a file type with no in-app renderer (PDF, zip) — viewer correctly falls back to metadata + Download instead of trying and failing to render it.
- Download a file — OS share sheet appears, pick a destination, confirm it lands (toast).

**Composer/LLM routing**
- Ambiguous input that could be a command or a prompt ("clean up the tests") — check for misrouting and recovery/override path.
- Dictation in a noisy environment / mid-sentence correction.

**Browser**
- Open a link the agent gave you (e.g. a preview server URL) directly into a browser tab.
- Multiple tabs open, switch between them without losing state.

## 12. Still open / not yet decided

- Exact wire format for the websocket protocol (message envelope, event types).
- Local storage schema for transcripts (how much history is cached on-device vs. re-fetched from the VPS).
- ~~**Initial setup / first-run flow**~~ **Resolved 2026-09-02** — see §3.7 for the full step sequence. Credential is host + bridge auth token (§4), obtained by scanning a QR code printed by a VPS-side `pig-bridge pair` command (manual paste as a fallback); OpenRouter key entry is an optional step in the same flow, skippable to Settings; failed connection attempts get distinct copy for bad host / bad token / timeout, each retryable without losing input.
- ~~Since attachments now write into the session's working folder (§6.1): does the app need any UI for *browsing* that folder's contents beyond what the agent surfaces as chips?~~ **Resolved 2026-09-02**: yes — see the File Explorer screen, §3.6.
