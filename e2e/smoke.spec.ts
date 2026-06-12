import { faker } from "@faker-js/faker";
import { expect, type Page, test } from "@playwright/test";

import { deleteTestUser } from "./helpers/test-user";

function generateTestEmail() {
  return `${faker.internet.username().toLowerCase()}+${Date.now()}@example.com`;
}

const TEST_PASSWORD = "myreallystrongpassword";
// Error banners are <p> with a bg-danger token (or legacy red on auth pages).
const ERROR_SELECTOR = 'p[class*="bg-danger"], [class*="bg-red"]';

async function expectNoErrors(page: Page) {
  await expect(page.locator(ERROR_SELECTOR)).not.toBeVisible();
}

/**
 * Auth forms submit via JS (createServerFn), so a click before hydration
 * falls back to a native GET submit and loses the input. Wait for the
 * network to go idle (dev-server bundles included) before interacting.
 */
async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle");
}

test.describe("smoke tests", () => {
  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await deleteTestUser(testEmail).catch(() => {});
    }
  });

  test("should allow you to register and login", async ({ page }) => {
    testEmail = generateTestEmail();

    await page.goto("/");
    await page.getByRole("link", { name: /sign up/i }).click();

    await waitForHydration(page);
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();

    await page.waitForURL("**/vehicles**");
    await expect(
      page.getByRole("heading", { name: /the garage/i }),
    ).toBeVisible();
    await expectNoErrors(page);

    await waitForHydration(page);
    await page.getByRole("button", { name: /^[A-Z]$/ }).click();
    await page.getByRole("link", { name: /log out/i }).click();
    await page.waitForURL("**/");
    await expect(
      page.getByRole("link", { name: /sign in|log in/i }),
    ).toBeVisible();
  });

  test("should allow you to log in with existing credentials", async ({
    page,
  }) => {
    testEmail = generateTestEmail();

    // Register a new account
    await page.goto("/join");
    await waitForHydration(page);
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL("**/vehicles**");

    // Log out (via the avatar menu)
    await waitForHydration(page);
    await page.getByRole("button", { name: /^[A-Z]$/ }).click();
    await page.getByRole("link", { name: /log out/i }).click();
    await page.waitForURL("**/");

    // Log back in with the same credentials
    await page.getByRole("link", { name: /sign in|log in/i }).click();
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL("**/vehicles**");
    await expect(
      page.getByRole("heading", { name: /the garage/i }),
    ).toBeVisible();
    await expectNoErrors(page);
  });

  test("should allow you to create and delete a service log", async ({
    page,
  }) => {
    testEmail = generateTestEmail();
    const vehicleMake = faker.vehicle.manufacturer();
    const vehicleModel = faker.vehicle.model();
    const vehicleYear = String(faker.number.int({ min: 2000, max: 2026 }));
    const logTitle = faker.lorem.words(3);
    const logNotes = faker.lorem.sentence();

    // Register via UI
    await page.goto("/join");
    await waitForHydration(page);
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL("**/vehicles**");
    await expectNoErrors(page);

    // Empty state
    await expect(page.getByText(/the garage is empty/i)).toBeVisible();

    // Create vehicle
    await page.getByRole("link", { name: /add vehicle/i }).click();
    await page.getByLabel(/make/i).fill(vehicleMake);
    await page.getByLabel(/model/i).fill(vehicleModel);
    await page.getByLabel(/year/i).fill(vehicleYear);
    await page.getByRole("button", { name: /save/i }).click();

    // Verify redirect to the vehicle dashboard (no error flash)
    await page.waitForURL("**/vehicles/**");
    await expectNoErrors(page);
    await page.getByRole("link", { name: /^logs$/i }).click();

    // Logs empty state
    await expect(page.getByText(/nothing logged yet/i)).toBeVisible();

    // Create log via quick capture
    await page.getByRole("link", { name: /log work/i }).click();
    await page.getByLabel(/title/i).fill(logTitle);
    await page.getByLabel(/notes/i).fill(logNotes);
    await page.getByRole("button", { name: /save it/i }).click();

    // Saving lands on the dashboard with the log in "Recent work"
    await expect(page.getByText(logTitle)).toBeVisible();
    await expectNoErrors(page);

    // Open the log detail and verify notes
    await page.getByRole("link", { name: logTitle }).click();
    await expect(page.getByText(logNotes)).toBeVisible();

    // Delete log (confirm dialog fires on click)
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /delete/i }).click();

    // Verify empty state again
    await expect(page.getByText(/nothing logged yet/i)).toBeVisible();
  });

  test("should allow editing a vehicle and adding an odometer reading", async ({
    page,
  }) => {
    testEmail = generateTestEmail();

    // Register + create a vehicle (same flow as the CRUD test).
    await page.goto("/join");
    await waitForHydration(page);
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL("**/vehicles**");

    await page.getByRole("link", { name: /add vehicle/i }).click();
    await waitForHydration(page);
    await page.getByLabel(/^year/i).fill("2024");
    await page.getByLabel(/^make/i).fill("Jeep");
    await page.getByLabel(/^model/i).fill("Wrangler");
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.waitForURL("**/vehicles/**");
    await expectNoErrors(page);

    // Edit: rename + add an engine. Works offline from vPIC (free text).
    await page.getByRole("link", { name: /edit vehicle/i }).click();
    await waitForHydration(page);
    await page.getByLabel(/name \(optional\)/i).fill("Rally Rig");
    await page.getByLabel(/engine \(optional\)/i).fill("3.6L V6");
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(
      page.getByRole("heading", { name: "Rally Rig" }),
    ).toBeVisible();
    await expect(page.getByText("3.6L V6")).toBeVisible();
    await expectNoErrors(page);

    // Odometer: chip → page → add a reading → both update.
    await page.getByRole("link", { name: /last odometer/i }).click();
    await waitForHydration(page);
    await page.getByLabel(/miles/i).fill("42000");
    await page.getByRole("button", { name: /add reading/i }).click();
    await expect(page.getByText("42,000 mi").first()).toBeVisible();
    await expectNoErrors(page);
  });
});
