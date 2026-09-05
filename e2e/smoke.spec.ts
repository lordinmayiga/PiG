import { test, expect } from '@playwright/test';

// Harness smoke test only: proves Playwright can boot `expo start --web`
// and the real app mounts in the browser. Nothing here asserts anything
// about pairing/sessions/transcript flows — that's a separate test built
// on top of this scaffolding.
//
// With no stored bridge credentials (fresh browser context / no
// SecureStore data), RootNavigator resolves `isPaired` to false and renders
// SetupScreen, whose ConnectStep shows a stable "Connect to your VPS"
// heading (see src/screens/setup/ConnectStep.tsx) — that's what we assert.
test('app boots and renders the Setup screen', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Connect to your VPS')).toBeVisible({ timeout: 30_000 });
});
