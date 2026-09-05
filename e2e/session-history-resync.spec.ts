import { test, expect, type Page } from '@playwright/test';
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const BACKEND_DIR = path.join(__dirname, '..', 'backend');

// A dedicated port, separate from the shared dev backend on 8787 (which
// other e2e specs, and the developer's own manual testing, depend on
// staying up). This test needs to kill and relaunch its backend mid-run, so
// it runs its own disposable instance instead of touching the shared one.
const TEST_PORT = 8791;

function startBackend(port: number): Promise<ChildProcessWithoutNullStreams> {
  return new Promise((resolvePromise, reject) => {
    // `detached: true` puts the child (and whatever `npx` forks underneath
    // it) in its own process group, so stopBackend can reliably kill the
    // whole tree via `-pid` — a plain `child.kill()` only ever signals the
    // immediate `npx` process, which can leave an orphaned `tsx`/`node`
    // still bound to `port` if this test's own outer timeout fires mid-kill
    // (observed: a stale process outliving a timed-out run, colliding with
    // the next run's `startBackend` via EADDRINUSE).
    const child = spawn('npx', ['tsx', 'src/server.ts'], {
      cwd: BACKEND_DIR,
      env: { ...process.env, PIG_BRIDGE_PORT: String(port) },
      detached: true,
    });
    const timeout = setTimeout(() => reject(new Error('Backend did not start in time')), 20_000);
    const onData = (chunk: Buffer) => {
      if (chunk.toString().includes('listening on')) {
        clearTimeout(timeout);
        child.stdout.off('data', onData);
        resolvePromise(child);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => process.stderr.write(`[test-backend] ${chunk}`));
    child.on('error', reject);
  });
}

function stopBackend(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolvePromise) => {
    child.once('exit', () => resolvePromise());
    try {
      // Negative pid == kill the whole process group (see the `detached`
      // comment in startBackend above).
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  });
}

async function mintRealPairingToken(port: number): Promise<{ host: string; token: string }> {
  const { stdout } = await execFileAsync('npx', ['tsx', 'bin/pig-bridge.ts', 'pair'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PIG_BRIDGE_HOST: 'localhost', PIG_BRIDGE_PORT: String(port) },
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
 * Journey: pair -> create a session -> send a real message and get a real
 *          reply -> the backend process crashes/restarts (simulated) ->
 *          the app is kicked back to Setup (bridge tokens are in-memory
 *          only, per `backend/src/auth.ts`'s documented scope cut — a
 *          restart invalidates every paired device) -> the user re-pairs,
 *          exactly as a real user must -> reopening the same session shows
 *          the pre-restart conversation is still there.
 * States covered: pre-restart transcript longer than the empty post-restart
 *          in-memory registry (the exact shape of UI_FIXES_PLAN.md item 4's
 *          bug 2 — a shorter post-restart snapshot silently overwriting a
 *          longer local one).
 * Starting conditions: fresh pairing token, brand-new session, against a
 *          disposable backend instance on its own port (TEST_PORT) rather
 *          than the shared dev backend on 8787 — deliberate deviation, see
 *          UI_FIXES_PLAN.md's e2e pre-flight notes: this test needs to kill
 *          the backend process, and doing that to the shared dev instance
 *          would disrupt other work/tests. Using a disposable instance on a
 *          different port changes nothing about the resync logic under
 *          test (both are the same backend code, `sessionRegistry.ts`'s
 *          persistence and merge behavior don't depend on which port they
 *          bind to) — risk: none identified.
 *
 * Note: an earlier version of this test assumed the client's own
 * reconnect backoff would silently resync across a real process restart,
 * the way it does across a brief network blip. That's wrong: a backend
 * *process* restart clears `validBridgeTokens` (in-memory, by design —
 * see auth.ts), so the app is actually kicked back to the Setup screen and
 * a real user has to re-pair. Re-pairing (not a silent reconnect) is the
 * real path to reopening a session after a genuine restart, so that's what
 * this test now does — this is what e2e-test-methodology's Rule 1 means by
 * "no shortcuts": the original version's assertion of "pre-restart text is
 * still visible" right after the fake reconnect was reading stale local
 * cache content, not proving a real post-restart resync had occurred.
 */
test.describe('Session history survives a backend restart E2E', () => {
  let backend: ChildProcessWithoutNullStreams;

  test.afterEach(async () => {
    if (backend) await stopBackend(backend);
  });

  test('reopening a session after re-pairing post-restart still shows the pre-restart conversation', async ({ page }) => {
    test.setTimeout(180_000);
    page.on('dialog', (dialog) => dialog.accept());

    backend = await startBackend(TEST_PORT);

    const { host, token } = await mintRealPairingToken(TEST_PORT);
    await pairThroughUi(page, host, token);

    const newSessionButton = page.getByRole('button', { name: 'New session' });
    await expect(newSessionButton).toBeVisible({ timeout: 30_000 });
    await newSessionButton.click();
    await page.getByPlaceholder('/root/projects/my-app').fill('/root/projects/PiG');
    const sessionName = `pig-resync-${Date.now()}`;
    await page.getByPlaceholder('New session').fill(sessionName);
    await page.getByRole('button', { name: 'Start session' }).click();

    const composer = page.getByPlaceholder('Message the agent…');
    await expect(composer).toBeVisible({ timeout: 20_000 });

    // Real pre-restart exchange — the history the fix must not lose.
    const preRestartQuestion = 'What is 3 plus 4? Answer with just the number.';
    await composer.fill(preRestartQuestion);
    await page.getByTestId('composer-send-btn').click();
    const agentBubble = page.getByTestId('agent-turn-bubble');
    await expect(agentBubble).toBeVisible({ timeout: 60_000 });
    await expect(agentBubble).toContainText('7', { timeout: 60_000 });
    await expect(page.getByText(preRestartQuestion)).toBeVisible();

    // Simulate the real backend process crashing and being restarted (e.g.
    // a VPS reboot) — the underlying tmux session itself survives (tmux is
    // a separate, independent process the backend doesn't own), but the
    // backend's in-memory bridge tokens and session registry are wiped.
    await stopBackend(backend);
    backend = await startBackend(TEST_PORT);

    // Real path: the app gets kicked back to Setup once its stale bridge
    // token is rejected, and a real user has to re-pair — there is no
    // silent reconnect across a real process restart (see the doc comment
    // above). This exercises the actual disconnect+re-pair UI, not a
    // shortcut around it.
    await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 30_000 });
    const { host: host2, token: token2 } = await mintRealPairingToken(TEST_PORT);
    await pairThroughUi(page, host2, token2);

    // Reopen the same session by name from the list — the real tmux session
    // survived the backend restart, so it's still there to reopen.
    await expect(page.getByText(sessionName)).toBeVisible({ timeout: 30_000 });
    await page.getByText(sessionName).click();
    await expect(composer).toBeVisible({ timeout: 20_000 });

    // The pre-restart question and answer must still be visible — this is
    // the exact bug: the backend's fresh, empty post-restart registry used
    // to silently overwrite the client's longer local cache on resync.
    await expect(page.getByText(preRestartQuestion)).toBeVisible({ timeout: 20_000 });
    await expect(agentBubble).toContainText('7', { timeout: 20_000 });

    // And the session must still be usable after re-pairing — a real
    // follow-up message gets a real reply appended alongside the preserved
    // history, not a fresh/empty transcript.
    const followUpQuestion = 'What is 10 plus 11? Answer with just the number.';
    await composer.fill(followUpQuestion);
    await page.getByTestId('composer-send-btn').click();
    await expect(page.getByText(followUpQuestion)).toBeVisible();
    const latestAgentBubble = page.getByTestId('agent-turn-bubble').last();
    await expect(latestAgentBubble).toContainText('21', { timeout: 60_000 });
    // Original exchange is still there alongside the new one.
    await expect(page.getByText(preRestartQuestion)).toBeVisible();
  });
});
