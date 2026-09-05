import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const BRIDGE_PORT = process.env.PIG_BRIDGE_PORT ?? '8787';

async function mintPairingToken(): Promise<{ host: string; token: string }> {
  const { stdout } = await execFileAsync(
    'npx',
    ['tsx', 'bin/pig-bridge.ts', 'pair'],
    {
      cwd: BACKEND_DIR,
      env: { ...process.env, PIG_BRIDGE_HOST: '127.0.0.1', PIG_BRIDGE_PORT: BRIDGE_PORT },
    },
  );
  const hostMatch = stdout.match(/Host:\s+(\S+)/);
  const tokenMatch = stdout.match(/Token:\s+(\S+)/);
  if (!hostMatch || !tokenMatch) {
    throw new Error(`Could not parse pig-bridge pair output:\n${stdout}`);
  }
  return { host: hostMatch[1], token: tokenMatch[1] };
}

test.describe('Connection Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    // Auto-accept window.confirm on web
    page.on('dialog', (dialog) => dialog.accept());

    // Clear storage to ensure a clean start at the Setup screen
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
  });

  test('Scenario 1: Rejection of invalid pairing token shows error and never says connected', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(msg.text()));

    await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 15_000 });

    // Fill in valid host but an invalid token
    await page.getByPlaceholder('e.g. 203.0.113.10:8443').fill(`127.0.0.1:${BRIDGE_PORT}`);
    await page.getByPlaceholder('Paste the token from pig-bridge pair').fill('completely-invalid-bogus-token-12345');
    await page.getByRole('button', { name: 'Connect' }).click();

    // Verify error UI is displayed
    await expect(page.getByText("Token didn't work")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/That pairing token is invalid or has expired/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    // Assert that it did NOT say connected
    expect(logs.some((l) => l.includes('Connected to VPS'))).toBe(false);

    // Assert noisy transport logs are completely suppressed
    expect(logs.some((l) => l.includes('Opening WebSocket'))).toBe(false);
    expect(logs.some((l) => l.includes('WebSocket opened successfully'))).toBe(false);
  });

  test('Scenario 2: Token works for setup test, then disconnect is detected when connection drops', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(msg.text()));

    const { host, token } = await mintPairingToken();

    await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder('e.g. 203.0.113.10:8443').fill(host);
    await page.getByPlaceholder('Paste the token from pig-bridge pair').fill(token);
    await page.getByRole('button', { name: 'Connect' }).click();

    // Setup finishes and navigates into app
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 25_000 });
    expect(logs.some((l) => l.includes('Connected to VPS'))).toBe(true);

    await page.getByRole('tab', { name: 'Settings' }).click();
    const disconnectRow = page.getByRole('button', { name: 'Disconnect' });
    await expect(disconnectRow).toBeVisible({ timeout: 10_000 });
    await disconnectRow.click();

    // Verify user is returned to setup screen and "Disconnected from VPS" was logged
    await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 10_000 });
    expect(logs.some((l) => l.includes('Disconnected from VPS'))).toBe(true);
  });

  test('Scenario 3: 100% Success - Pair, connect, load sessions with clean logs', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(msg.text()));

    const { host, token } = await mintPairingToken();

    await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder('e.g. 203.0.113.10:8443').fill(host);
    await page.getByPlaceholder('Paste the token from pig-bridge pair').fill(token);
    await page.getByRole('button', { name: 'Connect' }).click();

    // App enters session shell
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 25_000 });

    // Verify clean logging: "Connected to VPS" appears, but no transport spam
    expect(logs.some((l) => l.includes('Connected to VPS'))).toBe(true);
    expect(logs.some((l) => l.includes('Opening WebSocket'))).toBe(false);
    expect(logs.some((l) => l.includes('WebSocket opened successfully'))).toBe(false);
    expect(logs.some((l) => l.includes('WebSocket closed from'))).toBe(false);
  });

  test('Scenario 4: Client-side host verification rejects invalid formats and sanitizes URL inputs', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(msg.text()));

    const { host, token } = await mintPairingToken();

    await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 15_000 });

    const hostInput = page.getByPlaceholder('e.g. 203.0.113.10:8443');
    const tokenInput = page.getByPlaceholder('Paste the token from pig-bridge pair');
    const connectButton = page.getByRole('button', { name: 'Connect' });

    await tokenInput.fill(token);

    // 1. Missing port
    await hostInput.fill('127.0.0.1');
    await connectButton.click();
    await expect(page.getByText('Port is required (e.g. 203.0.113.10:8443)')).toBeVisible();
    // Still on setup screen
    await expect(page.getByText('Connect to your VPS')).toBeVisible();

    // 2. Port out of range
    await hostInput.fill('127.0.0.1:99999');
    await connectButton.click();
    await expect(page.getByText('Port must be between 1 and 65535')).toBeVisible();

    // 3. Malformed hostname
    await hostInput.fill('invalid@host!:8787');
    await connectButton.click();
    await expect(page.getByText('Invalid hostname or IP address format')).toBeVisible();

    // 4. Pasting with protocol and trailing slash (e.g. "ws://127.0.0.1:8787/") auto-sanitizes and connects
    await hostInput.fill(`ws://${host}/`);
    await connectButton.click();

    // Successfully connects and reaches main app
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 25_000 });
    expect(logs.some((l) => l.includes('Connected to VPS'))).toBe(true);
  });
});

