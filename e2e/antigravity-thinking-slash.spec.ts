import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const BRIDGE_PORT = process.env.PIG_BRIDGE_PORT ?? '8787';

/** Mints a real pairing token from the VPS bridge. */
async function mintRealPairingToken(): Promise<{ host: string; token: string }> {
  const { stdout } = await execFileAsync(
    'npx',
    ['tsx', 'bin/pig-bridge.ts', 'pair'],
    {
      cwd: BACKEND_DIR,
      env: { ...process.env, PIG_BRIDGE_HOST: 'localhost', PIG_BRIDGE_PORT: BRIDGE_PORT },
    },
  );
  const hostMatch = stdout.match(/Host:\s+(\S+)/);
  const tokenMatch = stdout.match(/Token:\s+(\S+)/);
  if (!hostMatch || !tokenMatch) {
    throw new Error(`Could not parse pig-bridge pair output:\n${stdout}`);
  }
  return { host: hostMatch[1], token: tokenMatch[1] };
}

/** Drives ConnectStep to pair with the VPS bridge. */
async function pairThroughUi(page: Page, host: string, token: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder('e.g. 203.0.113.10:8443').fill(host);
  await page.getByPlaceholder('Paste the token from pig-bridge pair').fill(token);
  await page.getByRole('button', { name: 'Connect' }).click();
}

test.describe('Antigravity Thinking Stream & Slash Commands Overlay E2E', () => {
  test('pairs, manages /model & /usage slash commands, and verifies real thinking stream with agy', async ({ page }) => {
    test.setTimeout(90_000);
    // Auto-accept confirmation dialogs
    page.on('dialog', (dialog) => dialog.accept());

    // 1. Pairing
    const { host, token } = await mintRealPairingToken();
    await pairThroughUi(page, host, token);

    const newSessionButton = page.getByRole('button', { name: 'New session' });
    await expect(newSessionButton).toBeVisible({ timeout: 30_000 });

    // 2. Create an Antigravity session (name containing "agy" so inferAgentKind assigns antigravity)
    const sessionName = `pig-agy-${Date.now()}`;
    await newSessionButton.click();

    await page.getByPlaceholder('/root/projects/my-app').fill('/root/projects/PiG');
    const nameField = page.getByPlaceholder('New session');
    await nameField.fill(sessionName);
    await page.getByRole('button', { name: 'Start session' }).click();

    // Verify Transcript screen mounted
    const composer = page.getByPlaceholder('Message the agent…');
    await expect(composer).toBeVisible({ timeout: 20_000 });

    // 3. Test Slash Commands Overlay: /model
    const slashBtn = page.getByTestId('composer-slash-btn');
    await expect(slashBtn).toBeVisible();
    await slashBtn.click();

    // Assert overlay sheet opened
    const sheetTitle = page.getByTestId('slash-sheet-title');
    await expect(sheetTitle).toBeVisible({ timeout: 10_000 });
    await expect(sheetTitle).toHaveText('Commands & Tools');

    // Test zero-lag instant client filter
    const searchInput = page.getByTestId('slash-search-input');
    await searchInput.fill('model');

    const modelCmdItem = page.getByTestId('command-item-model');
    await expect(modelCmdItem).toBeVisible();
    await modelCmdItem.click();

    // Verify Model Picker view opened
    await expect(sheetTitle).toHaveText('Choose AI Model');
    const modelPicker = page.getByTestId('model-picker-list');
    await expect(modelPicker).toBeVisible();

    // Select Gemini 3.8 Flash (Low)
    const flashLowItem = page.getByTestId('model-item-gemini-3.8-flash-low');
    await expect(flashLowItem).toBeVisible();
    await flashLowItem.click();

    // Verify overlay closed and model badge updated
    const modelBadge = page.getByTestId('session-model-badge');
    await expect(modelBadge).toBeVisible();
    await expect(modelBadge).toContainText('Gemini 3.8 Flash (Low)');

    // 4. Send prompt that exercises real thinking and answer generation via agy
    await composer.fill('Think step by step in <thought> tags first, then output the answer: What is 17 * 23?');
    const sendBtn = page.getByTestId('composer-send-btn');
    await sendBtn.click();

    // Verify thinking stream arrives and thinking accordion appears
    const thinkingAccordion = page.getByTestId('thinking-accordion');
    await expect(thinkingAccordion).toBeVisible({ timeout: 45_000 });

    // Wait for the final agent answer (391) to arrive in the agent bubble
    const agentBubble = page.getByTestId('agent-turn-bubble');
    await expect(agentBubble).toBeVisible({ timeout: 60_000 });
    await expect(agentBubble).toContainText('391');

    // Verify thinking accordion header exists and can be expanded
    const thinkingHeader = page.getByTestId('thinking-header');
    await expect(thinkingHeader).toBeVisible();
    await thinkingHeader.click();

    // Verify expanded thinking content is visible
    const thinkingBody = page.getByTestId('thinking-body');
    await expect(thinkingBody).toBeVisible();

    // 5. Test Slash Command: /usage
    await slashBtn.click();
    await expect(sheetTitle).toHaveText('Commands & Tools');

    const usageCmdItem = page.getByTestId('command-item-usage');
    await expect(usageCmdItem).toBeVisible();
    await usageCmdItem.click();

    // Verify Session Usage view
    await expect(sheetTitle).toHaveText('Session Usage');
    const usageList = page.getByTestId('usage-view-list');
    await expect(usageList).toBeVisible();
    await expect(page.getByText('Input Tokens')).toBeVisible();
    await expect(page.getByText('Output Tokens')).toBeVisible();
    await expect(page.getByText('Total Tokens')).toBeVisible();

    // Close usage sheet
    const closeBtn = page.getByTestId('slash-close-btn');
    await closeBtn.click();
    await expect(sheetTitle).toHaveCount(0);

    // 6. Cleanup session
    await page.getByRole('button', { name: 'Back to sessions' }).click();
    const optionsButton = page.getByRole('button', { name: `Options for ${sessionName}`, exact: true });
    await expect(optionsButton).toBeVisible({ timeout: 20_000 });

    await optionsButton.click();
    const killBtn = page.getByRole('button', { name: 'Kill session', exact: true });
    await expect(killBtn).toBeVisible({ timeout: 10_000 });
    await killBtn.click();

    await expect(page.getByRole('button', { name: `Options for ${sessionName}`, exact: true })).toHaveCount(0, {
      timeout: 20_000,
    });

    await expect(async () => {
      await expect(execFileAsync('tmux', ['has-session', '-t', sessionName])).rejects.toThrow();
    }).toPass({ timeout: 15_000 });
  });
});
