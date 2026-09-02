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

## Rules

- Status is always **dot + text label**, never color alone.
- Semantic colors (success/warning/destructive) are never reused for anything else (no "5th category color").
- Any *new* color added later must be checked in both directions (as text on its mode's canvas, and as a fill with ink text on top) against a 4.5:1 AA floor before use — follow the same two-step light/dark pattern used for Velvet Orchid, Rosy Copper, and Amber Ochre above; a color failing on one surface almost always needs its own dark-mode step, not a workaround.
