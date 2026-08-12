import { test, expect } from "@playwright/test";

/**
 * App shell on the web export with a pre-seeded session (no MyChart
 * account): chat echo round-trips through the mock AI backend, history
 * persists via the localStorage-backed sqlite shim, and settings render
 * the backend session + spend info.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Mirror what onboarding writes (secure-store.web prefixes with secure_).
    localStorage.setItem("secure_setup_complete", "true");
    localStorage.setItem("secure_backend_session_token", "e2e-test-token");
    localStorage.setItem(
      "secure_backend_user",
      JSON.stringify({ id: "e2e-user", email: "dev@openrecord.local", name: "E2E Tester" }),
    );
  });
  await page.goto("/");
});

test("chat round-trips through the mock AI backend", async ({ page }) => {
  await expect(page.getByText("Ask anything about your health data")).toBeVisible();

  await page.getByTestId("chat-input").fill("Hello from Playwright");
  await page.getByTestId("send-message").click();

  await expect(page.getByText("Hello from Playwright").first()).toBeVisible();
  await expect(page.getByText("E2E mock response: Hello from Playwright")).toBeVisible({
    timeout: 30_000,
  });
});

test("chat history persists and is searchable from the drawer", async ({ page }) => {
  // Create a chat.
  await page.getByTestId("chat-input").fill("Remember this conversation");
  await page.getByTestId("send-message").click();
  await expect(
    page.getByText("E2E mock response: Remember this conversation"),
  ).toBeVisible({ timeout: 30_000 });

  // It shows up in the drawer (titled by the scripted model).
  await page.getByTestId("open-drawer").click();
  await expect(page.getByTestId("drawer-new-chat")).toBeVisible();
  await expect(page.getByText("Medication Questions")).toBeVisible();

  // Search narrows and misses politely.
  await page.getByTestId("drawer-search").fill("zzz-nope");
  await expect(page.getByText("No matches")).toBeVisible();
  await page.getByTestId("drawer-search").fill("");

  // Reopen the chat from history; messages restore from storage.
  // (expo-router keeps the previous screen mounted but hidden on web, so
  // text can match a hidden copy — filter to the visible one.)
  await page.getByText("Medication Questions").click();
  await expect(
    page.getByText("Remember this conversation").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByText("E2E mock response: Remember this conversation")
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

test("skills sheet lists the curated playbooks", async ({ page }) => {
  await page.getByTestId("run-skill-button").click();
  await expect(page.getByText("Find bills to itemize")).toBeVisible();
  await expect(page.getByText("Analyze medical history")).toBeVisible();
  await expect(page.getByText("Recommend an insurance fit")).toBeVisible();
  await page.getByTestId("skills-sheet-cancel").click();
  await expect(page.getByText("Ask anything about your health data")).toBeVisible();
});

test("settings show the backend session and AI spend from the mock server", async ({ page }) => {
  await page.getByTestId("open-drawer").click();
  await page.getByTestId("drawer-settings").click();

  await expect(page.getByText("MyChart Accounts")).toBeVisible();
  await expect(page.getByText("No accounts added yet.")).toBeVisible();
  await expect(page.getByText("dev@openrecord.local")).toBeVisible();
  // GET /api/ai on the mock server reports $1.23 of $50.00.
  await expect(page.getByText(/\$1\.23 of \$50\.00/)).toBeVisible();
  await expect(page.getByText("Free tier")).toBeVisible();

  // AI provider sub-screen and back. (Stacked screens stay mounted but
  // hidden on web, so assert on content unique to the AI screen and use
  // visible filters when text exists on both screens.)
  await page.getByTestId("settings-ai-provider").click();
  await expect(page.getByText("Free tier (our server)")).toBeVisible();
  await page.getByTestId("ai-settings-back").click();
  await expect(
    page.getByText("MyChart Accounts").filter({ visible: true }).first(),
  ).toBeVisible();

  await page.getByTestId("settings-back").click();
  await expect(page.getByTestId("chat-input").filter({ visible: true }).first()).toBeVisible();
});
