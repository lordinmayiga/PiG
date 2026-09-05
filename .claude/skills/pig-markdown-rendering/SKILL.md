---
name: pig-markdown-rendering
description: Use when building or modifying PiG's transcript markdown renderer, or anything that displays an agent's response text.
---

# PiG markdown rendering

**Reopened 2026-09-02.** The original rule here banned all code/terminal rendering and any monospace font in the app. That's reversed: PiG now renders fenced code blocks for real, and lets you view attached/agent-surfaced text and code files in-chat (see `pig-icons-branding`'s attachment rules and `pig-typography`'s scoped Roboto Mono). If you're reading an older note that still says "no code, ever," this file supersedes it.

## Transcript layout

Full-width, not chat bubbles — matches the Claude app pattern, not a messenger:

- **Agent turns**: no background, text sits directly on the canvas at full screen width. A turn header shows the agent name + its status dot (same dot/label language as the Sessions card) and a relative timestamp.
- **User turns**: kept visually distinct — right-aligned, tinted/accent bubble — so the transcript stays scannable at a glance even without bubbles on the agent side.
- Markdown renders richly for agent turns: headings, bold/italic, lists, blockquotes, links, inline code, and fenced code blocks. User turns render as plain text (no markdown parsing needed — dictation/typed input isn't markdown).

## Code blocks

- Chat's fenced code blocks (`CodeBlock.tsx`) render as a **plain monospace block** (Roboto Mono, flat neutral background from `pig-color-system`'s code-surface token) — **no syntax highlighting**. This stays flat deliberately; it's a different surface from the file viewer below.
- Every code block gets a **Copy** button in its header, alongside a small language label if the fence declared one. This is the same "copy out of the transcript" affordance already promised for messages generally.
- Code blocks are still never *editable* and never drive any routing/action — they're read-only display.

**2026-09-05**: the file viewer's code display (below) is a separate case from chat's fenced code blocks and now has minimal syntax highlighting — see `CodeHighlight.tsx`. Don't backport it into `CodeBlock.tsx`/chat fences; that stays flat as documented above.

## Files in the transcript (sent or agent-surfaced)

A file — yours or one the agent produced — shows as an inline chip (image thumbnail, or an icon+name+size chip for anything else). Tapping it opens the in-chat viewer (same `FileViewerSheet` the File Explorer uses), split by type:

- **Image** (png/jpeg/webp, plus gif/svg/bmp by extension) → full-screen lightbox, loaded from a real backend URL (`client.getRawFileUrl`) rather than a static fixture. A short (<300ms, no flash per `pig-loading-states`) resolve shows a spinner; a failed resolve shows a distinct "Couldn't load this image" state, never conflated with the no-preview-available placeholder used when no bridge client exists at all (e.g. disconnected/test builds).
- **Text or code file** → same monospace treatment as a code block, scrollable, read-only. For a recognized code extension (`.js .jsx .ts .tsx .mjs .cjs .py .html .htm .css`), it renders through `CodeHighlight.tsx`: comments, string literals, and (JS/TS/Python keywords, or HTML tag delimiters) get colored — see `pig-color-system`'s "Syntax highlighting" section for the token-color mapping, marked PROPOSED pending design review. Any other text extension (`.txt`, `.json`, unrecognized, …) stays fully flat, unchanged from before.
- **Anything else** (PDF, zip, binary) → no rendering attempt — the popup shows name/size/type and a Download action only. A real in-app PDF renderer was explicitly cut as scope not worth a native dependency for what Download + the OS share sheet already covers.

Download always hands off to the **OS share sheet** ("Save to…") rather than writing silently to the device's Downloads folder — avoids needing broad storage permissions and matches how most Android apps do it.

## Filename mentions become clickable, not just markdown links

**2026-09-05**: an explicit markdown link (`[text](path)`) has always opened the file viewer via `onOpenFile` (see `fileLinkClassifier.ts`). A bare filename mentioned in plain agent prose with no brackets (e.g. "I edited `src/App.tsx` to fix the bug" — written as plain text, not a markdown link) is now auto-detected too, via `BARE_PATH_RE` in `fileLinkClassifier.ts`, and rendered with the same file-link pill. Scoped to a fixed extension whitelist (code/doc/config files an agent would plausibly reference), with a small deny-list for `Product.js`-shaped framework names (`Node.js`, `Vue.js`, …) that would otherwise false-positive on the `.js` extension. This is regex-based prose scanning, not a filesystem check — it can still overlink a real English sentence that happens to look path-shaped; tapping a link that doesn't resolve is expected to surface whatever error `fsRead`/`getRawFileUrl` already produce, not crash.

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every rendering decision here must also satisfy the other `pig-*` skills — never trade this skill's rules off against another to make one screen work; a perceived conflict is a bug in the skills to raise, not a license to violate either.
- Roboto Mono stays scoped exactly as `pig-typography` defines it — a code block, an inline `code` span, or the file/text viewer. A path or number mentioned in prose (agent turn text, a thinking-stream line) is **not** one of those three contexts on its own; don't reach for mono there just because it looks file-related — highlight it by color/pill instead, per `pig-color-system`.
- **No emojis anywhere in the app**, including in rendered markdown treatment (no emoji favicon/bullet substitutes) or file-type icons — those are Lucide icons.
- **Icons are always `lucide-react-native`** for file chips, copy buttons, and language labels.
