import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const BRIDGE_PORT = process.env.PIG_BRIDGE_PORT ?? '8787';

/** Mints a real pairing token from the VPS bridge. */
async function mintRealPairingToken(): Promise<{ host: string; token: string }> {
  const { stdout } = await execFileAsync('npx', ['tsx', 'bin/pig-bridge.ts', 'pair'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PIG_BRIDGE_HOST: 'localhost', PIG_BRIDGE_PORT: BRIDGE_PORT },
  });
  const hostMatch = stdout.match(/Host:\s+(\S+)/);
  const tokenMatch = stdout.match(/Token:\s+(\S+)/);
  if (!hostMatch || !tokenMatch) {
    throw new Error(`Could not parse pig-bridge pair output:\n${stdout}`);
  }
  return { host: hostMatch[1], token: tokenMatch[1] };
}

async function pairThroughUi(page: Page, host: string, token: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder('e.g. 203.0.113.10:8443').fill(host);
  await page.getByPlaceholder('Paste the token from pig-bridge pair').fill(token);
  await page.getByRole('button', { name: 'Connect' }).click();
}

async function startSession(page: Page, sessionName: string): Promise<void> {
  const newSessionButton = page.getByRole('button', { name: 'New session' });
  await expect(newSessionButton).toBeVisible({ timeout: 30_000 });
  await newSessionButton.click();
  await page.getByPlaceholder('/root/projects/my-app').fill('/root/projects/PiG');
  await page.getByPlaceholder('New session').fill(sessionName);
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.getByPlaceholder('Message the agent…')).toBeVisible({ timeout: 20_000 });
}

/**
 * Proves the live "agent actions" feed (AGENT_ACTIONS_STREAM_PLAN.md) with
 * an UNCOACHED prompt — no "wrap this in tags" instruction, just a task that
 * genuinely requires the agent to read a real file. This is what the old
 * thinking-stream test got wrong: it only ever passed because the prompt
 * coached the model into a specific text shape. A real tool call needs no
 * coaching on either CLI (verified by hand, see the plan's §0).
 */
test.describe('Agent Actions Stream E2E', () => {
  test('antigravity session: reading a real file shows a live, then completed, action row', async ({ page }) => {
    test.setTimeout(90_000);
    page.on('dialog', (dialog) => dialog.accept());

    const { host, token } = await mintRealPairingToken();
    await pairThroughUi(page, host, token);
    await startSession(page, `pig-agy-actions-${Date.now()}`);

    const composer = page.getByPlaceholder('Message the agent…');
    await composer.fill('Read the file package.json in this directory and tell me the name field.');
    await page.getByTestId('composer-send-btn').click();

    // The feed appears live, while the tool call is still running.
    const feed = page.getByTestId('agent-actions-feed');
    await expect(feed).toBeVisible({ timeout: 45_000 });

    // At least one row mentions package.json (a real file, not a canned string).
    const list = page.getByTestId('agent-actions-list');
    await expect(list).toContainText(/package\.json/i, { timeout: 45_000 });

    // The turn finishes with a real answer referencing the actual name field.
    const agentBubble = page.getByTestId('agent-turn-bubble');
    await expect(agentBubble).toBeVisible({ timeout: 60_000 });
    await expect(agentBubble).toContainText(/pig/i, { timeout: 60_000 });

    // Once done, the header no longer says "Working…" (nothing left running).
    const header = page.getByTestId('agent-actions-header');
    await expect(header).not.toContainText('Working…', { timeout: 10_000 });

    // UI_FIXES_PLAN.md item 1: the feed must auto-collapse to the one-line
    // summary the instant the turn finishes, not stay expanded forever
    // waiting for a manual tap. The row list unmounts entirely when collapsed.
    await expect(list).toBeHidden({ timeout: 10_000 });
    await expect(header).toContainText(/\d+ actions?/);

    // Manual re-expand must still work (auto-collapse isn't one-way).
    await header.click();
    await expect(list).toBeVisible();
    await header.click();
    await expect(list).toBeHidden();
  });
});

// The 7-row cap (UI_FIXES_PLAN.md item 1's other half) is deliberately NOT
// tested here: a real, uncoached prompt asking for 8 file reads was tried
// and the agent satisfied it in a single batched tool call (1 real action,
// not 8) — a genuinely capable, real agent doesn't reliably produce an
// ungrouped 8+-action turn on demand, and forcing the wording until it does
// would mean fabricating the state rather than observing it (see
// e2e-test-methodology's Rule 2). The cap itself is covered instead by
// `src/components/__tests__/AgentActionsFeed.test.tsx`, a component-level
// test with synthetic actions, which is the correct place to pin down "does
// slicing to 7 actually work" once agent behavior can't guarantee the
// precondition.
