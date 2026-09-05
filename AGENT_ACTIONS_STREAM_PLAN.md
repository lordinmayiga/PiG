# Fix Plan: Live "Agent Actions" Stream (not "thinking") + File-Link Preview

Supersedes `THINKING_STREAM_FIX_PLAN.md` (deleted) per direction: you don't want
internal reasoning tokens, you want to see what the agent is *doing* — which
file it's reading, which command it's running, right as it happens. Good news:
unlike "thinking," this data is **real, structured, and always present** on
both CLIs — verified live below, not inferred.

## 0. Proof this data exists (ran both CLIs for real, just now)

**Claude Code** (`claude --print --output-format stream-json --include-partial-messages`),
asked to read `package.json`:
```
content_block_start   {"type":"tool_use","id":"toolu_015...","name":"Bash","input":{}}
content_block_delta   {"type":"input_json_delta","partial_json":"{\"command\": \"grep -m1 ..."}
(...more deltas...)
assistant              full message: content:[{type:"tool_use", id, name:"Bash", input:{command:"grep -m1 '\"name\"' package.json"}}]
user                    content:[{type:"tool_result", tool_use_id, content:"  \"name\": \"pig\",", is_error:false}]
```
Standard Anthropic tool-use shape: a `tool_use` block starts, its `input` streams in as JSON deltas, the full input lands in the `assistant` message, and the result comes back as a `tool_result` in the next `user` message keyed by `tool_use_id`. Our parser today only reads `text_delta` — this entire shape is currently thrown away.

**Antigravity** (`agy --print`), asked to read `package.json`:
```
step_update {"step_type":"tool","state":"ACTIVE","tool_name":"run_command","tool_info":{"parameters":{"CommandLine":"pwd"}}}
step_update {"step_type":"tool","state":"DONE","tool_name":"run_command","tool_info":{"parameters":{...},"output":"/root/.../scratch\r\n"}}
...
step_update {"step_type":"tool","state":"ACTIVE","tool_name":"view_file","tool_info":{"parameters":{"AbsolutePath":"/root/projects/PiG/package.json"}}}
step_update {"step_type":"tool","state":"DONE","tool_name":"view_file","tool_info":{"parameters":{...},"output":"52 lines, 1559 bytes"}}
```
Even simpler: each tool step is one self-contained `ACTIVE` → `DONE`/`ERROR` pair with `tool_name` + `tool_info.parameters` + (on completion) `tool_info.output`. No JSON-delta buffering needed at all for this agent kind.

**Bonus finding for Track D (file links):** agy's own final answer in that same
run contained `[package.json](file:///root/projects/PiG/package.json#L2)` — a
real `file://` link with a line anchor. Confirms the link-preview classifier
needs to handle `file://` URIs, not just bare relative paths.

---

## 1. Data model

Add one new field to `TranscriptMessage` (`src/types/index.ts`), alongside the
existing `thinking`/`attachments`:
```ts
export interface AgentAction {
  id: string;                 // tool_use_id (claude) or `${stepIndex}` (agy)
  tool: string;                // 'Bash' | 'Read' | 'run_command' | 'view_file' | ...
  label: string;                // human-friendly, e.g. "Reading package.json"
  detail?: string;             // full command / path, for expansion
  status: 'running' | 'done' | 'error';
  output?: string;             // truncated result preview
  startedAt: string;
}
actions?: AgentAction[];
```
`thinking` field and `ThinkingAccordion` are dropped from the live-turn UI
entirely (not worth the CLI limitations from the prior plan) — replaced by an
actions feed.

## 2. Backend parsing (`backend/src/agentProcess.ts`)

### Claude-code (`parseNdjsonLine`'s `stream_event` branch)
- `content_block_start` with `content_block.type === 'tool_use'`: push a new
  `AgentAction` (`status: 'running'`, generic `label` from a tool→verb map,
  e.g. `Bash` → "Running a command…") keyed by `content_block.id`.
- `input_json_delta`: buffer `partial_json` per block index (needed to survive
  a delta landing mid-JSON) — but don't block the label on it.
- `type: 'assistant'` message content array: for each `tool_use` block, now
  that `input` is complete, refine that action's `label`/`detail` from the
  real params (`Bash.input.command`, `Read.input.file_path`, `Edit`/`Write`
  same, `Grep.input.pattern`, etc.) — see label map below.
- `type: 'user'` message content array: for each `tool_result`, look up the
  action by `tool_use_id`, set `status: done|error` (from `is_error`) and a
  truncated `output`.

### Antigravity (`parseAntigravityLine`)
- `step_type === 'tool'`, `state: 'ACTIVE'`: push new action keyed by
  `step_index`, `tool: tool_name`, label from `tool_info.parameters` (map
  below), `status: 'running'`.
- `state: 'DONE' | 'ERROR'`: find that action by `step_index`, set
  `status`, attach truncated `tool_info.output`.
- This is strictly simpler than claude-code's path — no delta buffering.

### Shared label map (new: `backend/src/actionLabels.ts`, imported by both branches so client and any future backend logging agree)
| tool | label pattern |
|---|---|
| `Bash` / `run_command` | `Running: <command, truncated ~60 chars>` |
| `Read` / `view_file` | `Reading <basename(path)>` |
| `Write` / `write_to_file` | `Writing <basename(path)>` |
| `Edit` / `replace_file_content` / `multi_replace_file_content` / `sed_file` | `Editing <basename(path)>` |
| `Grep` / `grep_search` | `Searching for "<pattern>"` |
| `Glob` / `find_by_name` | `Finding files matching <pattern>` |
| everything else | `Using <tool name>` |

Every payload update carries the full `state.actions` array (same
upsert-by-id pattern the existing `accumulatedText` uses), so the client just
replaces its list each chunk — no separate merge logic needed on the frontend.

## 3. Frontend: `AgentActionsFeed` (replaces `ThinkingAccordion`'s role)

New component, `src/components/AgentActionsFeed.tsx`, per skills:
- **`pig-loading-states`**: a running action shows the existing spinner
  treatment (not a new spinner style); a done action gets a static check
  icon; an error action gets the existing error/warning tint from
  `pig-color-system`.
- **`pig-icons-branding`**: `lucide-react-native` only, via the shared `Icon`
  component — `Terminal` for run_command/Bash, `FileText` for
  Read/view_file, `PencilLine` for Write/Edit, `Search` for Grep/Glob,
  `Wrench` fallback for anything unmapped. No emoji, no raster icons.
- **`pig-motion`**: each action row enters with the same
  fade+slide-up micro-interaction already used for list rows elsewhere in the
  app (not the 7-line teleprompter growth from the old thinking design — that
  was purpose-built for text and doesn't fit discrete rows).
- **Layout**: unlike thinking, this stays visible (not auto-collapsed away)
  while the turn streams — it's the answer to "what is it doing right now,"
  so hiding it defeats the point. It can collapse to a one-line summary
  ("4 actions" with a chevron) only once the turn is `done`, per
  `pig-layout-spacing`'s density rules, tap to re-expand.
- Replace `ThinkingAccordion` usage in `TranscriptScreen.tsx:119-130` with
  `AgentActionsFeed`, driven by `item.actions` instead of `item.thinking`.
- Delete `ThinkingAccordion.tsx` and `src/utils/thoughtHighlight.ts` (no
  longer used by anything once this lands) rather than leaving dead code.

## 4. File-link preview (unchanged from prior plan, still needed)
- New `src/utils/fileLinkClassifier.ts`: recognize `file://` URIs (with
  optional `#L<n>` anchor — strip it, or thread it through to the viewer as
  an initial scroll position if easy) and bare relative paths as "local file,"
  vs. real `http(s)://` URLs.
- `MarkdownBody.tsx`'s link renderer branches: local file → call new
  `onOpenFile(path)` prop (threaded from `TranscriptScreen.tsx`, reusing the
  exact `FileViewerSheet` state `FileAttachmentChip` already opens) instead of
  `Linking.openURL`; real URL → unchanged.
- Visual treatment matches `session_mockup.html` / `ThoughtLine`'s old `path`
  segment styling: accent pill, Roboto Mono, per `pig-markdown-rendering`.

## 5. E2E proof
- New `e2e/agent-actions-stream.spec.ts`: send an **uncoached** prompt that
  requires a real tool call (e.g. "Read package.json and tell me the name
  field" — exactly what I tested by hand above), assert an action row
  appears while `status: running`, then flips to done with a label
  containing the real file/command, for both a `claude-code` session and an
  `agy` session (session-name convention same as the existing spec).
- New `e2e/file-link-preview.spec.ts`: same kind of prompt, assert the
  reply's `file://` link renders as a pill, tap it, assert `FileViewerSheet`
  opens with real file content.
- Delete the misleading assertion in `e2e/antigravity-thinking-slash.spec.ts`
  that thinking-accordion "verifies real thinking stream" (dead code path
  once `ThinkingAccordion` is removed) — keep and rename the file for its
  still-valid `/model` and `/usage` slash-command coverage.

---

## 6. Work breakdown & parallel execution

| Track | Task | Files | Depends on |
|---|---|---|---|
| **A** | Claude-code tool_use/tool_result parsing + shared label map | `backend/src/agentProcess.ts`, `backend/src/actionLabels.ts` (new), `backend/tests/*.test.ts` | none |
| **B** | Antigravity `step_type: 'tool'` parsing (uses same label map) | `backend/src/agentProcess.ts` (different function than A) | label map from A (~2 min stub-first) |
| **C** | `AgentActionsFeed` component + wire into `TranscriptScreen`, delete `ThinkingAccordion`/`thoughtHighlight` | `src/components/AgentActionsFeed.tsx` (new), `src/screens/TranscriptScreen.tsx`, delete 2 old files | `AgentAction` type shape from A/B (agree on shape first, ~5 min) |
| **D** | File-link classifier + `MarkdownBody` → `FileViewerSheet` wiring | `src/utils/fileLinkClassifier.ts` (new), `src/components/MarkdownBody.tsx`, `src/screens/TranscriptScreen.tsx` | none — fully independent |
| **E** | Split old spec, add two new real-tool-call e2e specs, run headlessly against live backend | `e2e/antigravity-thinking-slash.spec.ts` (trim), `e2e/agent-actions-stream.spec.ts` (new), `e2e/file-link-preview.spec.ts` (new) | A, B, C, D landed |

**Parallelization:** A and B touch the same backend file but disjoint parser
functions (claude-code vs. antigravity branch) — two agents in parallel,
converge on `actionLabels.ts` first as a tiny shared stub so neither blocks.
D is fully independent the whole time. C waits briefly on A/B's `AgentAction`
shape (types only). E is the verification gate, serial, last — real headless
Playwright against the actually-running backend, same method I used to
diagnose this, not mocks.

## 7. ETA
- A + B (backend, parallel, ~2 min shared-type sync first): ~20 min
- C (frontend, starts once A/B's shape is fixed): ~20 min
- D (frontend, fully parallel from the start): ~20 min
- E (real headless verification, serial, after all land): ~15 min

**Total wall-clock with parallel tracks: ~45-50 minutes.**

No honesty caveat needed this time — unlike thinking, both CLIs expose this
uncoached, unconditionally, on every tool call. This is a solid feature, not
a workaround.
