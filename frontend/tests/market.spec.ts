import { test, expect } from '@playwright/test';

test('market flow: open -> request AI settlement', async ({ page }) => {
  const marketId = process.env.TEST_MARKET_ID || '27';

  // Open home and navigate to market page
  await page.goto('/');
  await page.goto(`/market/${marketId}`);
  await page.waitForURL(`**/market/${marketId}`);
  // Ensure test mode on the client if needed
  await page.addInitScript(() => {
    // noop placeholder in case we later need to enforce flags
  });

  // Expect action button visible (stable selector)
  const aiButton = page.locator('[data-testid="ai-settlement-button"]');
  await expect(aiButton).toBeVisible({ timeout: 30000 });

  // Trigger AI settlement
  await aiButton.click();
  // Wait for and validate the TX hash block
  const txLabel = page.getByText(/TX Hash/i);
  await expect(txLabel).toBeVisible({ timeout: 30_000 });
  const txContainer = txLabel.locator('xpath=..');
  const inner = await txContainer.innerText();
  const match = inner.match(/0x[0-9a-fA-F]{64}/);
  expect(match).toBeTruthy();
});
