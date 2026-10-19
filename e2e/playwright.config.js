import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: './results',
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  fullyParallel: true,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    // Site en trois langues : un navigateur en français reste sur les pages françaises (sinon redirigé vers /en/).
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  projects: [
    // Connexion locale de test (E2E_LOCAL_AUTH = LOCAL_AUTH_TOKEN du serveur), session réutilisée ensuite.
    { name: 'setup', testMatch: /auth(-v2)?\.setup\.js/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testIgnore: /parcours|captures|audit|iphone|admin-v2-de/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, dependencies: ['setup'], testIgnore: /parcours|captures|audit|iphone|admin-v2-de/ },
    // Admin au toucher dans WebKit (moteur de Safari), écran d'iPhone.
    { name: 'iphone', use: { ...devices['iPhone 15'] }, dependencies: ['setup'], testMatch: /iphone(-v2)?\.spec\.js/ },
    // Audit ergonomique (E2E_AUDIT=1) : parcours mesurés et captures.
    { name: 'audit', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testMatch: /audit\.spec\.js/ },
    // Captures pour la documentation (E2E_CAPTURES=1), bureau et mobile.
    { name: 'captures-bureau', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, dependencies: ['setup'], testMatch: /captures\.spec\.js/ },
    { name: 'captures-mobile', use: { ...devices['Pixel 7'] }, dependencies: ['setup'], testMatch: /captures\.spec\.js/ },
    // Admin v2 en allemand (largeurs, débordements) : la langue est celle du compte de test de la v2 ; après les autres
    // tests de la v2, qui la supposent en français, et remise en français à la fin.
    { name: 'admin-v2-de', use: { ...devices['Desktop Chrome'] }, dependencies: ['desktop', 'mobile', 'iphone'], testMatch: /admin-v2-de\.spec\.js/ },
    // Modifie les données : seulement après les tests de rendu, qui supposent le jeu de démonstration intact.
    { name: 'parcours', use: { ...devices['Desktop Chrome'] }, dependencies: ['desktop', 'mobile'], testMatch: /parcours\.spec\.js/ },
  ],
});
