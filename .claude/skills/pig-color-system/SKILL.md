---
name: pig-color-system
description: Use when choosing, applying, or reviewing any color in the PiG app — component styling, theming (light/dark), semantic/status colors, or checking a new color's contrast. Provides the locked palette and its usage rules.
---

# PiG color system

Full rationale and contrast math: `DESIGN.md` in the project root. This skill is the operational reference — apply these values directly, don't re-derive them.

## Base palette

| Name | Hex | Role |
|---|---|---|
| Velvet Orchid | `#7e2e84` | Primary accent, light mode |
| Snow | `#fbf5f3` | Light-mode canvas |
| Muted Teal | `#8daa9d` | Success/connected — **fill & dot only, never text** (2.33:1 on Snow — fails as foreground) |
| Onyx | `#0f0e0e` | Ink / dark-mode canvas |
| Rosy Copper | `#bf4e30` | Destructive, light mode — **buttons/large-bold text only**, not small print (4.47:1 on Snow) |

## Dark-mode accent steps (never reuse the light-mode hex on a dark surface)

| Name | Hex | Role |
|---|---|---|
| Velvet Orchid — Dark | `#cd89d2` | Primary accent, dark mode (7.44:1 on Onyx) |
| Rosy Copper — Dark | `#da846c` | Destructive, dark mode (6.89:1 on Onyx) |

## Warning (no single hex clears 4.5:1 both directions, same as Velvet/Copper)

| Name | Hex | Role |
|---|---|---|
| Amber Ochre — Deep | `#8b6118` | Warning text/icon, light mode (5.09:1 on Snow) |
| Amber Ochre | `#d2962d` | Warning text/icon, dark mode (7.48:1 on Onyx) |

## Neutral ramp (warm-biased off Snow's undertone, not flat gray)

| Step | Hex | Typical use |
|---|---|---|
| Neutral 100 | `#f2ebe8` | Card fill on Snow |
| Neutral 200 | `#e4dad5` | Borders/dividers, light |
| Neutral 300 | `#cbbdb6` | Idle status dot, light |
| Neutral 400 | `#a99a93` | Secondary text, dark mode |
| Neutral 500 | `#85756f` | Placeholder text |
| Neutral 600 | `#635550` | Idle status dot, dark |
| Neutral 700 | `#453b37` | Secondary text, light mode |
| Neutral 800 | `#2a2321` | Borders/dividers, dark |

## Surface elevation

| Token | Light | Dark |
|---|---|---|
| `surface.canvas` | `#fbf5f3` | `#0f0e0e` |
| `surface.card` | `#ffffff` | `#1c1917` |
| `surface.elevated` (sheets/modals) | `#ffffff` + scrim `rgba(15,14,14,.4)` | `#372f2c` |
| `border` | `#e4dad5` | `#2a2321` |

Light mode has no lighter-than-white step — elevation there is carried by scrim + shadow, not color.

## Recessed fills (search bars, icon chips, close buttons, badge pills)

`neutral[100]`/`neutral[200]` are **light-mode-only** steps ("Card fill on Snow", "Borders/dividers, light") — they have no dark counterpart, and using them unconditionally in both modes is the single most common bug in this system (found 2026-09-04 in the slash-command sheet, the thinking accordion, and the transcript header's model badge, all rendering a bright `#f2ebe8` patch on the Onyx canvas).

For any surface that sits one step up from `canvas` but isn't a full `card`/`elevated` block — a search bar fill, an icon-wrap circle, a close button, a badge pill — **reuse `surface.card` + `border`** for both modes. Don't reach for `neutral[100]`/`[200]` outside their documented light-only roles above, and don't invent a new neutral step to cover this — the existing elevation pair already does the job.

## Accent tint (selected-row highlight, inline highlight pills)

Don't hand-roll a tint with string concatenation (`colors.accent + '15'`, `+ '25'`, etc.) — it's unvalidated in either mode and was found in three places (selected-model row, thought-line path pill) — plus a fourth, `MarkdownBody`'s file-link pill, found and fixed 2026-09-05. Use the validated token instead:

| Name | Hex | Role |
|---|---|---|
| Accent Tint — light | `#f2e3f3` | Selected/highlighted fill under accent-colored text or icons, light mode (14.7:1 ink-on-tint) |
| Accent Tint — dark | `#3a2a3c` | Same role, dark mode (13.9:1 ink-on-tint) |

## Pressed/active fill (row/button press feedback)

Interactive press feedback (`Pressable`'s `pressed` state) is a different case from a static recessed fill above — it needs to read as one step up from whatever it's resting on (usually `card`), and that step **inverts direction by mode**: dark surfaces lighten on press, light surfaces can't (no lighter-than-white step exists — see "Surface elevation" above), so light reuses `neutral[100]` instead, which is safe here since light already owns that role.

| Mode | Pressed fill | Reuses |
|---|---|---|
| Light | `neutral[100]` (`#f2ebe8`) | already documented "Card fill on Snow" |
| Dark | `surface.elevated` (`#372f2c`) | already documented sheet/modal elevation |

Known trade-off: if the pressed row's *own* container already uses `elevated` as its background (e.g. inside a bottom sheet), the row will flush to match its backdrop on press rather than visibly "light up" — still distinguishable by its border, but worth a visual check per instance rather than assuming it always reads as a highlight. Same spirit as the `ThinkingAccordion` card-on-card caveat above.

Never use `neutral[100]`/`neutral[200]`/`neutral[300]` unconditionally as a `pressed`-state fill (or any other cross-mode value) — same rule as static recessed fills, same failure mode: a light-only step bleeding into dark and rendering as a bright patch (found 2026-09-04 in the slash-command sheet's command/model row press states).

## Disabled state

A disabled interactive element (see `pig-interaction-states` for the full rule) reduces its fill/text/icon to **0.4 opacity** of its enabled color — not a separate hardcoded gray. This is the one state that's exempt from the "every color needs its own dark-mode step" rule below, since opacity scales the existing token correctly in both modes on its own.

## Syntax highlighting (file viewer only) — PROPOSED, pending design review

**2026-09-05.** Added for `CodeHighlight.tsx` (the file viewer's code display — see `pig-markdown-rendering`'s "Code blocks" section; chat's fenced code blocks stay flat/unhighlighted, unaffected). Drafted, not yet confirmed by a design pass — flag before treating it as locked the way the rest of this palette is.

Only **one** new hex pair was added. Keywords and comments deliberately reuse existing tokens rather than invent two more:

| Token class | Color used | Why |
|---|---|---|
| Keyword | `accent` (reused) | Not a new hue — considered reuse, not a violation of the "semantic colors never reused" rule below, since `accent` isn't a semantic (success/warning/destructive) color. |
| Comment | `inkSecondary` (reused) | De-emphasized text already means "secondary" everywhere else in the app. |
| String literal | `syntaxString` (new) | Nothing existing fit — needed a hue outside the app's warm palette (purple/teal/copper/ochre) so it doesn't misread as a semantic color. |
| Everything else (identifiers, numbers, punctuation, CSS selectors/properties) | `ink` (default) | v1 only highlights 3 token classes; unhandled cases fall back to plain text rather than a wrong color. |

| Name | Hex | Role |
|---|---|---|
| Slate Blue | `#1a5a9e` | `syntaxString`, light mode (6.49:1 on Snow) |
| Slate Blue — Dark | `#8ec2ee` | `syntaxString`, dark mode (10.19:1 on Onyx) |

Both pass the 4.5:1 AA floor below. Reusing `accent` for keywords is the one judgment call worth a second look in review — it doubles as this app's only "tappable/branded" color elsewhere, so a keyword-colored token could misread as interactive inside the code view. Flag if that reads wrong in practice.

## High contrast — not decided, not built

No high-contrast variant exists for any token above, and whether PiG needs one hasn't been decided — this is an open gap, not a considered "no." Don't assume it's out of scope; flag it before either building a high-contrast mode or declaring it unnecessary. Same status as the app-icon concept in `pig-icons-branding`: parked, not resolved.

## Rules

- Status is always **dot + text label**, never color alone.
- Semantic colors (success/warning/destructive) are never reused for anything else (no "5th category color").
- Any *new* color added later must be checked in both directions (as text on its mode's canvas, and as a fill with ink text on top) against a 4.5:1 AA floor before use — follow the same two-step light/dark pattern used for Velvet Orchid, Rosy Copper, and Amber Ochre above; a color failing on one surface almost always needs its own dark-mode step, not a workaround. This includes tints and alpha fills — a string-concatenated `color + 'NN'` is a new color and needs the same check, not an exemption from it.

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every design decision here must also satisfy the other `pig-*` skills — never trade a color rule off against motion, typography, layout, or icon rules to make one screen work. A perceived conflict between two skills is a bug in the skills to raise, not a signal to violate either.
- **No emojis anywhere in the app.** Status, semantic color, and every other visual signal here is conveyed with color + Lucide icon + text, never an emoji standing in for a color or icon.
- **Icons are always `lucide-react-native`** via the shared `Icon` component, colored from these tokens — never a hardcoded hex on an icon, never another icon set.
