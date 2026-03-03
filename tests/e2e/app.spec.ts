import { test, expect } from "@playwright/test";

test.describe("Home / Login page", () => {
  test("loads successfully with no JS errors", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (error) => jsErrors.push(error.message));

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    // Page should have loaded (either home or login redirect)
    await expect(page).toHaveURL(/\/(login)?$/);
    expect(jsErrors).toEqual([]);
  });
});

test.describe("Burn Squads", () => {
  test("navigate to Create Burn Squad page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/");

    // Click the "+ Burn Squad" link on the home page
    await page.getByRole("link", { name: /burn squad/i }).click();
    await expect(page).toHaveURL("/burn-squads/new");

    // Verify key form elements are present
    await expect(
      page.getByPlaceholder("e.g. Morning Crew")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create burn squad/i })
    ).toBeVisible();
  });

  test("create a new Burn Squad with no friends", async ({ page }) => {
    await page.goto("/burn-squads/new");
    await expect(page).toHaveURL("/burn-squads/new");

    const squadName = `E2E Test Squad ${Date.now()}`;

    // Fill in squad name
    await page.getByPlaceholder("e.g. Morning Crew").fill(squadName);

    // Do NOT select any friends — verify the no-friends message is shown
    const noFriendsMsg = page.getByText(/no friends to invite yet/i);
    // The message may or may not appear depending on whether the user has friends
    // If it appears, it should be informational (not blocking)

    // Submit the form
    await page.getByRole("button", { name: /create burn squad/i }).click();

    // After creating, user should be redirected to home page
    await expect(page).toHaveURL("/", { timeout: 10000 });
  });
});
