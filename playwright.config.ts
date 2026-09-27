import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.TEST_PORT) || 4178

export default defineConfig({
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}/`, trace: 'retain-on-failure' },
  projects: [
    { name: 'unit', testDir: 'test/unit' },
    {
      name: 'e2e',
      testDir: 'test/e2e',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.CI ? {} : { channel: 'chrome' }),
      },
    },
  ],
  webServer: {
    command: 'node build.mjs && node test/serve.mjs',
    url: `http://localhost:${PORT}/`,
    env: { TEST_PORT: String(PORT) },
    // a server another checkout left on the port fails the run instead of
    // being tested in this one's place
    reuseExistingServer: false,
  },
})
