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
 * Journey: Setup screen -> create a session whose working folder is a real
 *          subdirectory -> tap the folder icon from within that session ->
 *          File Explorer opens.
 * States covered: single meaningful state — every session always has a
 *          folder now, so there's no "no folder" variant to also cover.
 * Starting conditions: fresh pairing token, brand-new session with folder
 *          "/root/projects/PiG" (a real, populated directory on this VPS).
 *          No deviation from a real user's flow.
 *
 * UI_FIXES_PLAN.md item 3: before this fix, File Explorer always opened at
 * the backend's global default root ("/root/projects", which lists PiG as
 * one sibling folder among others) instead of the session's own folder.
 * This test proves the difference is user-visible, not just a param that's
 * threaded through and silently ignored: the backend's default root and the
 * session's folder produce genuinely different directory listings on this
 * VPS, so landing on the wrong one is directly observable.
 */
test.describe('Files screen default folder E2E', () => {
  test('opens directly into the session folder, not the global default root', async ({ page }) => {
    test.setTimeout(60_000);
    page.on('dialog', (dialog) => dialog.accept());

    const { host, token } = await mintRealPairingToken();
    await pairThroughUi(page, host, token);

    const newSessionButton = page.getByRole('button', { name: 'New session' });
    await expect(newSessionButton).toBeVisible({ timeout: 30_000 });
    await newSessionButton.click();
    await page.getByPlaceholder('/root/projects/my-app').fill('/root/projects/PiG');
    await page.getByPlaceholder('New session').fill(`pig-files-default-${Date.now()}`);
    await page.getByRole('button', { name: 'Start session' }).click();

    const composer = page.getByPlaceholder('Message the agent…');
    await expect(composer).toBeVisible({ timeout: 20_000 });

    // Wait for the session record itself (not just the composer, which
    // renders before the backend's session list has synced) to be resolved
    // client-side — the model badge switching off its pre-sync placeholder
    // is a real, already-user-visible signal that `session.folder` is also
    // now available, since both come from the same session lookup. This can
    // take a few `SESSION_POLL_MS` (5s) ticks plus the OpenRouter
    // classification attempt's own timeout before falling back to the local
    // classifier, so give it real headroom rather than a tight bound.
    await expect(page.getByTestId('session-model-badge')).toContainText('Claude', { timeout: 30_000 });

    await page.getByRole('button', { name: 'Open file explorer' }).click();

    // Breadcrumb must show we're already inside "PiG", not at the app-wide
    // default root ("Working folder" alone, or a listing that still has to
    // descend into a "PiG" entry).
    await expect(page.getByText('File Explorer')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('PiG', { exact: true })).toBeVisible({ timeout: 15_000 });

    // The listing must show PiG's own contents (real subfolders/files that
    // only exist inside the repo), not the global default root's listing
    // (which would show "PiG" itself as a top-level entry instead).
    await expect(page.getByText('backend', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('src', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('package.json', { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
