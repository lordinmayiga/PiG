# Phase 8 — Chat attachments, fullscreen file preview, MD rendering, open-in-browser

Plan only — nothing in this doc is implemented yet. Written after Phase 6/7
(FAKE_DATA_ELIMINATION_PLAN.md) landed the real backend; scoped to what's
left from the latest ask. Two bugs from that ask (duplicate breadcrumb key,
clipped composer Send button on Android) are already fixed on this branch,
independently of this plan.

## Starting point (what already exists, so this doesn't re-plan it)

- Composer already supports attaching a photo or a file (`Composer.tsx`,
  `expo-image-picker` / `expo-document-picker`), shows pending chips, and
  threads `attachmentIds` through `sendRouteInput`.
- `FileAttachmentChip` already renders attachments inline on both user and
  agent transcript turns, and opens `FileViewerSheet` on tap.
- `FileViewerSheet` already exists as a shared sheet (transcript chips +
  File Explorer), split by kind: image → lightbox, text → monospace
  read-only scroll view, other → metadata + stubbed Download toast.
- Transcript layout is already full-width, no-bubble for agent turns, with
  `MarkdownBody` rendering headings/bold/italic/inline-code/links/lists/
  blockquotes/fenced code blocks with a copy button — i.e. the
  "Claude-Code-app-style" layout the ask describes is already the built
  design, not a redesign. Item 3 below is a verification/polish pass, not
  a rebuild.
- **Not built at all today**: nothing server-side ever attaches a file to
  an agent-authored transcript message — `agentProcess.ts` has zero
  attachment handling. The chip UI only ever fires today for files *you*
  sent, never one the agent produced. Item 5 covers this from scratch.
- **Not built at all today**: no HTTP file-serving route on the backend —
  `server.ts` only speaks the bridge WebSocket protocol. "Open in
  browser" (the new ask) needs one; see item 4.

---

## 1. Fullscreen file preview with an expand icon

**Files**: `FileViewerSheet.tsx`, `FileExplorerScreen.tsx`, `TranscriptScreen.tsx`

- Add a `fullscreen` boolean to the sheet's own state (not a prop from the
  caller) so either entry point (transcript chip or File Explorer row) can
  reach it the same way.
- Non-image kinds (`text`/`other`) currently render as a bottom sheet
  capped at `maxHeight: '80%'`. Add an expand icon (`Maximize2` from
  lucide, top-right of the sheet header, next to the existing close `X`)
  that animates the sheet to fill the screen (drop the `maxHeight` cap,
  animate `borderTopLeftRadius`/`borderTopRightRadius` to 0, expand the
  code/text `ScrollView`'s `maxHeight` to fill available height) instead
  of the current fixed 420px inner scroller.
- Image kind is already effectively fullscreen (`styles.lightbox` fills
  the screen) — no expand icon needed there, but for consistency add the
  same top-right icon row (currently just the close `X`) so the affordance
  location doesn't shift between file kinds.
- Dismissing from fullscreen: reuse the existing drag-to-dismiss gesture,
  but only past a raised distance threshold (fullscreen sheets shouldn't
  dismiss on a small accidental drag) — or add an explicit collapse icon
  that un-expands rather than closes. Needs a product call: does
  drag-down from fullscreen collapse back to sheet, or close entirely?
  (Recommend: collapse back to sheet first, second drag-down closes —
  matches how most native fullscreen sheets behave.)
- File Explorer's usage is already wired through the same component, so no
  extra plumbing there beyond the shared sheet gaining the feature.

## 2. MD file previewer with real formatting

**Files**: `FileViewerSheet.tsx`, `MarkdownBody.tsx` (reused, not rewritten)

- Today every `kind: 'text'` file — `.md` included — renders as raw
  monospace text via the same code-block-style `ScrollView`/`Text`.
- Detect markdown by extension (`.md`/`.markdown`) on the `ViewableFile`
  passed in (both call sites already have `name`/`mimeType` available —
  `files.ts`'s `MIME_TYPES` already maps `.md` → `text/markdown`, so the
  sheet can key off `mimeType === 'text/markdown'` without adding new
  wiring) and render through `MarkdownBody` instead of the flat
  monospace view, inside the same scroll container.
- Keep a "view raw" toggle (small text button in the sheet header) so you
  can still see the literal markdown source — useful for editing intent,
  and reuses the existing monospace renderer as the fallback view instead
  of writing a second one.
- No new dependency — `MarkdownBody` is already the hand-rolled renderer
  used for agent turns; this item is "point FileViewerSheet at it for one
  more case," not new parsing logic.

## 3. Verify / polish the Claude-Code-style full-width chat layout

**Files**: `TranscriptScreen.tsx`, `MarkdownBody.tsx`, `CodeBlock.tsx` (no changes expected without findings)

The ask says responses read "like another chat, taking up only a fraction
of the width" — the current code already does full-width, no-bubble agent
turns (verified while investigating the bugs above: `TranscriptRow`'s
agent branch has no bubble background and `agentTurn: { width: '100%' }`).
So this item is:
- Drive a real multi-turn conversation through the actual backend/agent
  (as done to reproduce the two bugs) and screenshot it, to confirm what's
  *built* matches what's *shipped* to the device you're looking at —
  possible the build you saw was stale, or a different screen/state.
- If the screenshots do show a narrow/bubbled agent response somewhere,
  diagnose that specific spot rather than redesign — likely candidates to
  check: whether `MarkdownBody`'s output is ever wrapped in a
  `maxWidth`-constrained parent, and whether the empty-state starter-chip
  view is what was seen instead of a real turn.
- Send the resulting screenshots back to you before touching any layout
  code, since this item may turn out to need zero changes.

## 4. "Open in browser" for HTML files (new ask)

**Files**: new backend route in `backend/src/server.ts` (or a new
`backend/src/httpFiles.ts`), `FileViewerSheet.tsx`, `BrowserScreen.tsx`,
`bridgeClient.ts`

This is the one item needing new backend surface area, not just UI:

- **Backend**: `server.ts` currently only runs the WebSocket bridge — there
  is no HTTP listener serving file bytes. Add a small HTTP server (can
  share the existing `ws` server's underlying `http.Server` instance) with
  one route, e.g. `GET /files/raw?path=<abs path>&token=<short-lived>`,
  that streams the file back with the right `Content-Type` (reuse
  `files.ts`'s `MIME_TYPES` map) so a WebView can actually load it.
  - **Auth**: the WebView's request won't carry the paired bridge token
    the way WebSocket messages do. Needs a short-lived, single-use (or
    time-boxed, e.g. 60s) signed token minted over the WebSocket
    (`fs_raw_url_request` → `fs_raw_url_result` carrying a ready-to-use
    URL+token), not the long-lived pairing token — avoids putting a
    durable credential in a URL that ends up in WebView history/logs.
  - **Path safety**: reuse `resolveSafePath` so this route can't be used
    as an arbitrary-file-read primitive beyond the session's working root.
- **Client**: `FileViewerSheet.tsx` gains an "Open in browser" action,
  shown only when `mimeType === 'text/html'` — requests a raw-file URL
  over the bridge client, then either (a) opens it inside PiG's own
  embedded `BrowserScreen` as a new tab (matches "in-app view" framing
  used everywhere else in this ask), or (b) hands off to the OS browser
  via `Linking.openURL`. Recommend (a) for consistency with the rest of
  the ask's in-app-viewing theme; needs your call since it's the one
  genuinely open design decision in this plan.
- **Client wiring for (a)**: `BrowserScreen.tsx`'s tab model
  (`fixtures/browser.ts`'s `createBlankTab`) already supports opening an
  arbitrary tab with a URL — reuse `handleNewTab` plus setting the new
  tab's URL instead of blank, no new tab-model work needed.

### Also found while investigating this item — real bug, not new scope

Clicking "Browser" throws a React DOM nesting error today:
`<button> cannot be a descendant of <button>` — `TabStrip.tsx`'s `TabChip`
nests a close (`X`) `Pressable` *inside* the tab-select `Pressable`; RN Web
renders both as real `<button>` elements, which is invalid HTML and (per
the error) breaks hydration on web. Fix: restructure so the two
interactive regions are siblings instead of nested — wrap the chip in a
plain `View`, make the label-select `Pressable` cover only the label area
plus the chip's padding (not wrap the close button), and place the close
`Pressable` next to it, absolutely/flex-positioned to look identical
(same visual chip, no nested `<button>`s in the DOM). Small, contained fix
in `TabStrip.tsx` only. Filing this under item 4 since it's what
uncovered it, but it blocks *any* work that opens the Browser tab
(including verifying item 4), so it should land first regardless of
ordering below.

## 5. Backend: agent-surfaced files (the actual "agent sends us a file" feature)

**Files**: `backend/src/agentProcess.ts`, `backend/src/server.ts`, `src/types/index.ts` (if the transcript-chunk payload shape needs a field added — check first, may already carry `attachments`)

- Today `agentProcess.ts` parses the agent's `stream-json` output into
  transcript chunks but never inspects it for file references, so
  `FileAttachmentChip` never renders on an agent turn in real use (only
  possible today by attaching something yourself as the *user* turn).
- Needs a real design decision before implementation, not just code:
  **how does the backend know the agent "sent a file"?** Options, roughly
  in order of how much they lean on agent behavior vs. backend inference:
  1. Backend watches the session's working folder (via `chokidar` or
     polling `files.ts`'s `listDirectory`) for new/changed files during an
     agent turn, and attaches any that appeared since the turn started.
     Simple, agent-agnostic, but noisy (agents touch lots of files while
     working, not just ones meant "for you").
  2. Agent is instructed (system prompt / CLAUDE.md-style convention) to
     write user-facing output files to a specific subfolder (e.g.
     `.pig-output/`) that the backend watches — same mechanism as (1) but
     scoped, so only deliberate outputs surface as chips.
  3. Parse the agent's own stream-json events for an explicit signal (if
     Claude Code's `--output-format stream-json` ever emits a
     file-write/tool-result event with a path) and attach directly from
     that, no filesystem watching needed. Needs checking the real
     stream-json schema Claude Code emits (SPEC.md references this format
     but this plan doesn't have that schema in hand) before committing to
     it as the mechanism.
  - Recommend (2): scoped enough to avoid noise, no dependency on a
    specific agent's stream-json internals being stable, and gives you an
    explicit place to point the agent ("save it to .pig-output/") rather
    than a passive heuristic.
- Once a file is identified, `agentProcess.ts` builds a `FileAttachment`
  (name/path/kind/mimeType/sizeBytes via `files.ts` helpers) and includes
  it on the `transcript_chunk`'s `message.attachments`, same shape the
  user-turn path already produces — no new wire-protocol type needed, just
  populating a field that already exists and is already rendered.
- This is the largest, most architecturally open item — plan to scope it
  as its own follow-up conversation (confirm the mechanism, then
  implement) rather than bundling it into the same pass as items 1-4,
  which are self-contained UI work against existing plumbing.

---

---

## 6. Settled Architecture & Open Decisions Resolved

1. **Fullscreen Sheet Dismiss & Controls**:
   - Header gets an expand/collapse toggle (`Maximize2` / `Minimize2` from `lucide-react-native`).
   - Two-stage gesture: Downward drag while in fullscreen collapses to the 80% bottom sheet; downward drag in sheet mode dismisses completely. Tapping close (`X`) dismisses immediately from either state.
   - Transitions strictly follow `pig-motion` spring tokens (`SHEET_SPRING = { damping: 20, stiffness: 140, mass: 0.8 }`, disabled when `isReduceMotionEnabled()`).
2. **Markdown Preview**:
   - Automatic detection via MIME `text/markdown` or extensions `.md`/`.markdown`. Default to formatted view with `MarkdownBody`.
   - Header includes a `[Preview | Raw]` toggle pill to inspect raw monospace markdown.
3. **HTML Open in Browser**:
   - Serves files via new backend HTTP route `GET /files/raw?path=<safe_path>&token=<ticket>`.
   - Security: Short-lived (60s), single-use tickets minted over the WebSocket via `fs_raw_url_request` -> `fs_raw_url_result`.
   - In-app viewing: Navigates to embedded `BrowserScreen` and opens in a new tab.
4. **TabStrip Web Hydration Bug**:
   - Decouple nested `<Pressable>` elements in `TabChip`. The outer container is a standard `View`; the label selector and close button are sibling pressables.
5. **Agent-Surfaced Output Files**:
   - Standard convention: The agent writes output artifacts to `.pig-output/` in the session working directory.
   - At the end of each turn (`done: true`), newly created/modified files in `.pig-output` are discovered and attached to `TranscriptMessage.attachments` on the terminal `transcript_chunk`.

---

## 7. Parallel Implementation Workstreams

```
+-------------------------------------------------------------------------+
| CONCURRENCY WAVE 1 (Hours 0.0 - 4.5)                                    |
|                                                                         |
|  [Track A: Viewer UI]          [Track B: Browser UI]    [Track C: Backend]
|  - Fullscreen toggle           - TabStrip button fix    - /files/raw HTTP
|  - Two-stage drag dismiss      - URL param handling     - 60s ticket auth
|  - Markdown dual-mode          - In-app tab dispatch    - .pig-output watch
|  - Layout audit                - Open in Browser UI     - Attachments push
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| CONCURRENCY WAVE 2: INTEGRATION (Hours 4.5 - 5.5)                       |
|  - Wire FileViewerSheet "Open in Browser" to real bridgeClient endpoint |
|  - Chat transcript verifies live agent output chips from .pig-output    |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| CONCURRENCY WAVE 3: HEADLESS BROWSER E2E TESTS (Hours 5.5 - 6.0)        |
|  - Playwright test suite (e2e/chat-files.spec.ts)                       |
|  - Web hydration error regression check                                 |
|  - End-to-end user & agent file preview flows                           |
+-------------------------------------------------------------------------+
```

### Track A: Frontend Viewer & Markdown (4.5h)
- `src/components/FileViewerSheet.tsx`: Fullscreen state, `Maximize2`/`Minimize2`, height/radius animation.
- `src/components/FileViewerSheet.tsx`: Two-stage drag gesture threshold logic.
- `src/components/FileViewerSheet.tsx`: `MarkdownBody` integration + `[Preview | Raw]` toggle.
- `src/screens/TranscriptScreen.tsx`: Layout audit ensuring 100% full-width agent turns and no horizontal clipping.

### Track B: Browser Integration & TabStrip Bug Fix (3.5h)
- `src/components/TabStrip.tsx`: Flatten `TabChip` DOM hierarchy into sibling pressables, clearing `<button>` inside `<button>`.
- `src/screens/BrowserScreen.tsx`: Enable incoming URL routing for new tabs.
- `src/components/FileViewerSheet.tsx`: Add "Open in Browser" action button for `text/html` files.

### Track C: Backend File Server & Agent Output Surfacing (5.0h)
- `backend/src/server.ts` & `backend/src/httpFiles.ts`: HTTP file server on port 8787 streaming safe files with MIME types.
- `backend/src/server.ts`: Single-use 60s ticket generation for `fs_raw_url_request`.
- `backend/src/agentProcess.ts` & `backend/src/sessionRegistry.ts`: Directory diff watcher on `.pig-output/` creating `FileAttachment[]` upon turn completion.

---

## 8. Headless Browser E2E Test Suite (`e2e/chat-files.spec.ts`)

Playwright runs headless tests against `expo start --web` (port 8081) and the bridge backend (port 8787).

```typescript
import { test, expect } from '@playwright/test';

test.describe('Phase 8 Chat Files & Browser E2E', () => {
  test('TabStrip renders without DOM nesting errors on web', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/#browser');
    await page.getByRole('button', { name: /Open new tab/i }).click();

    const nestingError = consoleErrors.some((err) =>
      err.includes('cannot be a descendant of') || err.includes('validateDOMNesting')
    );
    expect(nestingError).toBeFalsy();
    await expect(page.getByRole('button', { name: /Switch to tab/i })).toHaveCount(2);
  });

  test('FileViewerSheet expands to fullscreen and toggles Markdown preview', async ({ page }) => {
    await page.getByTestId('file-chip-README.md').click();
    const sheet = page.getByTestId('file-viewer-sheet');
    await expect(sheet).toBeVisible();

    // Fullscreen expansion
    await page.getByLabel('Expand to fullscreen').click();
    await expect(page.getByLabel('Collapse to sheet')).toBeVisible();

    // Raw vs Formatted toggle
    await page.getByRole('button', { name: /Raw/i }).click();
    await expect(page.getByTestId('raw-markdown-source')).toBeVisible();
    await page.getByRole('button', { name: /Preview/i }).click();
    await expect(page.getByTestId('formatted-markdown-body')).toBeVisible();
  });

  test('HTML file viewer triggers in-app Browser tab navigation with auth ticket', async ({ page }) => {
    await page.getByTestId('file-chip-index.html').click();
    await page.getByRole('button', { name: /Open in browser/i }).click();
    await expect(page.getByPlaceholder('Search or enter address')).toHaveValue(/files\/raw\?path=.+&token=/);
  });

  test('Agent writes to .pig-output and transcript displays clickable attachment chip', async ({ page }) => {
    const composer = page.getByPlaceholder('Message the agent…');
    await composer.fill('create .pig-output/hello.txt containing HELLO_WORLD');
    await page.getByRole('button', { name: 'Send message' }).click();

    const attachmentChip = page.getByRole('button', { name: /hello\.txt/i });
    await expect(attachmentChip).toBeVisible({ timeout: 60_000 });
    await attachmentChip.click();
    await expect(page.getByText('HELLO_WORLD')).toBeVisible();
  });
});
```

---

## 9. Estimated Time to Arrival (ETA)

| Workstream | Scope | Dev Effort (Sequential) | Parallel Wall Time |
| :--- | :--- | :--- | :--- |
| **Track A** | Fullscreen Sheet + Markdown + Layout Audit | 4.5 hours | 4.5 hours |
| **Track B** | TabStrip Fix + Browser Navigation + Open in Browser UI | 3.5 hours | 3.5 hours |
| **Track C** | Backend HTTP Server + Token Protocol + Agent Output Watcher | 5.0 hours | 4.5 hours |
| **Track D** | Integration & Headless Browser Playwright E2E Suite | 3.0 hours | 1.5 hours |
| **Total** | **Full Phase 8 Implementation & Verification** | **16.0 hours** | **5.5 – 6.0 hours** |

### Milestone Delivery Schedule
- **M1 (Hour 1.0)**: TabStrip nested `<button>` bug fixed; web hydration clean.
- **M2 (Hour 3.0)**: FileViewerSheet fullscreen expansion and rich Markdown rendering operational.
- **M3 (Hour 3.5)**: Backend HTTP raw file server with short-lived tickets active.
- **M4 (Hour 4.5)**: HTML open-in-browser client routing and agent `.pig-output` watcher completed.
- **M5 (Hour 6.0)**: Headless Playwright E2E test suite passing (`npm run test:e2e`).

