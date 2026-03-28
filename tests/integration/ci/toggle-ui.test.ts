/**
 * UI Integration Test: Instance Enable/Disable Toggle
 *
 * Uses Playwright to verify the toggle switch works in a real browser.
 * Runs against Docker Compose services (same as integration.test.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { chromium, type Browser, type Page } from 'playwright';

const BASE_URL = process.env.CI_WEB_URL || 'http://localhost:8080';
const FAKE_MYCHART_HOSTNAME = process.env.CI_FAKE_MYCHART_HOSTNAME || 'fake-mychart:3000';

const TEST_EMAIL = `ci-toggle-ui-${Date.now()}@example.com`;
const TEST_PASSWORD = 'ToggleTest123!';
const TEST_NAME = 'Toggle UI Test';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

describe('Toggle UI', () => {
  it('signs up via the UI', async () => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Click "Create account" or "Sign up" link
    const signUpLink = page.getByText(/create.*account|sign.*up/i);
    if (await signUpLink.isVisible()) {
      await signUpLink.click();
      await page.waitForLoadState('networkidle');
    }

    // Fill in sign-up form
    await page.getByLabel(/name/i).fill(TEST_NAME);
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);

    // Submit
    await page.getByRole('button', { name: /sign.*up|create.*account|register/i }).click();
    await page.waitForURL('**/home**', { timeout: 15_000 });
  }, 30_000);

  it('adds a MyChart instance', async () => {
    // Fill in the add-instance form
    await page.getByPlaceholder(/hostname/i).fill(FAKE_MYCHART_HOSTNAME);
    await page.getByPlaceholder(/username/i).fill('homer');
    await page.getByPlaceholder(/password/i).fill('donuts123');

    // Submit add form
    await page.getByRole('button', { name: /add|connect|save/i }).first().click();

    // Wait for the instance to appear in the list
    await page.waitForSelector(`text=${FAKE_MYCHART_HOSTNAME}`, { timeout: 10_000 });
  }, 30_000);

  it('toggle switch is visible and enabled by default', async () => {
    // Find the toggle switch (role="switch")
    const toggle = page.locator('button[role="switch"]').first();
    await expect(toggle).toBeVisible();

    // Should be checked (enabled) by default
    const checked = await toggle.getAttribute('aria-checked');
    expect(checked).toBe('true');
  });

  it('can disable an instance via toggle click', async () => {
    const toggle = page.locator('button[role="switch"]').first();

    // Click to disable
    await toggle.click();

    // Wait for the API call to complete and UI to update
    await page.waitForTimeout(1000);

    // Verify toggle is now unchecked
    const checked = await toggle.getAttribute('aria-checked');
    expect(checked).toBe('false');

    // Verify the "Disabled" label appears
    await expect(page.getByText('Disabled')).toBeVisible();
  });

  it('disabled instance shows dimmed styling', async () => {
    // The instance card should have opacity-60 class when disabled
    const instanceCard = page.locator(`text=${FAKE_MYCHART_HOSTNAME}`).locator('..');
    const cardParent = instanceCard.locator('..');
    const classes = await cardParent.getAttribute('class');
    expect(classes).toContain('opacity-60');
  });

  it('connect button is hidden when disabled', async () => {
    // When disabled, the Connect button should not be visible
    const connectButton = page.getByRole('button', { name: /^connect$/i });
    await expect(connectButton).not.toBeVisible();
  });

  it('can re-enable via toggle click', async () => {
    const toggle = page.locator('button[role="switch"]').first();

    // Click to re-enable
    await toggle.click();

    // Wait for update
    await page.waitForTimeout(1000);

    // Verify toggle is checked again
    const checked = await toggle.getAttribute('aria-checked');
    expect(checked).toBe('true');

    // Verify "Disabled" label is gone
    await expect(page.getByText('Disabled')).not.toBeVisible();
  });
});
