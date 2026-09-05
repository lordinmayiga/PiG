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

/**
 * Journey: Setup screen (fresh pairing) -> create a Claude Code session ->
 *          model badge & /model picker reflect the real agent -> selecting a
 *          model and sending a message round-trips through the real `claude`
 *          CLI without error.
 * States covered: agent = claude-code only (antigravity's equivalent path is
 *          already covered by antigravity-slash-commands.spec.ts).
 * Starting conditions: fresh pairing token, brand-new session each run — same
 *          as every other spec in this suite. No deviation from how a real
 *          user first opens a Claude Code session.
 *
 * UI_FIXES_PLAN.md item 2: before this fix, the model badge always read
 * "Gemini 3.8 Flash (Low)" regardless of agent, and the /model picker always
 * sourced Antigravity's model list — even for a claude-code session.
 */
test.describe('Claude Code model consistency E2E', () => {
  test('claude-code session shows a Claude model badge, lists Claude models, and the selected model reaches the real CLI', async ({ page }) => {
    test.setTimeout(90_000);
    page.on('dialog', (dialog) => dialog.accept());

    const { host, token } = await mintRealPairingToken();
    await pairThroughUi(page, host, token);

    // New Session sheet defaults to "Claude Code" — select it explicitly so
    // this test doesn't silently pass if that default ever changes.
    const newSessionButton = page.getByRole('button', { name: 'New session' });
    await expect(newSessionButton).toBeVisible({ timeout: 30_000 });
    await newSessionButton.click();
    await page.getByRole('radio', { name: 'Claude Code' }).click();
    await page.getByPlaceholder('/root/projects/my-app').fill('/root/projects/PiG');
    await page.getByPlaceholder('New session').fill(`pig-claude-model-${Date.now()}`);
    await page.getByRole('button', { name: 'Start session' }).click();

    const composer = page.getByPlaceholder('Message the agent…');
    await expect(composer).toBeVisible({ timeout: 20_000 });

    // 1. Model badge must reflect the real agent, never the hardcoded
    //    Gemini default (UI_FIXES_PLAN.md item 2's core bug). The badge
    //    starts on a pre-sync placeholder until the session record itself
    //    resolves (a few `SESSION_POLL_MS` ticks plus the OpenRouter
    //    classification attempt's own timeout before falling back), so wait
    //    for the real value with real headroom rather than a tight bound.
    const modelBadge = page.getByTestId('session-model-badge');
    await expect(modelBadge).toBeVisible();
    await expect(modelBadge).toContainText('Claude', { timeout: 30_000 });
    await expect(modelBadge).not.toContainText('Gemini');

    // 2. /model picker must list Claude models, not Antigravity's Gemini list.
    await page.getByTestId('composer-slash-btn').click();
    const sheetTitle = page.getByTestId('slash-sheet-title');
    await expect(sheetTitle).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('slash-search-input').fill('model');
    await page.getByTestId('command-item-model').click();
    await expect(sheetTitle).toHaveText('Choose AI Model');

    const modelPicker = page.getByTestId('model-picker-list');
    await expect(modelPicker).toBeVisible();
    await expect(modelPicker).toContainText('Claude Opus');
    await expect(modelPicker).toContainText('Claude Sonnet');
    await expect(modelPicker).toContainText('Claude Haiku');
    await expect(modelPicker).not.toContainText('Gemini');

    // 3. Select a real, non-default model (Haiku) and confirm the badge updates.
    const haikuItem = page.getByTestId('model-item-haiku');
    await expect(haikuItem).toBeVisible();
    await haikuItem.click();
    await expect(modelBadge).toContainText('Claude Haiku');

    // 4. Send a real message so the selection actually reaches the `claude`
    //    CLI invocation (--model haiku). A user-visible reply proves the CLI
    //    accepted the flag and ran to completion rather than erroring out —
    //    this is the outcome a real user would judge the fix by.
    await composer.fill('What is 9 plus 10? Answer with just the number.');
    await page.getByTestId('composer-send-btn').click();
    const agentBubble = page.getByTestId('agent-turn-bubble');
    await expect(agentBubble).toBeVisible({ timeout: 60_000 });
    await expect(agentBubble).toContainText('19', { timeout: 60_000 });
  });
});
