import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: './results',
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  fullyParallel: true,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    // Connexion locale de test (E2E_LOCAL_AUTH = LOCAL_AUTH_TOKEN du serveur), session réutilisée ensuite.
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testIgnore: /parcours/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, dependencies: ['setup'], testIgnore: /parcours/ },
    // Modifie les données : seulement après les tests de rendu, qui supposent le jeu de démonstration intact.
    { name: 'parcours', use: { ...devices['Desktop Chrome'] }, dependencies: ['desktop', 'mobile'], testMatch: /parcours\.spec\.js/ },
  ],
});
