import { defineConfig, devices } from '@playwright/test';

// Pruebas en navegador sobre la versión compilada (`npm run build` antes).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    ...devices['iPhone 13'],
    // El iPhone 13 de Playwright usa WebKit: aquí se prueba con Chromium en tamaño de móvil.
    browserName: 'chromium',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
