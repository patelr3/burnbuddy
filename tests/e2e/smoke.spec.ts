import { test, expect } from "@playwright/test";

test.describe("Smoke Tests", () => {
  test("app loads successfully with no JS errors", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (error) => jsErrors.push(error.message));

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    // Page should have loaded (either home or login redirect)
    await expect(page).toHaveURL(/\/(login)?$/);
    expect(jsErrors).toEqual([]);
  });
});
