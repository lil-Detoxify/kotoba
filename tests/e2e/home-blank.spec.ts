import { test, expect } from '@playwright/test';

test('diagnose home page with missing currentBookId or empty books', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', err => {
    console.error('PAGE_ERROR:', err.stack || err.message);
    pageErrors.push(err.stack || err.message);
  });

  await page.route('**/api/v1/auth/check-account', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ exists: true, hasPassword: true, flow: 'password' })
    });
  });

  await page.route('**/api/v1/auth/login-password', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        token: 'mock_jwt_token',
        refreshToken: 'mock_refresh_token',
        user: { id: 'kb_test_75481', email: '75481@qq.com', provider: 'cloudbase' }
      })
    });
  });

  await page.route('**/api/v1/sync/bootstrap', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'kb_test_75481',
        hasCloudData: true,
        progressCount: 0,
        eventCount: 0
      })
    });
  });

  // What if pull returns empty progress, empty events, and NO settings or custom book?
  await page.route('**/api/v1/sync/pull', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'kb_test_75481',
        progress: [],
        events: [],
        settings: null,
        serverTime: '2026-09-21T10:00:00.000Z'
      })
    });
  });

  await page.route('**/api/v1/sync/push', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天，也学一点吧。' })).toBeVisible();

  await page.click('.sync-btn-login');
  await expect(page.locator('.login-modal')).toBeVisible();

  await page.fill('input[type="email"]', '75481@qq.com');
  await page.click('button.submit-btn');

  await expect(page.locator('input[type="password"]')).toBeVisible();
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button.submit-btn');

  await expect(page.locator('.login-modal')).toHaveCount(0);
  await page.waitForTimeout(1000);

  const headingVisible = await page.getByRole('heading', { name: '今天，也学一点吧。' }).isVisible();
  console.log('Heading visible with null settings:', headingVisible);
  console.log('Page errors:', pageErrors);
});
