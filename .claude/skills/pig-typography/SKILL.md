---
name: pig-typography
description: Use when setting up or reviewing text styles, fonts, or type scale in the PiG app.
---

# PiG typography

- Typeface: **Onest** (Google Font) — open alternative to Samsung's proprietary SamsungOne/One UI Sans, chosen to match the Samsung Notes look. Used for every piece of UI text.
- Weights bundled: **400, 500, 600, 700** only — don't pull in additional weights, each is a separate font file shipped in the app bundle.
- **Monospace: Roboto Mono (Google Font), code contexts only.** Reopened 2026-09-02 — PiG now renders fenced code blocks and code/text file previews for real (see `pig-markdown-rendering`), so a mono face is needed. Scope it tightly: Roboto Mono appears *only* inside a code block, an inline `code` span, or the in-chat text/code file viewer — never for general UI text, never as a "techy" flourish elsewhere. Weights: 400/500 only.
- **Always load it through `src/components/monoFont.ts`** (`useMonoFont()` + `monoFontFamily`/`monoFontFallback`) — never `Platform.select({ios:'Menlo', default:'monospace'})` or a bare `fontFamily:'monospace'`. That system-font pattern shipped in three places by mistake (fixed 2026-09-04: `SlashCommandOverlay`'s command label/usage values, `ThinkingAccordion`'s path/number segments, `Composer`'s slash-trigger glyph — the last of those was also swapped for a Lucide `SquareSlash` icon per `pig-icons-branding`, since a single "/" character button isn't UI text or code, it's an icon) and renders the wrong typeface even where mono *was* the right call.
- **Open scope question, not yet decided**: `PairingTokenPanel` (Setup flow) shows a copyable shell command outside any of the three listed contexts — not a fenced block, not an inline `code` span, not the file viewer. It's kept in Roboto Mono for now (fixed to load it correctly rather than via system fallback) because a copyable CLI command reads the same way a code span does, but that's a judgment call, not something this rule currently covers — flag before adding a fourth "copyable command" context to the list above, rather than assuming it.
- Android system font-scaling: **supported, capped at 1.3×**. Don't let text scale past that multiplier, and don't design a text-heavy layout that only works at 1.0× — verify at 1.3× too.

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every text style here must also satisfy the other `pig-*` skills — never trade a typography rule off against another skill to make one screen work; a perceived conflict is a bug in the skills to raise, not a license to violate either.
- **No emojis anywhere in the app** — including as a substitute for an icon next to a label. Use a Lucide icon (`pig-icons-branding`).
- **Icons are always `lucide-react-native`**, never a font glyph or emoji standing in for one.
