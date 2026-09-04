import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const BRIDGE_PORT = process.env.PIG_BRIDGE_PORT ?? '8787';

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
 * Proves tapping a file:// link inside an agent reply opens FileViewerSheet
 * with the real file's content — AGENT_ACTIONS_STREAM_PLAN.md §0 confirmed
 * agy really does emit `file:///abs/path#L2`-shaped links in its own
 * answers when it references a file it just read.
 */
test.describe('File Link Preview E2E', () => {
  test('tapping a file link in an agent reply opens the real file in FileViewerSheet', async ({ page }) => {
    test.setTimeout(90_000);
    page.on('dialog', (dialog) => dialog.accept());

    const { host, token } = await mintRealPairingToken();
    await pairThroughUi(page, host, token);
    await startSession(page, `pig-agy-filelink-${Date.now()}`);

    const composer = page.getByPlaceholder('Message the agent…');
    await composer.fill(
      'Read package.json and reply with just a markdown link to it, like [package.json](file:///root/projects/PiG/package.json).',
    );
    await page.getByTestId('composer-send-btn').click();

    const fileLink = page.getByTestId('markdown-file-link');
    await expect(fileLink).toBeVisible({ timeout: 60_000 });
    await expect(fileLink).toContainText('package.json');
    await fileLink.click();

    const sheet = page.getByTestId('file-viewer-sheet');
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(sheet).toContainText('"name"');
  });
});
