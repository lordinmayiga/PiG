# Implementation Plan: PiG Real-Data Thinking Stream, Terminal Command Sync, & E2E Testing

This plan specifies the architecture and implementation for:
1. **Real-Data Backend Architecture (Subprocess Piped NDJSON, Live `agy` Model Discovery, & Token Usage Accumulator)**
2. **Dynamic Growing 7-Line Thinking Stream with Thought Syntax Highlighting & Auto-Collapse**
3. **Zero-Lag Two-Tier Slash Command Synchronization** (`/model` and `/usage` with real backend data)
4. **On-Demand File Viewer & Attachment Chips** (backed by real `/files/raw` tickets & `fs_read`)
5. **Exact E2E Playwright Tests** executed strictly in **Antigravity (`agy`)** using **Gemini 3.8 Flash (`--model=gemini-3.8-flash --effort=low`)**.

---

## 1. Backend Real-Data Architecture & Protocols

To ensure all features work with **100% real data right out of the bat** (no hardcoded mocks in production paths):

### A. Real Model Discovery via Live `agy models`
- **Subcommand**: The bridge executes `agy models` asynchronously to discover all models installed on the VPS:
  - `gemini-3.8-flash-low`, `gemini-3.8-flash-medium`, `gemini-3.8-flash-high`
  - `gemini-3.7-flash-low`, `gemini-3.7-flash-medium`, `gemini-3.7-flash-high`
  - `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, etc.
- **Caching**: Output is cached in memory with a 60-second TTL to guarantee 0ms response latency on slash search queries.
- **Configurable Session Model**: `ActiveSessionContext` in `sessionRegistry.ts` stores the session's active model (`default: 'gemini-3.8-flash'`) and reasoning effort (`default: 'low'`).
- **Bridge Envelopes**:
  - App -> Bridge: `set_session_model` `{ sessionId, model, effort }`
  - Bridge -> App: `set_session_model_ack` `{ ok: true, model, effort }`

### B. Real Token Usage Accumulator (`/usage`)
- **NDJSON Event Ingestion**: `agy` emits real token usage statistics on each `step_update` and terminal `result` event:
  ```json
  "usage": {
    "input_tokens": 13896,
    "output_tokens": 606,
    "thinking_tokens": 438,
    "cache_read_tokens": 0,
    "total_tokens": 14502
  }
  ```
- **Live Accumulation**: `sessionRegistry.ts` accumulates token consumption per session across turns (`inputTokens`, `outputTokens`, `thinkingTokens`, `cacheReadTokens`, `totalTokens`).
- **Real-Time Push & Query**:
  - Emitted directly on `TranscriptMessage.usage` and `TranscriptChunkPayload`.
  - Available over the bridge via `command_search` or `session_usage_request`.

### C. Live Thinking Stream & Thought Extraction
- **Stream Parser Separation**:
  - `parseAntigravityLine` in `agentProcess.ts` inspects `step_update`:
    - Separates reasoning/thinking tokens (detected via `<thought>` delimiters or `step_type: 'thought'`) from the public answer `text_delta`.
    - Streams `message.thinking` deltas during the reasoning phase.
    - Transitions to streaming `message.content` the instant answer deltas arrive.
- **CLI Flags for Antigravity**:
  - Always spawns `agy` with:
    `--output-format stream-json --dangerously-skip-permissions --model=gemini-3.8-flash --effort=low --print=<prompt>`

### D. Zero-Lag Two-Tier Slash Command Bridge Event
- App -> Bridge: `command_search` `{ query: string, sessionId?: string }`
- Bridge -> App: `command_search_result` `{ query, commands, models?, usage? }`
- **Tier 1 (Instant 0ms)**: Client filters its memory cache on every keystroke.
- **Tier 2 (150ms Debounce)**: Bridge checks session registry for live usage and active models list, syncing live state back to the sheet.

---

## 2. Dynamic Growing Thinking Stream with Syntax Highlighting

### Dynamic Growth & Rolling Window (Reanimated 3)
- **Initial State**: Fits 1 line (~22px) when first thought delta arrives.
- **Growth Phase (Lines 1 → 7)**: Smoothly expands container height (`duration: 180ms`, cubic ease per `pig-motion`).
- **Rolling Teleprompter (Lines 8+)**: At 7 visible lines, incoming lines smoothly translate upward (`translateY: -10px`, `opacity: 0`, `marginTop: -22px`) while the new line enters at bottom (`opacity: 0 -> 1`, `translateY: 8 -> 0`). Maximum locked height is 7 lines.
- **Auto-Collapse**: On arrival of the first non-thought answer token, the thinking box collapses to `[ (Brain Icon) Thought for Xs  ▾ ]` within 200ms.
- **On-Demand Inspection**: Tapping the header expands the full thought trace with smooth vertical scrolling.
- **Theme Support**: Implements both Light and Dark mode tokens strictly from `pig-color-system` (`--canvas`, `--card`, `--neutral-100`, `--accent`, `--accent-tint`, `--warning`).

### Thought Syntax Highlighting Tokens
- **Action Verbs** (`Checking`, `Inspecting`, `Evaluating`, `Testing`, `Turn complete`): Bold primary ink (`var(--ink)`, Onest 600).
- **File Paths & Folders** (`.pig-output/`, `backend/src/server.ts`, `.md`, `.ts`): Muted Velvet Orchid pill (`var(--accent)` with `var(--accent-tint)` background, Roboto Mono).
- **Numbers & Durations** (`60s`, `1.10`, `8787`, `7 lines`): Amber Ochre (`var(--warning)` / `#8b6118` light, `#d2962d` dark, Roboto Mono).
- **Code & Identifiers** (backtick identifiers `` `mintRawFileTicket` ``): Flat neutral code-surface background (`var(--code-surface)` with `var(--border)`).

---

## 3. Terminal Slash Command Synchronization & UI

### Real Composer Updates
- Added the **`/`** button directly next to the **`+`** button in `Composer.tsx`.
- Typing `/` into the composer or tapping the `/` button immediately opens the `SlashCommandOverlay`.

### Zero-Lag Command Overlay (`SlashCommandOverlay.tsx`)
- Instant filtered listing of commands (`/model`, `/usage`, `/cost`, `/compact`, `/clear`, `/doctor`).
- Debounced bridge query fetching:
  - **`/model` picker**: Real models fetched from `agy models` on the VPS. Selecting updates the session model badge.
  - **`/usage` view**: Live token metrics card displaying real Input, Output, Thinking, and Cache Read tokens.

---

## 4. On-Demand File Viewer & Attachment Chips

- **Real HTTP Streaming**: Uses `fs_raw_url_request` to obtain authenticated tickets (`/files/raw?path=...&token=...`) for zero-bloat file inspection.
- **Preview / Raw Toggle**: Markdown files support live tab toggle between formatted preview and raw text.
- **Light & Dark Theme**: All sheet surfaces use `colors.elevated`, `colors.border`, `colors.ink`, `colors.canvas`.

---

## 5. Strict E2E Test Suite (Playwright)

Executed strictly in **Antigravity (`agy`)** with model `gemini-3.8-flash` and effort `low`.

### Test 1: Antigravity Thinking Stream & Auto-Collapse
1. Spawns `agy` reasoning turn.
2. Asserts thinking container starts at 1 line and grows dynamically to 7 lines.
3. Asserts rolling window maintains 7 visible lines.
4. Asserts thought syntax highlighting is applied.
5. Asserts thinking container auto-collapses to `Thought for Xs [▾]` when the answer begins streaming.
6. Asserts expanding the collapsed header shows the complete scrollable thought trace.

### Test 2: Slash Command Search & Terminal Sync (`/usage` and `/model`)
1. Taps `/` button in composer.
2. Verifies preloaded commands render immediately.
3. Searches `"model"`, clicks `/model`, confirms real models from `agy models` appear, and selects one.
4. Searches `"usage"`, clicks `/usage`, confirms live token breakdown card renders with real numbers.

---

## 6. Work Breakdown & Parallel Execution Strategy

| Track | Task | Files | Dependencies |
| :--- | :--- | :--- | :--- |
| **Track A (Backend)** | Real Model Discovery, Usage Accumulator, & Command Sync Handler | `backend/src/agentProcess.ts`<br>`backend/src/sessionRegistry.ts`<br>`backend/src/server.ts`<br>`src/types/index.ts` | None |
| **Track B (Frontend UI)** | Dynamic Thinking Stream (1-7 lines) + Syntax Highlighting | `src/components/ThinkingAccordion.tsx`<br>`src/utils/thoughtHighlight.ts`<br>`src/theme/colors.ts` | Track A types |
| **Track C (Frontend UI)** | Slash Command Overlay (`/model`, `/usage`) + Composer `/` Button | `src/components/Composer.tsx`<br>`src/components/SlashCommandOverlay.tsx`<br>`src/screens/TranscriptScreen.tsx` | Track A types |
| **Track D (E2E Tests)** | Playwright E2E Suite for Thinking Stream & Slash Sync | `e2e/antigravity-thinking-slash.spec.ts` | Tracks A, B, C |

**Estimated Time to Complete (ETA)**: ~25 - 30 minutes with parallel track execution.
