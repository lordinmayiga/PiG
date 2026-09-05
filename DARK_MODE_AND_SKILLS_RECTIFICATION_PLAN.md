# Dark-Mode & Skills Rectification Plan

Written 2026-09-04, after auditing all 11 `pig-*` design skills against the slash-command sheet, thinking accordion, model picker, and transcript header. Two artifacts back this plan: *Recessed Fill Fix* and *PiG Design Skills Map* (published this session — ask if you need the links again).

## Status: already done (this session)

- **All 11 `.claude/skills/pig-*/SKILL.md` files** now carry a non-negotiable "Cross-skill guardrails" block: no skill may be violated for another's sake, no emojis anywhere ever, icons are always `lucide-react-native`.
- **`AGENTS.md`** (loaded into every session via `CLAUDE.md`) now states the same enforcement at the project level, so it's in context regardless of which single skill gets triggered.
- **`pig-color-system`**: documented the `neutral[100]`/`[200]` dark-mode gap and its fix (reuse `card`+`border`), and added a validated `accentTint` token (`#f2e3f3` light / `#3a2a3c` dark) to replace the `colors.accent + 'NN'` alpha-string hack.
- **`pig-empty-states`**: doc fixed — emoji starter-chip spec replaced with named Lucide icons (`Search`, `GitCommitHorizontal`, `FlaskConical`, `ListTodo`); touch-target figure corrected from 44px to the authoritative 48dp.
- **`pig-typography`**: documented the real mono-loading path (`src/components/monoFont.ts`) and logged the fixes below; flagged one open scope question (see "Needs a decision" below).
- **Typography enforced in code** (4 spots, `tsc --noEmit` clean):
  - `SlashCommandOverlay.tsx` — command label + usage values: mono → Onest.
  - `ThinkingAccordion.tsx` — path/number segments: mono → Onest (still color-distinguished); genuine backtick `code` segment now loads real Roboto Mono via `monoFont.ts` instead of a system fallback.
  - `Composer.tsx` — slash-trigger `"/"` Text glyph (mono, "techy flourish") → Lucide `SquareSlash` icon.
  - `PairingTokenPanel.tsx` — copyable setup command: bare `fontFamily:'monospace'` → real Roboto Mono via `monoFont.ts`.

## Needs a decision (not actioned)

- **`PairingTokenPanel`'s copyable CLI command** sits outside `pig-typography`'s three listed mono contexts (code block / inline `code` span / file viewer). It's been fixed to load the *correct* font while keeping mono, but whether "a copyable CLI command" becomes a documented 4th context is a design call, not something to decide silently. Flag before touching the skill's scope list.

## Remaining rectification work

### 1. Dark-mode fill fix — implement the `accentTint`/`card`+`border` swap in code

The skill doc and the *Recessed Fill Fix* artifact establish the target; this section is what's still un-applied in the actual components.

**`src/theme/colors.ts`**
- Add `accentTint: '#f2e3f3'` to `lightColors`, `accentTint: '#3a2a3c'` to `darkColors`, and the field to the `ThemeColors` interface.

**`src/components/SlashCommandOverlay.tsx`**
- Search bar fill/border, icon-wrap circle, close button: `colors.neutral[100]` → `colors.card` (fill), `colors.border` stays.
- Command/model badge pill fill: same swap.
- Selected-model row highlight: `colors.accent + '15'` / `+ '25'` → `colors.accentTint`.

**`src/components/ThinkingAccordion.tsx`**
- Streaming body background (`colors.neutral[100]`): → `colors.card` (it already sits inside a `colors.card` container — reads as this being the *only* recessed-fill spot that might instead want `colors.canvas`; check visually once changed, since collapsing card-on-card removes the current visual step entirely).
- Thought-line path pill background (`colors.accent + '18'`): → `colors.accentTint`.

**`src/screens/TranscriptScreen.tsx`**
- Model badge (`modelBadge` style, `~line 453`): fill `colors.neutral[100]` → `colors.card`.

**Verification**: toggle system dark mode (or `ThemeModeProvider`'s override) and confirm none of the above render as a bright patch on the Onyx canvas — visually diff against the *Recessed Fill Fix* artifact's "proposed" column.

### 2. Starter-prompt chips send emoji as part of the actual prompt text

Found while writing this plan — worse than a display-only bug. `TranscriptScreen.tsx`'s `STARTER_PROMPTS` array bakes the emoji into the string itself:

```ts
const STARTER_PROMPTS = [
  '🔎 Explain this project',
  '📜 Summarize recent git commits',
  '🧪 Run test suite',
  '🛠️ What tasks are open?',
];
```

That emoji is sent to the agent as literal prompt text on tap, not just rendered in the UI. Fix: split each entry into `{ icon: LucideIcon, label: string }` (label = the emoji-free prompt text, exactly what `pig-empty-states` now specifies — `Search`/`GitCommitHorizontal`/`FlaskConical`/`ListTodo`), render the icon beside the chip text, and send only `label` as the prompt on tap.

### 3. `TranscriptScreen`'s `KeyboardAvoidingView` reverted to the pre-edge-to-edge bug

`pig-keyboard-handling` documents a 2026-09-02 fix (unconditional `behavior="padding"` on every `KeyboardAvoidingView`, Android included, because `edgeToEdgeEnabled=true` breaks `adjustResize`). `TranscriptScreen.tsx` currently has:

```ts
behavior={Platform.OS === 'ios' ? 'padding' : undefined}
```

with a comment claiming Android's `adjustResize` covers it — it doesn't, under edge-to-edge. This is the composer being clipped by the keyboard on Android. Fix: drop the `Platform.OS` check, use `behavior="padding"` unconditionally, matching `SetupScreen`/`NewSessionSheet`/`RenameSessionSheet`, which the skill says already do this correctly.

## Suggested order

1. `colors.ts` — add `accentTint` (small, no visual risk on its own).
2. `TranscriptScreen.tsx` — keyboard fix (independent, one-line, real functional bug).
3. `TranscriptScreen.tsx` — starter-prompt emoji-in-payload fix (independent, real functional bug).
4. `SlashCommandOverlay.tsx`, `ThinkingAccordion.tsx`, `TranscriptScreen.tsx` model badge — the recessed-fill/tint swap together, then one visual pass in both themes.
5. Re-run `tsc --noEmit`; spot-check against the *Recessed Fill Fix* and *Typography & Motion Rules* artifacts.

Not included here (separate, earlier-open decisions from this review, still pending):
- Model + thinking-level picker redesign (grouped model row + inline low/medium/high control, replacing the flat list).
- `/usage` loading/empty state (replace the overlay's fake initial numbers with a real loading state).
- File-path tap-to-open (thought-line path pills and inline-code spans in agent answers don't open `FileViewerSheet` yet).
