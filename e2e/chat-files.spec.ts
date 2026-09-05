import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const BRIDGE_PORT = process.env.PIG_BRIDGE_PORT ?? '8787';

/**
 * Mints a fresh pairing token via the backend CLI.
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

test.describe('Phase 8: Chat Attachments, Fullscreen Viewer, Markdown & Browser Tab', () => {
  test.setTimeout(120_000);

  test('TabStrip renders without DOM nesting errors on web and handles tabs', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const { host, token } = await mintRealPairingToken();
    await pairThroughUi(page, host, token);

    // Wait for Tab Navigator to mount
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 30_000 });

    // Navigate to Browser bottom tab
    const browserTabButton = page.getByRole('tab', { name: 'Browser' });
    await browserTabButton.click();

    // Verify TabStrip mounted
    const newTabButton = page.getByLabel('Open new tab');
    await expect(newTabButton).toBeVisible({ timeout: 10_000 });

    // Open a new tab
    await newTabButton.click();
    await expect(page.getByRole('button', { name: /Switch to tab: New tab/i })).toHaveCount(2);

    // Assert NO invalid nesting error (<button> inside <button>)
    const nestingError = consoleErrors.some(
      (err) => err.includes('cannot be a descendant of') || err.includes('validateDOMNesting'),
    );
    expect(nestingError).toBeFalsy();

    // Close the second tab
    const closeButtons = page.getByLabel(/Close tab: New tab/i);
    await closeButtons.first().click();
    await expect(page.getByRole('button', { name: /Switch to tab: New tab/i })).toHaveCount(1);
  });

  test('FileViewerSheet supports fullscreen expansion, markdown dual-mode, and HTML open-in-browser', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());

    // Prepare fixture HTML and Markdown in root working directory so they are directly listed
    const fixtureHtml = path.join('/root/projects', 'phase8-preview-fixture.html');
    writeFileSync(fixtureHtml, '<!DOCTYPE html><html><body><h1>Phase 8 Preview</h1></body></html>');

    const fixtureMd = path.join('/root/projects', 'phase8-preview-fixture.md');
    writeFileSync(fixtureMd, '# Phase 8 Markdown Header\n\nThis is a **bold** preview test.\n\n```json\n{"ok": true}\n```');

    try {
      const { host, token } = await mintRealPairingToken();
      await pairThroughUi(page, host, token);

      const newSessionButton = page.getByRole('button', { name: 'New session' });
      await expect(newSessionButton).toBeVisible({ timeout: 30_000 });

      // Create session
      const sessionName = `pig-files-${Date.now()}`;
      await newSessionButton.click();
      await page.getByPlaceholder('/root/projects/my-app').fill('/root/projects/PiG');
      await page.getByPlaceholder('New session').fill(sessionName);
      await page.getByRole('button', { name: 'Start session' }).click();

      // Ensure Transcript screen loaded
      await expect(page.getByPlaceholder('Message the agent…')).toBeVisible({ timeout: 20_000 });

      // Open File Explorer
      const openFolderButton = page.getByLabel('Open file explorer');
      await expect(openFolderButton).toBeVisible({ timeout: 10_000 });
      await openFolderButton.click();

      // --- 1. Markdown file inspection ---
      const mdFileRow = page.getByText('phase8-preview-fixture.md');
      await expect(mdFileRow).toBeVisible({ timeout: 15_000 });
      await mdFileRow.click();

      // Verify FileViewerSheet is visible
      const sheet = page.getByTestId('file-viewer-sheet');
      await expect(sheet).toBeVisible({ timeout: 10_000 });

      // Verify formatted markdown renders
      await expect(page.getByTestId('formatted-markdown-body')).toBeVisible();
      await expect(page.getByText('Phase 8 Markdown Header')).toBeVisible();

      // Switch to Raw mode
      const rawButton = page.getByRole('button', { name: 'Raw', exact: true });
      await expect(rawButton).toBeVisible();
      await rawButton.click();

      // Verify raw monospace view renders
      await expect(page.getByTestId('raw-markdown-source')).toBeVisible();

      // Switch back to Preview mode
      const previewButton = page.getByRole('button', { name: 'Preview', exact: true });
      await previewButton.click();
      await expect(page.getByTestId('formatted-markdown-body')).toBeVisible();

      // Fullscreen expansion
      const expandButton = page.getByLabel('Expand to fullscreen');
      await expect(expandButton).toBeVisible();
      await expandButton.click();

      // Verify collapse button is now visible
      const collapseButton = page.getByLabel('Collapse to sheet');
      await expect(collapseButton).toBeVisible();

      // Collapse back
      await collapseButton.click();
      await expect(page.getByLabel('Expand to fullscreen')).toBeVisible();

      // Close markdown viewer
      await sheet.getByLabel('Close').click();
      await expect(sheet).toHaveCount(0);

      // --- 2. HTML file & Open in Browser ---
      const htmlFileRow = page.getByText('phase8-preview-fixture.html');
      await expect(htmlFileRow).toBeVisible({ timeout: 15_000 });
      await htmlFileRow.click();

      await expect(sheet).toBeVisible({ timeout: 10_000 });

      // Verify "Open in browser" button is present
      const openInBrowserButton = page.getByLabel('Open in browser');
      await expect(openInBrowserButton).toBeVisible();
      await openInBrowserButton.click();

      // Verify sheet closed and Browser screen is displayed with the ticketed URL
      await expect(sheet).toHaveCount(0);
      const addressBar = page.getByPlaceholder('Enter an address');
      await expect(addressBar).toBeVisible({ timeout: 10_000 });
      await expect(addressBar).toHaveValue(/files\/raw\?path=.+&token=/);

      // --- Cleanup tmux session ---
      const sessionsTabButton = page.getByRole('tab', { name: 'Sessions' });
      await sessionsTabButton.click();
      const backButton = page.getByLabel('Back to sessions');
      if (await backButton.isVisible()) {
        await backButton.click();
      }
      const optionsButton = page.getByRole('button', { name: `Options for ${sessionName}`, exact: true });
      if (await optionsButton.isVisible()) {
        await optionsButton.click();
        await page.getByRole('button', { name: 'Kill session', exact: true }).click();
      }
    } finally {
      if (existsSync(fixtureHtml)) unlinkSync(fixtureHtml);
      if (existsSync(fixtureMd)) unlinkSync(fixtureMd);
    }
  });

  test('Agent output to .pig-output surfaces as clickable attachment chip in chat', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());

    const { host, token } = await mintRealPairingToken();
    await pairThroughUi(page, host, token);

    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 30_000 });

    const sessionName = `pig-attach-${Date.now()}`;
    await page.getByRole('button', { name: 'New session' }).click();
    await page.getByPlaceholder('/root/projects/my-app').fill('/root/projects/PiG');
    await page.getByPlaceholder('New session').fill(sessionName);
    await page.getByRole('button', { name: 'Start session' }).click();

    const composer = page.getByPlaceholder('Message the agent…');
    await expect(composer).toBeVisible({ timeout: 20_000 });

    // Ensure .pig-output directory exists in project and write a result file
    const outputDir1 = '/root/projects/PiG/.pig-output';
    const outputDir2 = '/root/projects/PiG/backend/.pig-output';
    if (!existsSync(outputDir1)) mkdirSync(outputDir1, { recursive: true });
    if (!existsSync(outputDir2)) mkdirSync(outputDir2, { recursive: true });
    const outputFile1 = path.join(outputDir1, 'summary.txt');
    const outputFile2 = path.join(outputDir2, 'summary.txt');
    writeFileSync(outputFile1, 'Phase 8 attachment output verified!');
    writeFileSync(outputFile2, 'Phase 8 attachment output verified!');

    try {
      // Send a prompt to complete a turn
      await composer.fill('reply with exactly PONG');
      await page.getByRole('button', { name: 'Send message' }).click();

      // Wait for agent reply
      await expect(page.getByText(/PONG/i)).toBeVisible({ timeout: 90_000 });

      // Verify attachment chip is rendered on the agent turn
      const chip = page.getByLabel('Open summary.txt').first();
      await expect(chip).toBeVisible({ timeout: 60_000 });

      // Click chip to open FileViewerSheet
      await chip.click();
      const sheet = page.getByTestId('file-viewer-sheet');
      await expect(sheet).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Phase 8 attachment output verified!')).toBeVisible();

      // Close sheet
      await sheet.getByLabel('Close').click();
      await expect(sheet).toHaveCount(0);
      await expect(page.getByLabel('Close file viewer')).toHaveCount(0, { timeout: 10_000 });
    } finally {
      if (existsSync(outputFile1)) unlinkSync(outputFile1);
      if (existsSync(outputFile2)) unlinkSync(outputFile2);

      // Teardown session
      try {
        const backBtn = page.getByLabel('Back to sessions');
        if (await backBtn.isVisible()) {
          await backBtn.click({ force: true });
          const optionsButton = page.getByRole('button', { name: `Options for ${sessionName}`, exact: true });
          if (await optionsButton.isVisible()) {
            await optionsButton.click();
            await page.getByRole('button', { name: 'Kill session', exact: true }).click();
          }
        }
      } catch {}
    }
  });
});
