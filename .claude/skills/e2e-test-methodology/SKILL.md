---
name: e2e-test-methodology
description: How to write end-to-end browser tests with Playwright (headless) that give real assurance a feature works for actual users. Use this whenever the user asks to write, add, or review an E2E test, a Playwright test, a browser test, or a "does this feature actually work" test — and always use it together with the e2e-test-selector skill, which handles picking which tests to run and what starting conditions to use before any test in this style is written or executed. Do not use for unit tests, component tests, or API/integration tests that don't drive a real browser.
---

# E2E Test Methodology (Playwright)

This skill defines *how* to write an end-to-end browser test so that a passing
test is actually trustworthy. It exists because it's easy to write E2E tests
that pass in CI but don't prove anything about what a real user experiences.
The rules below close that gap.

Always pair this with **e2e-test-selector**, which handles the pre-flight
conversation about *which* tests and starting states to run. This skill
covers what happens once you're actually writing/executing test code.

## Core principle

**A passing test must mean: "a real user, arriving at the site the way real
users arrive, can carry out this entire journey and reach the goal."**

Not: "the target feature works in isolation, assuming everything upstream is
already in a convenient state." If a test starts from a convenient shortcut
(pre-seeded session, direct deep link, cleared storage) instead of how a real
user actually arrives, a pass doesn't tell you the feature works for real
users — only that it works under lab conditions. Treat that gap as a defect
in the test, not an acceptable simplification, unless it's been explicitly
flagged and justified (see "Fidelity to real conditions" below).

## Rule 1: Full journeys, no shortcuts

- Every test starts from where a real user actually starts — typically the
  unauthenticated landing page — not from a pre-authenticated session, a
  seeded database state, or a deep link into the middle of a flow. If login
  is part of how users normally reach the feature, login is part of the test.
- Walk every step in between exactly as a user would: navigation, clicks,
  waits for real UI feedback (not arbitrary sleeps) — until the objective is
  reached.
- **A test must fail if anything on the path is broken**, even if the
  "target" feature at the end of the journey would have worked fine in
  isolation. The whole point is that a pass certifies the *entire path*, not
  just the destination. Don't wrap upstream steps in try/catch that swallow
  failures, and don't skip past broken intermediate steps to "still test the
  real thing."
- Exception: if the feature is genuinely and legitimately entered a different
  way in real life (e.g. a marketing email deep-links straight to a landing
  page with its own auth), that's a valid journey to encode as its own test —
  it's still the *real* path for that entry point, not a shortcut.
- Consequence you should expect and accept: these tests are slower and more
  exposed to unrelated upstream breakage. That's intentional. If unrelated
  churn upstream is making tests noisy, the fix is to fix the upstream
  flakiness/instability — not to shortcut past it in the test.

## Rule 2: Fidelity to real user conditions — flag every deviation

Automation defaults are frequently *not* what a typical real user looks like:
fresh browser profile, empty localStorage, cleared cache, no cookies, no
browser extensions, fixed viewport, fast/unthrottled network. Each of these
is a hypothesis about the user's environment, and hypotheses can be wrong in
ways that hide real bugs (e.g. a bug that only manifests for returning users
with stale localStorage will never be caught by an always-fresh-session test).

For every test, explicitly document:
1. What starting conditions this test actually uses.
2. How that differs from a real user's likely starting conditions.
3. A concrete judgment call on risk: could this specific deviation plausibly
   hide a bug, or fabricate a false failure, that wouldn't occur (or would
   occur differently) for a real user? State yes/no and why.

Do not silently default to "fresh everything" and move on. If a deviation is
low-risk (e.g. this feature genuinely behaves identically regardless of
localStorage contents), say so and move on quickly — but say so.

Where practical and proportionate, prefer running the *most realistic*
variant as at least one of the test's states — e.g. a returning-user session
alongside (or instead of) a fresh one — rather than only ever testing the
easiest-to-automate condition.

## Rule 3: Test behavior and state, not input validation

Assume forms and inputs already validate their own data elsewhere (unit or
integration tests own that responsibility). E2E tests use valid inputs and
focus on what happens *given* valid input: does the flow work, does the UI
reflect the right state, does the right outcome occur.

Do not use E2E tests to probe malformed input, boundary values, injection
attempts, etc. — that's out of scope here and belongs to a different test
layer. If you find yourself writing `fill('email', 'not-an-email')` to check
for a validation message, stop — that's not this skill's job.

## Rule 4: Enumerate meaningful state variations, not just the happy path

For any feature, identify the states that could plausibly change its
behavior, and treat each as its own test case (or parametrized variant of
one) rather than testing a single path and calling it done.

Examples of "meaningful state" to look for:
- Availability/inventory state (in stock vs. out of stock, sold out mid-flow)
- Identity state (guest vs. logged-in, different roles/permissions)
- Account/data state (empty cart vs. full cart, new account vs. established
  account with history)
- Feature/eligibility state (discount active vs. expired vs. not-yet-started,
  feature-flag on/off)
- Prior-session state (fresh vs. returning user — see Rule 2)

Don't invent variations that don't change behavior just to pad coverage —
the goal is meaningful states, not maximal enumeration.

## Rule 5: Pass/fail must reflect reality, not convenience

- No soft-passes, no "expected failures" quietly baked into the test to make
  CI green. If the feature is broken, the test fails, full stop.
- Assertions should check the actual user-visible outcome (page content,
  visible state, navigation) rather than internal implementation details
  (e.g. a specific API call was made) whenever a user-visible check is
  available — implementation details can pass while users see a broken page.
- Timeouts and retries should tolerate real-world timing variance (network,
  animation) but never mask an actual functional failure. Retrying a failed
  assertion until it happens to pass is not acceptable; retrying a flaky
  *selector* wait is.

## Playwright specifics

- Use Playwright's built-in auto-waiting and web-first assertions
  (`expect(locator).toBeVisible()`, etc.) instead of manual `sleep`/`waitForTimeout`
  calls, so tests wait for real conditions rather than arbitrary time.
- Use `page.goto()` only for the true entry point of the journey (e.g. the
  homepage or a legitimate deep-link entry point per Rule 1) — not to jump
  past steps.
- For state variations (Rule 4), prefer Playwright's `test.describe` +
  parametrization or fixtures to keep the journey logic shared and the state
  differences explicit and readable, rather than duplicating whole journeys
  with tiny edits.
- Reuse journey segments (e.g. a `loginAs(user)` or `landOnHomepage()`
  helper) so the full-journey requirement (Rule 1) doesn't mean copy-pasting
  the same login flow into every spec file. Shared helpers are fine as long
  as they still perform the *real* steps (actually filling in and submitting
  the login form) rather than shortcutting (e.g. injecting a session token
  directly).
- Run headless by default for CI, but keep the option to run headed
  (`--headed`) / with `--debug` for local investigation of failures.

## Documenting a test (template)

Every test file or test case should carry a short header comment covering:

```
// Journey: <where it starts (real user entry point)> -> <objective>
// States covered: <list of state variations this test/parametrization covers>
// Starting conditions: <session/localStorage/cache state used>
// Deviation from real user: <none, or what differs and the risk judgment>
```

This keeps Rules 1–4 auditable at a glance without having to read the whole
test body.
