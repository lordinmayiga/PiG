# PiG Design Decisions Log

Running record of design decisions, kept live as we work through the design system. See SPEC.md for the product spec.

## Direction (locked)
- Treatment: **notes-app**, not terminal — soft, calm, content-first.
- **No terminal, no code rendering, anywhere in the app** (decided 2026-09-02) — the user never views raw code or a live terminal through PiG; something else handles that. This removed the Raw Terminal screen from SPEC.md entirely and resolved the agent-subprocess-ownership question in SPEC.md §5 (backend directly owns/pipes the subprocess — the "attach by hand" advantage of the alternative no longer applies with no terminal use case).
- Theme order: **light-first**, with a considered dark mode (not an auto-invert).
- Icons: **Lucide** (`lucide-react-native`) everywhere. No emojis in the UI.

## Typography (locked)
- UI typeface: **Onest** (Google Font) — open alternative to Samsung's proprietary SamsungOne/One UI Sans, closest honest match to the Samsung Notes look.
- Weights bundled: **400/500/600/700**.
- **No monospace face** — moot now that code/terminal is fully out of scope.
- Android system font-scaling: **supported, capped at 1.3×** — keeps it genuinely accessible without every screen needing a redesign for uncapped scale.

## Layout & spacing (locked)
- Spacing scale (4px base): `4, 8, 12, 16, 24, 32, 48, 64`. Card padding 16px, screen margins 20px, list-item gap 12px.
- Corner radius by role: chips/badges 8px, cards 16px, composer pill/primary buttons 24px (fully rounded), bottom-sheet top corners 24px.
- Touch targets: 48dp minimum on every tappable element (matches both Android convention and WCAG's 44px-equivalent floor).
- Android 15 enforces edge-to-edge by default — real safe-area-inset handling required on composer bar, bottom tab bar, and session cards, or content clips under system bars.

## Navigation / information design (locked)
- Bottom tab bar: **Sessions | Browser | Settings**. Transcript and Composer are pushed on top of a session (nested stack), not top-level tabs.
- Sessions screen: single-column card list (Keep/Notes-style), not a grid.
- Status always encoded as dot + text label together, never color alone.
- Pull-to-refresh triggers manual resync on top of automatic reconnect-resync.

## Motion (locked)
- Single motion library: **Reanimated 3**.
- Uses: native stack push/pop (session → transcript), micro press feedback (scale ~0.96 + opacity), staggered fade/slide-in on session-card load (~30ms offset), message-arrival fade + 8px slide-up, status-dot pulse (reconnecting only), typing-indicator dot pulse while awaiting the agent's first streamed token.
- Kept subtle throughout — notes-app restraint over flashy motion.

## Loading-state strategy (locked)
Decision rule: **skeleton** when content shape is known and load is likely >500ms (Sessions grid first load, transcript scrollback resync); **spinner** when duration is short/unknown with no content shape (app cold-start/VPS handshake, action confirmations); **typing indicator** (not a spinner) while awaiting the agent's first response chunk. No loader renders before a 300ms delay, to avoid flicker on fast loads.

## Accessibility checklist (from research, build-time, not a design decision)
- Every icon-only button needs an `accessibilityLabel` for TalkBack (send, mic, kill-session, more-menu, etc.).
- Respect `prefers-reduced-motion`-equivalent OS setting for the Reanimated effects above.

## Color palette (locked)

Base (user-provided):

| Name | Hex | Role |
|---|---|---|
| Velvet Orchid | `#7e2e84` | Primary accent, light mode |
| Snow | `#fbf5f3` | Light-mode canvas |
| Muted Teal | `#8daa9d` | Success/connected — fill & dot only, never text (2.33:1 on Snow) |
| Onyx | `#0f0e0e` | Ink / dark-mode canvas |
| Rosy Copper | `#bf4e30` | Destructive, light mode — buttons/large text only (4.47:1 on Snow) |

Extended (generated + validated, all contrast figures computed via WCAG relative luminance):

| Name | Hex | Role |
|---|---|---|
| Velvet Orchid — Dark | `#cd89d2` | Primary accent, dark mode (7.44:1 on Onyx) |
| Rosy Copper — Dark | `#da846c` | Destructive, dark mode (6.89:1 on Onyx) |
| Amber Ochre — Deep | `#8b6118` | Warning text/icon, light mode (5.09:1 on Snow) |
| Amber Ochre | `#d2962d` | Warning text/icon, dark mode (7.48:1 on Onyx) |
| Neutral 100 | `#f2ebe8` | Card fill on Snow |
| Neutral 200 | `#e4dad5` | Borders/dividers, light |
| Neutral 300 | `#cbbdb6` | Idle status dot, light |
| Neutral 400 | `#a99a93` | Secondary text, dark mode |
| Neutral 500 | `#85756f` | Placeholder text |
| Neutral 600 | `#635550` | Idle status dot, dark |
| Neutral 700 | `#453b37` | Secondary text, light mode |
| Neutral 800 | `#2a2321` | Borders/dividers, dark |

Neutral ramp is warm-biased off Snow's own undertone (not flat gray) — a cooler, Velvet-biased alternative was considered and dropped.

Proposal reviewed as an artifact with light/dark Sessions and Transcript mockups: https://claude.ai/code/artifact/212f2cc6-4ed9-45cf-8446-5c345184ebd2

## Surface elevation tokens (locked)

| Token | Light | Dark |
|---|---|---|
| `surface.canvas` (page bg) | `#fbf5f3` Snow | `#0f0e0e` Onyx |
| `surface.card` | `#ffffff` | `#1c1917` |
| `surface.elevated` (sheets/modals) | `#ffffff` + scrim `rgba(15,14,14,.4)` behind | `#372f2c` (new step, between Neutral 700/800) |
| `border` | `#e4dad5` (Neutral 200) | `#2a2321` (Neutral 800) |

Light mode can't go lighter than white, so elevation there is carried by scrim + shadow rather than a color step — standard practice.

## Markdown viewer — code-fence treatment (locked)

The MD viewer replaces any fenced code block from an agent response with a single inert, muted inline row — never renders code text: `[Lucide Code icon] · "N lines — reviewed elsewhere"`, styled in Neutral-500/400, no monospace, no expand/tap affordance. Surrounding prose in the same response renders normally.

## App icon (placeholder — concept deferred)

Distinct from in-app iconography (locked: Lucide throughout). Real concept (literal pig motif vs. abstract mark vs. wordmark lettermark) deferred to later — for now, ship a **plain "PiG" text placeholder** as the home-screen/notification/splash icon (Onest, bold, Velvet Orchid on a Snow/Onyx adaptive-icon background per theme). Revisit before any real release; must be redone as a proper **Android adaptive icon** (foreground + background layers) once a concept is picked.

## Microcopy/voice (locked patterns, expand case-by-case as new screens are designed)

- Buttons: "New session", "Send", "Kill session", "Retry" — plain verbs, no "Submit"/"Delete"/generic "OK".
- Kill-session confirm: "Kill this session?" / "This stops the agent and closes the session. Anything not saved elsewhere will be lost." / `Cancel` · `Kill session`.
- Empty state (no sessions): "No sessions yet" / "Start one to begin working with an agent." / `New session`.
- Reconnecting banner: "Reconnecting…" (non-modal, self-dismissing).
- Offline: "You're offline. Actions won't send until you're back."
- Error (VPS unreachable): "Couldn't reach your VPS. Check your connection and try again." / `Retry`.
- Kill success toast: "Session killed."
- Composer placeholder: "Message the agent…"
- Misrouted input recovery: inline note under the sent bubble — "Sent as a command." with `Undo` — not a blocking dialog.

## Outstanding questions (design-focused only)

1. Local storage schema for transcripts (on-device cache depth vs. re-fetch from VPS) — borderline design/engineering; revisit once we're past visual design.

## Parked (engineering, not design)
- Websocket wire format (message envelope, event types) — internal protocol detail, no visual/UX surface.
- How the backend decides *what* to summarize from a code-heavy response before it reaches the MD viewer — the viewer's rendering rule is locked above; the summarization logic itself is a backend/prompt-engineering task, not a design one.
