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

- Render as a **plain monospace block** (Roboto Mono, flat neutral background from `pig-color-system`'s code-surface token) — **no syntax highlighting**. Highlighting is real scope (language detection, a token-color palette needing its own light/dark treatment) with no confirmed need yet; start flat, revisit only if it's requested.
- Every code block gets a **Copy** button in its header, alongside a small language label if the fence declared one. This is the same "copy out of the transcript" affordance already promised for messages generally.
- Code blocks are still never *editable* and never drive any routing/action — they're read-only display.

## Files in the transcript (sent or agent-surfaced)

A file — yours or one the agent produced — shows as an inline chip (image thumbnail, or an icon+name+size chip for anything else). Tapping it opens the in-chat viewer, split by type:

- **Image** → full-screen lightbox.
- **Text or code file** → same monospace treatment as a code block, scrollable, read-only.
- **Anything else** (PDF, zip, binary) → no rendering attempt — the popup shows name/size/type and a Download action only. A real in-app PDF renderer was explicitly cut as scope not worth a native dependency for what Download + the OS share sheet already covers.

Download always hands off to the **OS share sheet** ("Save to…") rather than writing silently to the device's Downloads folder — avoids needing broad storage permissions and matches how most Android apps do it.

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every rendering decision here must also satisfy the other `pig-*` skills — never trade this skill's rules off against another to make one screen work; a perceived conflict is a bug in the skills to raise, not a license to violate either.
- Roboto Mono stays scoped exactly as `pig-typography` defines it — a code block, an inline `code` span, or the file/text viewer. A path or number mentioned in prose (agent turn text, a thinking-stream line) is **not** one of those three contexts on its own; don't reach for mono there just because it looks file-related — highlight it by color/pill instead, per `pig-color-system`.
- **No emojis anywhere in the app**, including in rendered markdown treatment (no emoji favicon/bullet substitutes) or file-type icons — those are Lucide icons.
- **Icons are always `lucide-react-native`** for file chips, copy buttons, and language labels.
