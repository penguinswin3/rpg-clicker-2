import { defineConfig, devices } from '@playwright/test';

/**
 * E2E/smoke suite — see AGENTS.md's "Testing" section. These drive the real app in a
 * headless browser (dev-server + rendered Angular app), as opposed to the Karma/Jasmine
 * unit suite (`ng test`) which exercises services/components in isolation. Reserve this
 * layer for things only observable end-to-end: DOM state, CSS layout (button widths not
 * shifting), and full user flows across multiple components.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // all specs share one dev-server's in-memory... no, localStorage
  // per-context, but keeping this false avoids any accidental port/timing contention on a
  // dev machine running one Chromium instance.
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Reuses an already-running `ng serve` (this project's dev server is typically already
  // up on 4200 — see AGENTS.md's "Running the app") rather than starting a second one;
  // starts one itself otherwise so the suite still works from a cold checkout/CI.
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
