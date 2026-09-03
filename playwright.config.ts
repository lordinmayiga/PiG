import { defineConfig, devices } from '@playwright/test';

// Harness only — the actual pairing/sessions/transcript e2e test is written
// separately on top of this. See AGENTS.md: Expo v57, docs at
// https://docs.expo.dev/versions/v57.0.0/.
//
// `expo start --web` serves on http://localhost:8081 by default (confirmed
// empirically: `npx expo start --web` prints "Waiting on http://localhost:8081"
// and Metro serves the app's HTML shell there). The app is a client-rendered
// SPA (an empty <div id="root"> plus a bundle <script>), so tests must wait
// for the JS bundle to mount rather than trusting a 200 on the initial HTML.
const PORT = 8081;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Expo web's cold start (Metro bundling the whole app for the first
  // request) can be slow, so give it a generous startup budget.
  webServer: {
    command: 'npx expo start --web',
    url: BASE_URL,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
});
