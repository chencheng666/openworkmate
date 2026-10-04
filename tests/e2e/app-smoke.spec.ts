import { closeElectronApp, completeSetup, expect, test } from './fixtures/electron';

test.describe('ClawX Electron smoke flows', () => {
  test('shows the setup wizard on a fresh profile', async ({ page }) => {
    await expect(page.getByTestId('setup-page')).toBeVisible();
    await expect(page.getByTestId('setup-welcome-step')).toBeVisible();
    await expect(page.getByAltText('OpenWorkMate')).toBeVisible();
    await expect(page.getByTestId('setup-skip-button')).toBeVisible();
  });

  test('can skip setup and navigate to local settings', async ({ page }) => {
    await expect(page.getByTestId('setup-page')).toBeVisible();
    await page.getByTestId('setup-skip-button').click();

    await expect(page.getByTestId('main-layout')).toBeVisible();
    await page.getByTestId('sidebar-nav-settings').click();

    await expect(page.getByTestId('settings-page')).toBeVisible();
  });

  test('shows the WorkMate Agent Platform workbench after setup', async ({ page }) => {
    await completeSetup(page);

    await expect(page.getByTestId('workmate-welcome')).toBeVisible();
    await expect(page.getByTestId('workmate-hero-background')).toBeVisible();
    await expect(page.getByTestId('workmate-mascot')).toBeVisible();
    await expect(page.getByTestId('workmate-operation-demo')).toBeVisible();
    await expect(page.getByRole('button', { name: '运行演示' })).toBeVisible();
    await expect(page.getByRole('button', { name: '用模型提问' })).toBeVisible();
    await expect(page.getByTestId('workmate-action-workOrder')).toBeVisible();
    await expect(page.getByTestId('workmate-action-investment')).toBeVisible();
    await expect(page.getByTestId('workmate-action-enterpriseService')).toBeVisible();
    await expect(page.getByTestId('workmate-action-knowledge')).toBeVisible();
    await expect(page.getByTestId('workmate-action-operationInsight')).toBeVisible();
  });

  test('hides runtime agent labels from the employee chat surface', async ({ page }) => {
    await completeSetup(page);

    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByText('Main Agent', { exact: true })).toHaveCount(0);
  });

  test('keeps governance pages out of the desktop application', async ({ page }) => {
    await completeSetup(page);

    await expect(page.getByTestId('sidebar-open-admin-console')).toBeVisible();
    await expect(page.getByTestId('sidebar-nav-models')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-nav-knowledge')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-nav-skill-factory')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-nav-connectors')).toHaveCount(0);
  });

  test('persists skipped setup across relaunch for the same isolated profile', async ({ electronApp, launchElectronApp }) => {
    const firstWindow = await electronApp.firstWindow();
    await firstWindow.waitForLoadState('domcontentloaded');
    await firstWindow.getByTestId('setup-skip-button').click();
    await expect(firstWindow.getByTestId('main-layout')).toBeVisible();

    await closeElectronApp(electronApp);

    const relaunchedApp = await launchElectronApp();
    try {
      const relaunchedWindow = await relaunchedApp.firstWindow();
      await relaunchedWindow.waitForLoadState('domcontentloaded');

      await expect(relaunchedWindow.getByTestId('main-layout')).toBeVisible();
      await expect(relaunchedWindow.getByTestId('setup-page')).toHaveCount(0);
    } finally {
      await closeElectronApp(relaunchedApp);
    }
  });
});
