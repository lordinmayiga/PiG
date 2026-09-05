---
name: pig-layout-spacing
description: Use when laying out any PiG screen or component — spacing, corner radius, touch targets, or Android safe-area/edge-to-edge handling.
---

# PiG layout & spacing

- **Spacing scale** (4px base, don't invent off-scale values): `4, 8, 12, 16, 24, 32, 48, 64`.
  - Card padding: 16px. Screen margins: 20px. Gap between list items: 12px.
- **Corner radius by role**, not one flat value everywhere:
  - Chips/badges: 8px
  - Cards: 16px
  - Composer pill / primary buttons: 24px (fully rounded)
  - Bottom-sheet top corners: 24px
- **Touch targets**: 48dp minimum on every tappable element, even inside dense cards — matches both Android convention and the WCAG 44px-equivalent floor.
- **Edge-to-edge / safe area — non-negotiable, checked on every screen.** Android 15 enforces edge-to-edge by default: content draws *behind* the status bar, the gesture/nav bar, and (with the keyboard up) behind nothing extra, but the composer must still clear it. Concretely:
  - Every screen wraps its outermost content in `SafeAreaView` (or reads `useSafeAreaInsets()` from `react-native-safe-area-context`) — never a hardcoded top/bottom padding constant standing in for it.
  - Any element pinned to the **bottom** of a screen — the composer bar, the bottom tab bar, a FAB, a bottom sheet's action row — adds `insets.bottom` on top of its own spacing-scale padding, not instead of it (e.g. composer bottom padding = `16 + insets.bottom`, not a fixed `16`). This is the exact bug class that shipped in the first mockup pass: a control sized against a viewport that ignored real device chrome and got clipped.
  - Any element pinned to the **top** — a screen header, a status/offline banner — does the same with `insets.top`.
  - **Verify at more than one device profile**: a phone with 3-button nav (small bottom inset) *and* one with gesture nav (larger bottom inset, and some have a punch-hole/curved-edge top inset). A layout that only works on one profile has failed this rule.
  - This applies to a browser-based mockup/prototype too, not just the real RN build: size the mockup's chrome against `env(safe-area-inset-*)` (or, for a synthetic device frame drawn in CSS, make sure the *whole frame* — including anything pinned to its bottom edge — is verified to actually fit inside the real viewport it's opened in, at the size it's rendered).

## Cross-skill guardrails

**Non-negotiable.** Every `pig-*` skill's rules are mandatory, not advisory. Violating one — for a deadline, because a screen "looks better" without it, as a "temporary" exception, because the violation is small — is never acceptable. Do not ship code, a mockup, or a skill edit that contradicts any `pig-*` skill. If two skills genuinely conflict, stop and raise it before writing code either way — silently picking one skill over another is exactly the failure mode this rule exists to prevent.

- Every layout decision here must also satisfy the other `pig-*` skills — never trade a spacing/radius/touch-target rule off against another skill to make one screen work; a perceived conflict is a bug in the skills to raise, not a license to violate either. (This is the authoritative touch-target figure — **48dp** — if another skill states a different number, that skill is wrong and should be fixed to match this one.)
- **No emojis anywhere in the app.**
- **Icons are always `lucide-react-native`** via the shared `Icon` component, sized from the 16/20/24 scale in `pig-icons-branding`.
