import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const BRIDGE_PORT = process.env.PIG_BRIDGE_PORT ?? '8787';

/**
 * Phase 6 (FAKE_DATA_ELIMINATION_PLAN.md): proves the real happy path —
 * connect to VPS → see sessions → open a session → send a message → get a
 * real agent reply — end to end through the actual app UI, not a raw
 * WebSocket client. `backend/tests/bridge-e2e.test.ts` drove the backend
 * directly over `ws`; this drives the same backend through the screens a
 * real user taps.
 *
 * Requires, on this machine, right now (not portable to a laptop or a
 * generic CI runner without the same setup):
 * - The real pig-bridge backend already running on PIG_BRIDGE_PORT (8787
 *   by default) — this test does not start it.
 * - A real `claude` CLI on PATH and a configured OpenRouter key (both are
 *   already verified present on this VPS as of Phase 0-5).
 * - `expo start --web` served by Playwright's `webServer` (see
 *   playwright.config.ts).
 */

/** Mints a real, fresh pairing token exactly the way `pig-bridge pair` does
 * (same CLI entrypoint, same `mintPairingToken()` under the hood) and parses
 * its plain-text host/token output — there is no shortcut/back-door path
 * left in the app to bypass this. */
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

/** Drives ConnectStep's manual host/token fields (scan mode is gone — no
 * shortcut buttons exist anymore to bypass this) and submits. */
async function pairThroughUi(page: Page, host: string, token: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder('e.g. 203.0.113.10:8443').fill(host);
  await page.getByPlaceholder('Paste the token from pig-bridge pair').fill(token);
  await page.getByRole('button', { name: 'Connect' }).click();
}

test.describe('Real happy path: pair → sessions → create → send → reply → cleanup', () => {
  test('connects to the real VPS, creates a session, and gets a real agent reply', async ({ page }) => {
    // Auto-accept every window.confirm() — SessionsScreen's requestKill uses
    // window.confirm on web (Alert.alert is a react-native-web no-op), so
    // this is the real destructive-action confirmation, not a bypass.
    page.on('dialog', (dialog) => dialog.accept());

    // --- Pairing: mint a real token and drive the real UI ---
    const { host, token } = await mintRealPairingToken();
    await pairThroughUi(page, host, token);

    // --- Assert real connect: hello/hello_ack landed, Tabs mounted, and
    // Sessions populated from a real resync_snapshot (no fixture fallback
    // exists to mask a failure here). "New session" only ever renders once
    // (either the empty-state button or the FAB, never both), so it's an
    // unambiguous signal the Sessions screen itself — not just the tab bar
    // label, which shares the same text — actually mounted.
    const newSessionButton = page.getByRole('button', { name: 'New session' });
    await expect(newSessionButton).toBeVisible({ timeout: 30_000 });

    // --- Real session create, through the UI ---
    const sessionName = `pig-e2e-${Date.now()}`;
    await newSessionButton.click();

    await page.getByPlaceholder('/root/projects/my-app').fill('/root/projects/PiG');
    const nameField = page.getByPlaceholder('New session');
    await nameField.fill(sessionName);
    await page.getByRole('button', { name: 'Start session' }).click();

    // Sheet submit navigates straight into the new session's Transcript
    // screen — assert the composer mounted, i.e. we're really there.
    const composer = page.getByPlaceholder('Message the agent…');
    await expect(composer).toBeVisible({ timeout: 20_000 });

    // --- Real send-and-reply: this is the original ask — type it, in the
    // app, and it texts back for real. ---
    await composer.fill('reply with exactly PONG');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByText(/PONG/i)).toBeVisible({ timeout: 90_000 });

    // --- Cleanup: kill the test session through the real 2-step confirm
    // flow (menu → Kill session → window.confirm, auto-accepted above) so
    // the VPS doesn't accumulate scratch tmux sessions across runs. ---
    await page.getByRole('button', { name: 'Back to sessions' }).click();
    const optionsButton = page.getByRole('button', { name: `Options for ${sessionName}`, exact: true });
    await expect(optionsButton).toBeVisible({ timeout: 20_000 });

    await optionsButton.click();
    // exact: true — every row's off-screen swipe-kill button in the DOM is
    // labelled "Kill session <name>", which would otherwise substring-match
    // here too. The menu's own button is labelled exactly "Kill session".
    await page.getByRole('button', { name: 'Kill session', exact: true }).click();

    await expect(page.getByRole('button', { name: `Options for ${sessionName}`, exact: true })).toHaveCount(0, {
      timeout: 20_000,
    });

    // The UI removes the card optimistically the instant the swipe/confirm
    // animation completes, *before* the real kill round trip finishes — so
    // the card being gone doesn't by itself prove the tmux session is gone.
    // (This is exactly the class of bug this phase exists to catch: an
    // id-correlation mismatch once left the real action_confirm silently
    // undelivered while the UI still showed a clean kill.) Poll the actual
    // tmux server directly to prove the backend really tore it down.
    await expect(async () => {
      await expect(execFileAsync('tmux', ['has-session', '-t', sessionName])).rejects.toThrow();
    }).toPass({ timeout: 15_000 });
  });
});
