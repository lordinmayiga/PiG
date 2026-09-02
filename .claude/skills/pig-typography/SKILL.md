---
name: pig-typography
description: Use when setting up or reviewing text styles, fonts, or type scale in the PiG app.
---

# PiG typography

- Typeface: **Onest** (Google Font) — open alternative to Samsung's proprietary SamsungOne/One UI Sans, chosen to match the Samsung Notes look. Used for every piece of UI text.
- Weights bundled: **400, 500, 600, 700** only — don't pull in additional weights, each is a separate font file shipped in the app bundle.
- **Monospace: Roboto Mono (Google Font), code contexts only.** Reopened 2026-09-02 — PiG now renders fenced code blocks and code/text file previews for real (see `pig-markdown-rendering`), so a mono face is needed. Scope it tightly: Roboto Mono appears *only* inside a code block, an inline `code` span, or the in-chat text/code file viewer — never for general UI text, never as a "techy" flourish elsewhere. Weights: 400/500 only.
- Android system font-scaling: **supported, capped at 1.3×**. Don't let text scale past that multiplier, and don't design a text-heavy layout that only works at 1.0× — verify at 1.3× too.
