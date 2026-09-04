import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const BRIDGE_PORT = process.env.PIG_BRIDGE_PORT ?? '8787';

/**
 * Mints a fresh real pairing token via the backend CLI.
 */
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

/**
 * Connects through the Setup screen.
 */
async function pairThroughUi(page: Page, host: string, token: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder('e.g. 203.0.113.10:8443').fill(host);
  await page.getByPlaceholder('Paste the token from pig-bridge pair').fill(token);
  await page.getByRole('button', { name: 'Connect' }).click();
}

test.describe('Chat & Connection Scenarios E2E', () => {
  test.setTimeout(120_000);

  test('Scenario 1: Connect to VPS -> Open session -> Send message -> Verify single reply without duplication', async ({ page }) => {
    // Auto-accept confirmation dialogs for clean session cleanup
    page.on('dialog', (dialog) => dialog.accept());

    // 1. Connect to VPS with a real fresh token
    const { host, token } = await mintRealPairingToken();
    await pairThroughUi(page, host, token);

    // 2. Wait for Sessions screen to mount
    const newSessionButton = page.getByRole('button', { name: 'New session' });
    await expect(newSessionButton).toBeVisible({ timeout: 30_000 });

    // 3. Create a new session with Antigravity agent
    const sessionName = `pig-agy-${Date.now()}`;
    await newSessionButton.click();

    await page.getByRole('radio', { name: 'Antigravity' }).click();
    await page.getByPlaceholder('/root/projects/my-app').fill('/root/projects/PiG');
    const nameField = page.getByPlaceholder('New session');
    await nameField.fill(sessionName);
    await page.getByRole('button', { name: 'Start session' }).click();

    // 4. Verify Transcript screen mounted
    const composer = page.getByPlaceholder('Message the agent…');
    await expect(composer).toBeVisible({ timeout: 20_000 });

    // 5. Send message with distinct prompt so user text doesn't contain the expected answer
    await composer.fill('What is 20 + 22? Reply with only the number.');
    await page.getByRole('button', { name: 'Send message' }).click();

    // 6. Confirm real agent response in UI
    const agentHeader = page.getByText('Agent').first();
    await expect(agentHeader).toBeVisible({ timeout: 30_000 });

    const answerLocator = page.getByText('42', { exact: true });
    await expect(answerLocator).toBeVisible({ timeout: 90_000 });

    // Wait a brief moment for any stray duplicate chunks to settle
    await page.waitForTimeout(3000);

    // 7. Strictly assert that 42 is NOT duplicated in the UI
    const count = await answerLocator.count();
    expect(count).toBe(1);

    // Cleanup: kill the created test session
    await page.getByRole('button', { name: 'Back to sessions' }).click();
    const optionsButton = page.getByRole('button', { name: `Options for ${sessionName}`, exact: true });
    await expect(optionsButton).toBeVisible({ timeout: 20_000 });
    await optionsButton.click();
    const killButton = page.getByRole('button', { name: 'Kill session', exact: true });
    await killButton.click();
  });

  test('Scenario 2: Input wrong token on purpose -> Verify error handling', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 30_000 });

    // Fill valid host with an intentionally invalid token
    await page.getByPlaceholder('e.g. 203.0.113.10:8443').fill(`localhost:${BRIDGE_PORT}`);
    await page.getByPlaceholder('Paste the token from pig-bridge pair').fill('wrong-invalid-pairing-token-xyz');
    await page.getByRole('button', { name: 'Connect' }).click();

    // Verify error UI is displayed
    await expect(page.getByText("Token didn't work")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/That pairing token is invalid or has expired/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    // Verify user was NOT let into the app
    await expect(page.getByRole('button', { name: 'New session' })).not.toBeVisible();
  });

  test('Scenario 3: Correct token -> Delete token from storage -> Send message -> User informed to log in again', async ({ page }) => {
    let alertMessage = '';
    page.on('dialog', async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    // 1. Connect to VPS with a real fresh token
    const { host, token } = await mintRealPairingToken();
    await pairThroughUi(page, host, token);

    // 2. Wait for Sessions screen
    const newSessionButton = page.getByRole('button', { name: 'New session' });
    await expect(newSessionButton).toBeVisible({ timeout: 30_000 });

    // 3. Create a session
    const sessionName = `pig-e2e-del-${Date.now()}`;
    await newSessionButton.click();

    await page.getByPlaceholder('/root/projects/my-app').fill('/root/projects/PiG');
    const nameField = page.getByPlaceholder('New session');
    await nameField.fill(sessionName);
    await page.getByRole('button', { name: 'Start session' }).click();

    const composer = page.getByPlaceholder('Message the agent…');
    await expect(composer).toBeVisible({ timeout: 20_000 });

    // 4. Simulate deleting token from storage while in session
    await page.evaluate(() => {
      localStorage.removeItem('pig.bridge.token');
      localStorage.removeItem('pig.bridge.host');
    });

    // 5. Try to send a message after token is deleted
    await composer.fill('Hello after token deleted');
    await page.getByRole('button', { name: 'Send message' }).click();

    // 6. Assert user is informed that session expired / need to reconnect
    await expect.poll(() => alertMessage).toContain('Session expired. Please reconnect to your VPS.');

    // 7. Verify that app redirects back to Setup screen so user can re-pair
    await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 10_000 });
  });
});
