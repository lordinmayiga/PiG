# PiG — Backend Service Setup Plan (SPEC.md §4)

This machine **is** the target VPS (confirmed: hostname `srv1924008`, public IP
`147.79.101.172`, `tmux` 3.4, `claude` CLI 2.1.258, `agy` (Antigravity) CLI,
Node 24, Python 3.12 all already present; no firewall active; nothing
currently listening except `sshd` on 22). So there's no separate "get SSH
access" step — the backend gets built and run right here.

## What we're building

Per SPEC.md §4, one service that does:
1. **Websocket bridge** — token-authed, speaks the envelope protocol already
   defined app-side in `src/types/index.ts` / `src/network/bridgeClient.ts`
   (`hello`/`resync_request`/`route_input`/`action_confirm`/`ping` up,
   `hello_ack`/`resync_snapshot`/`session_list_update`/`transcript_chunk`/
   `action_result`/`error`/`pong` down).
2. **tmux introspection** — `tmux list-sessions`/`list-windows` parsed for
   the Sessions screen.
3. **Agent process management** — launches `claude`/`agy` with
   `--output-format stream-json` inside a tmux window (for persistence),
   backend directly owns/pipes the subprocess and forwards its NDJSON events
   as `transcript_chunk`s (per the resolved 2026-09-02 ownership decision).
4. **`/route-input` LLM proxy** — holds the OpenRouter key server-side only,
   does prompt cleanup + command classification.
5. **Action executor** — kill/create/switch session, cd, etc., with a
   confirm round-trip for anything destructive.
6. **`pig-bridge pair`** — a CLI command that mints a one-time pairing token
   (10 min TTL) and prints a QR code encoding `{host, token}`, for the app's
   Setup screen to scan.

## Proposed layout

```
/root/projects/PiG/backend/
  src/
    server.ts            # ws server bootstrap, envelope router
    tmux.ts               # list-sessions/list-windows wrappers
    agentProcess.ts        # spawn claude/agy inside tmux, pipe stream-json
    routeInput.ts           # OpenRouter proxy (POST openrouter.ai/api/v1/...)
    actions.ts               # action executor + confirm state machine
    auth.ts                    # pairing token issue/verify, bridge-token check
  bin/pig-bridge.ts            # `pig-bridge pair` CLI entry
  .env                           # OPENROUTER_API_KEY, PIG_BRIDGE_PORT — gitignored
  package.json
systemd/pig-bridge.service       # unit file, installed to /etc/systemd/system/
```
Same repo, own `backend/` subtree with its own `package.json` — keeps one
`git push` covering app + backend, matches "single VPS, one dev machine"
reality. (Open question below if you'd rather split repos.)

## Phases

**1. Scaffold + auth**
- `npm init` in `backend/`, `ws` for the websocket server, `tsx`/`tsc` for
  running TS directly.
- `pig-bridge pair`: generates a random token, stores it (in-memory + short
  TTL) as pending, prints host:port + token as a QR (via `qrcode` npm pkg
  rendered to terminal) and as plain text fallback.
- Server's `hello` handler checks the token against pending/paired state,
  issues a longer-lived bridge credential on success (the pairing token
  itself is single-use/short-TTL; the app then stores a longer session
  token from Phase 5's `secureStorage.ts`).

**2. tmux introspection**
- Shell out to `tmux list-sessions -F ...` / `list-windows -F ...`, parse
  into the Session shape the app's fixtures already model
  (`src/fixtures/sessions.ts`/`src/types/index.ts` — reuse those shapes).

**3. Agent process management**
- `tmux new-window` running a small wrapper that execs `claude
  --output-format stream-json ...` (or `agy` equivalent), backend attaches
  to that pane's output via a pipe (not tailing a scrape — real stdout pipe,
  per the resolved ownership decision) and parses NDJSON events into
  `transcript_chunk` envelopes.

**4. `/route-input`**
- Needs your **OpenRouter API key** (see questions below) — held in
  `backend/.env`, read via `process.env`, never logged, never sent to the
  app. One call per composer submission: classify command-vs-prompt, clean
  up prompt text, return via `action_result`/prompt-routed envelope (matches
  the shape `src/network/routeInput.ts` already mocks app-side — this
  becomes the real implementation it gets swapped for).

**5. Action executor**
- Handles `action_confirm` envelopes: kill/create/switch session, cd. Kill
  requires the two-step confirm already modeled in the app's
  `Composer.tsx`/`ActionResult` types.

**6. Expose it**
- Bind the ws server to `0.0.0.0:<port>`.
- **TLS**: a phone app talking to a public-IP VPS over plain `ws://` sends
  the bridge token in cleartext on every reconnect — needs `wss://`. See
  open question below (domain vs self-signed vs accept plain-ws for now).
- **Firewall**: currently wide open (`ufw inactive`, iptables ACCEPT-all).
  Recommend enabling `ufw`, allowing only `22/tcp` (ssh) + the bridge port,
  denying everything else by default.

**7. Keep it running**
- `systemd` unit (`systemd` 255 is present) — `Restart=on-failure`,
  `WantedBy=multi-user.target` so it survives reboots and this Claude Code
  session ending. `journalctl -u pig-bridge` for logs.

## Decisions (confirmed with you)

- **Exposure**: plain `ws://` for now, no TLS — bridge token still required
  to connect, but cleartext on the wire. Revisit once the flow is proven.
- **Firewall**: enable `ufw`, allow only `22/tcp` (ssh) + the bridge port,
  deny everything else. I'll pick a port (default **8787**) and confirm it's
  free before binding.
- **OpenRouter key**: skipped for now. `/route-input` stands up but prompt
  cleanup/command-routing stays on the app's existing mock classifier until
  a key is added later (config-only change, no code change needed then).
- **Repo layout**: `backend/` subtree in this same repo.

## Sequencing & ETA

1. Scaffold `backend/` (package.json, ws server skeleton, tsconfig) — ~10 min.
2. Auth: pairing token + `pig-bridge pair` CLI (QR + plain text) — ~15 min.
3. tmux introspection module — ~10 min.
4. Agent process management (spawn claude/agy inside tmux, pipe stream-json
   → transcript_chunk) — ~20 min, the fiddliest piece since it needs a real
   `claude --output-format stream-json` session to test against.
5. `/route-input` stub (classifier-only, no OpenRouter call yet) — ~10 min.
6. Action executor (kill/create/switch + confirm) — ~15 min.
7. `ufw` firewall lockdown (22 + bridge port) — ~5 min, done carefully so an
   active SSH session never gets cut off mid-change.
8. systemd unit + enable on boot — ~10 min.
9. End-to-end smoke test: run `pig-bridge pair`, scan/paste into the app's
   Setup screen, confirm pairing → Sessions shows real tmux sessions.

**Total: ~1.5–2 hours** of session time, most of it steps 4 and 9 (real
process/tmux behavior, not just typing code). I'll build this myself now
that I'm confirmed to be on the actual target VPS — no separate access step
needed.
