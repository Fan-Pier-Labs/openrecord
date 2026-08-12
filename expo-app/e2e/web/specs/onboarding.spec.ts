import { test, expect } from "@playwright/test";

/**
 * Onboarding on the web export, including a real MyChart connect: the
 * browser scrapes fake-mychart directly (CORS enabled on the fake) with
 * Homer's credentials, exactly like the native app does on-device.
 */

test.beforeEach(async ({ page, request }) => {
  await request.post("http://localhost:4000/reset");
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("welcome → skip Google → provider picker search", async ({ page }) => {
  await expect(page.getByText("Your health records, in your pocket")).toBeVisible();
  await page.getByTestId("welcome-get-started").click();

  await expect(page.getByText("Sign in with Google")).toBeVisible();
  await page.getByTestId("google-dev-skip").click();

  await expect(page.getByText("Find your provider")).toBeVisible();
  // The bundled list ships ~1800 sites; the demo entry is pinned first.
  await expect(page.getByText("Springfield Medical Center (Demo)")).toBeVisible();

  // Search filters the list down.
  await page.getByTestId("picker-search").fill("zzz no such hospital");
  await expect(page.getByText(/No MyChart sites match/)).toBeVisible();

  await page.getByTestId("picker-search").fill("Springfield");
  await expect(page.getByTestId(/picker-item-Springfield.*/).first()).toBeVisible();
});

test("full onboarding: connect homer to fake-mychart in the browser", async ({ page }) => {
  await page.getByTestId("welcome-get-started").click();
  await page.getByTestId("google-dev-skip").click();

  await page.getByTestId("picker-manual").click();
  await page.getByTestId("mychart-hostname").fill("localhost:4000");
  await page.getByTestId("mychart-username").fill("homer");
  await page.getByTestId("mychart-password").fill("donuts123");
  await page.getByTestId("mychart-signin").click();

  // Login + path discovery against fake-mychart, then the passkey step.
  await expect(page.getByText("Skip the password forever")).toBeVisible({
    timeout: 60_000,
  });
  // Passkeys need native crypto — web always skips.
  await page.getByTestId("passkey-skip").click();

  await expect(page.getByText("Ask anything about your health data")).toBeVisible();
});

test("chat answers a medications question end-to-end in the browser", async ({ page }) => {
  // Connect first (same path as above).
  await page.getByTestId("welcome-get-started").click();
  await page.getByTestId("google-dev-skip").click();
  await page.getByTestId("picker-manual").click();
  await page.getByTestId("mychart-hostname").fill("localhost:4000");
  await page.getByTestId("mychart-username").fill("homer");
  await page.getByTestId("mychart-password").fill("donuts123");
  await page.getByTestId("mychart-signin").click();
  await expect(page.getByText("Skip the password forever")).toBeVisible({
    timeout: 60_000,
  });
  await page.getByTestId("passkey-skip").click();

  // Scripted model → on-page get_medications scrape → summarized reply.
  await page.getByTestId("chat-input").fill("What medications am I on?");
  await page.getByTestId("send-message").click();

  await expect(page.getByText("What medications am I on?")).toBeVisible();
  await expect(page.getByText(/Lisinopril/).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Your current medications are/)).toBeVisible();
});
