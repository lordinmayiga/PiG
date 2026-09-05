---
name: e2e-test-selector
description: Companion skill to e2e-test-methodology. Use this BEFORE running or writing any Playwright end-to-end test suite, whenever the user asks to "run the E2E tests," "test this feature end-to-end," or "check if X works" via browser tests. This skill's job is to always stop and confirm with the user, before any test executes, exactly which tests are about to run, which state variations (e.g. in-stock vs out-of-stock, logged-in vs guest) to include this run, and what starting conditions each test uses — flagging any discrepancy from a real user's actual starting conditions. Never skip this pre-flight step to save time; always ask before executing.
---

# E2E Test Selector (Pre-flight Companion)

This skill governs the conversation that must happen *before* any E2E test
(written per `e2e-test-methodology`) is actually executed. Its entire purpose
is to stop, surface information, and get explicit confirmation — never to
silently pick defaults and run.

Use this every time, even for a single test, even if the user seems to be in
a hurry. The whole value of this skill is that it never gets skipped.

## What to do, in order

### 1. Build the candidate test list

Identify which existing test(s) or new test(s) this request maps to. If test
files already exist for the feature/change in question, list them by name
and journey (per the "Documenting a test" template in
`e2e-test-methodology`). If tests need to be newly written, list the journeys
you're proposing to cover instead.

Present this list to the user plainly:

> Here's what I'm planning to run:
> - `checkout.spec.ts` — landing page → add to cart → checkout → confirm order
> - `discount-code.spec.ts` — landing page → login → apply discount → checkout

### 2. Surface the meaningful state variations

For the feature(s) in scope, list the state variations identified per Rule 4
of `e2e-test-methodology` (stock/no-stock, guest/logged-in, discount
active/expired, fresh/returning session, etc.) and ask the user which of
these to include in this run. Do not assume "all of them" or "just one" —
this is always the user's call, made explicit each time.

> This feature has these meaningful states: in-stock, out-of-stock,
> logged-in, guest. Which should I include this run — all four, or a subset?

Wait for the answer before proceeding. If the user picks a subset, say so
back to confirm, and note (briefly) what's being left uncovered this run so
it isn't silently forgotten.

### 3. Surface starting conditions and flag discrepancies

For each test in the confirmed list, state the starting condition it will
actually use (fresh session, cleared localStorage/cache, seeded account,
etc.), and explicitly flag anywhere this differs from how a real user would
actually arrive — including a brief risk judgment (could this deviation hide
or fabricate a bug?), per Rule 2 of `e2e-test-methodology`.

> `checkout.spec.ts` will run with a fully cleared localStorage/cache, as if
> this is the user's first-ever visit. Most of your real users are
> returning visitors with existing cart/session data in localStorage, so
> this is a deviation. Risk: medium — if a returning-user bug exists in cart
> merge logic, this test won't catch it.

If there is no meaningful deviation for a given test, say so briefly rather
than omitting the point entirely — the user should be able to trust that
silence means "checked, no issue" rather than "not checked."

### 4. Stop and wait for explicit go-ahead

After presenting 1–3, stop. Do not execute any test until the user responds.
The user may:
- Approve as-is
- Narrow or expand the test list
- Change which state variations to include
- Push back on a flagged deviation (e.g. "run it with a returning-user
  session too this time")

Only proceed to actually run (or write, if tests don't exist yet) the tests
once the user has responded. Never treat lack of objection *before* you've
finished presenting all three sections as approval — always finish the full
picture (list, variations, conditions) before waiting for a response.

### 5. After running

Report results per test, and if any test failed partway through a journey
(per Rule 1's fail-fast philosophy), be explicit about *where* in the
journey it failed — don't just report "checkout.spec.ts failed," report
"failed at the login step, before ever reaching checkout" so the user knows
whether the target feature itself was even exercised.

## What this skill is not

- It doesn't decide test *methodology* (how a test is structured, what
  fidelity a test should have to real conditions by default) — that's
  `e2e-test-methodology`. This skill decides *scope and confirmation* for a
  given run.
- It isn't a substitute for writing good tests — if the candidate list in
  step 1 doesn't exist yet, hand off to `e2e-test-methodology` to write it,
  then come back to this skill's steps 2–4 before executing.
