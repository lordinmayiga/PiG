# Fix Plan: Real Thinking Stream + Clickable File-Link Preview

## 0. What I actually did to diagnose this (not guesswork)

1. Ran the existing `e2e/antigravity-thinking-slash.spec.ts` headlessly (Playwright,
   against the real running backend on :8787 and Expo web on :8081). It **passed**
   — but only because it forces the model with the prompt *"Think step by step in
   `<thought>` tags first..."*. That's the test cheating the feature, not proving it.
2. Wrote a throwaway diagnostic spec that sends a normal prompt
   ("What is 17 times 23?") with no `<thought>`-tag coaching, once against a
   `claude-code` session and once against an `antigravity` (`agy`) session, and
   polled for `thinking-accordion` for 20s plus 3s after the reply finished.
   **Result: never appears, either session type.** This matches exactly what you're
   seeing — confirmed, not assumed. (Spec deleted after use, this file preserves
   the finding.)
3. Ran `agy --output-format stream-json --print="..."` by hand for both
   `gemini-3.8-flash` (low effort) and `claude-sonnet-4-6` ("Thinking" badge in
   our own model list). **Neither ever emits `thinking_tokens > 0`, a
   `thought_delta`, or `<thought>` tags** — the CLI's `--print` stream-json output
   has no live reasoning channel at all.
4. Checked `agy`'s internal per-conversation log
   (`~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl`),
   which `agentProcess.ts`'s `tryExtractTranscriptThinking` reads as a fallback.
   It sometimes has a short internal `"thinking"` note (e.g. `"Simple math
   question."`) and sometimes has none at all for an equally simple prompt —
   inconsistent, undocumented, and only readable **after** the turn is already
   `done` (not a stream).
5. Checked `claude --help`: Claude Code's CLI does support "thinking blocks" in
   its stream-json output (see `--forward-subagent-text`), but our own parser
   (`parseNdjsonLine`'s `stream_event` case in `agentProcess.ts`) only ever
   matches `delta.type === 'text_delta'` — a `thinking_delta` event, if the model
   ever emits one, is silently dropped today. There is no code path for it at all.
6. Checked the file-link story: `FileViewerSheet.tsx` + `FileAttachmentChip.tsx`
   already exist and are wired for backend-detected file **attachments**
   (`message.attachments`, `TranscriptScreen.tsx:110/152`). But
   `MarkdownBody.tsx`'s inline `[text](url)` link renderer (line ~151-162) just
   calls `Linking.openURL(linkUrl)` unconditionally — it never opens
   `FileViewerSheet`. `session_mockup.html` (lines 1029, 1053-1078) is the design
   source of truth: inline links in agent prose AND attachment chips both call
   the same `openFileViewer(name, type)`.

**Root cause, plainly:** the thinking stream isn't "almost working" — it has
*no working live data source* today. The `<thought>`-tag path only fires if you
explicitly instruct the model to emit literal tags (which real usage never does),
and the transcript.jsonl fallback is a post-hoc, inconsistent scrap that isn't
even confirmed to reach the UI. The link-preview gap is a real, smaller bug:
`MarkdownBody` was never taught the file-link convention `FileViewerSheet`
already implements elsewhere.

---

## 1. Fix design

### Track A — Backend: make `claude-code` thinking real
- Add a `thinking_delta` branch to `parseNdjsonLine`'s `stream_event` case in
  `backend/src/agentProcess.ts`, parallel to the existing `text_delta` branch,
  accumulating into `TranscriptChunkPayload.message.thinking` (same field the
  frontend already reads).
- Confirm empirically (not assumed) whether the currently-spawned `claude`
  invocation flags (`--print --output-format stream-json
  --include-partial-messages --dangerously-skip-permissions --verbose`) ever
  actually produce `thinking_delta` for a prompt that invites reasoning (e.g. "think
  through this step by step" on a real non-trivial question) — extended thinking on
  the API is opt-in per model; if it's never emitted under `--print` at all
  regardless of prompt, document that as a hard platform limit next to the
  parser change rather than claim it's fixed.

### Track B — Backend: make `antigravity` thinking honest, not fake
`agy --print` has no live reasoning channel — that's a fact about the installed
CLI, not something a parser change can fix. So:
- Keep the `<thought>`-tag path (harmless, fires if a system/user prompt ever
  asks for it).
- Keep `tryExtractTranscriptThinking`, but fix its race: right now it's a
  single `existsSync` read immediately in the `result` handler, with no retry.
  Add a short bounded retry (e.g. up to ~500ms, a few attempts) since the CLI's
  own log write can lag its stdout `result` line by a beat.
- Change the frontend contract for this path: since it's known post-hoc, not
  streaming, `ThinkingAccordion` must not silently render nothing when there's
  no live delta — see Track C.

### Track C — Frontend: `ThinkingAccordion` needs a real "nothing to show" state
Per `pig-loading-states` and `pig-empty-states`, the component must never look
"broken" (invisible) — it should communicate what's actually happening:
- While `isStreaming && !hasAnswerContent` and there is **no** thinking text yet,
  show the existing typing-indicator pattern (already used elsewhere per
  `pig-loading-states`), not an invisible gap — so the user sees *something* is
  happening even before/if no reasoning trace ever arrives.
- If a turn completes and `thinking` arrived only via the post-hoc
  `tryExtractTranscriptThinking` fallback (i.e. never streamed live), render the
  accordion collapsed-by-default titled "Thought summary" (distinct from the
  live "Thought for Xs" title) so it's honest about being a summary, not a replay.
- This still obeys `pig-motion` (existing 180ms cubic expand/collapse) and
  `pig-color-system` tokens already in place — no new tokens needed.

### Track D — Frontend: clickable file links → same viewer as attachment chips
- Add a small path-classifier util (`src/utils/`) — reuse pattern already
  started in `src/utils/` for `thoughtHighlight.ts` — that recognizes a link
  target as a **local repo file reference** (relative path, or matches the
  `.pig-output/...` convention already used for attachments) vs. a real
  external URL.
- In `MarkdownBody.tsx`'s link renderer, branch: local file → call a new
  `onOpenFile(path)` prop (threaded down from `TranscriptScreen.tsx`, reusing
  the exact `FileViewerSheet`/`viewerFile` state that `FileAttachmentChip`
  already opens — no new sheet, no duplicate design) instead of
  `Linking.openURL`; real external URL → unchanged `Linking.openURL` behavior.
- Visual treatment for a file-link (vs. a real external link) follows
  `session_mockup.html`'s existing distinction and `pig-markdown-rendering`'s
  scoped-mono rule: file-path links get the accent-pill treatment already used
  in `ThoughtLine`'s `path` segment (`colors.accent` + tint background,
  Roboto Mono), a real URL keeps the plain underline style.

### Track E — E2E proof, not vibes
- Delete the misleading claim in `antigravity-thinking-slash.spec.ts` that it
  "verifies real thinking stream" — rename/split it: keep the slash-command
  assertions (those did pass honestly), move the thinking assertion to a new
  spec that sends an **uncoached** prompt and asserts the *correct* new
  behavior per Track C (typing-indicator first, then either a live-streamed
  accordion or a collapsed "Thought summary" — whichever the backend actually
  produced), so the test can't silently pass by cheating the prompt again.
- New spec for Track D: send a prompt whose reply contains a markdown link to a
  real file under the session's cwd, tap it, assert `FileViewerSheet` opens
  with that file's content (reusing the pairing/session helpers already in the
  existing spec file).

---

## 2. Work breakdown & parallel execution

| Track | Task | Files | Depends on |
|---|---|---|---|
| **A** | `thinking_delta` parsing for claude-code + empirical check it ever fires | `backend/src/agentProcess.ts`, `backend/tests/*.test.ts` | none |
| **B** | Bounded-retry fix for `tryExtractTranscriptThinking`; contract note | `backend/src/agentProcess.ts` | none (parallel with A — same file, different functions, will merge cleanly) |
| **C** | `ThinkingAccordion` typing-indicator fallback + "Thought summary" mode | `src/components/ThinkingAccordion.tsx` | needs `thinking`/streaming contract from A+B agreed first (types only, ~5 min sync) |
| **D** | File-link classifier + `MarkdownBody` → `FileViewerSheet` wiring | `src/utils/fileLinkClassifier.ts` (new), `src/components/MarkdownBody.tsx`, `src/screens/TranscriptScreen.tsx` | none — independent of A/B/C |
| **E** | Split/rewrite e2e specs for both fixes, run headlessly against real backend | `e2e/antigravity-thinking-slash.spec.ts` (split), new `e2e/file-link-preview.spec.ts` | A, B, C, D all landed |

**Parallelization:** A and B touch the same backend file but disjoint
functions — safe to run as two agents in parallel, then a quick merge. D is
fully independent (different files, different feature) and runs in parallel
with A/B/C the whole time. C is the only one that waits (briefly) on A/B's
final field names/shape. E is the verification gate and must run last, serially,
against the real running backend+Expo web — no mocks, matching how I diagnosed
this.

## 3. ETA
- A + B (backend, parallel): ~20 min
- C (frontend, starts ~5 min after A/B's contract is set): ~15 min
- D (frontend, fully parallel from the start): ~20 min
- E (real headless verification, serial, after all land): ~15 min

**Total wall-clock with parallel tracks: ~45-50 minutes.**

## 4. Honesty caveat to flag now, not after
Track B's fix makes the antigravity "thinking" story *honest* (a labeled
post-hoc summary when available), not the same live 7-line teleprompter
experience the earlier plan document promised — that experience needs a live
reasoning channel `agy --print` does not currently expose. If you want the true
live-streaming teleprompter for antigravity sessions specifically, that's a
larger, separate investigation (e.g. whether `agy`'s interactive/`stream-json`
input mode or a different flag combination exposes it) and should be scoped
after this fix, not bundled into it.
