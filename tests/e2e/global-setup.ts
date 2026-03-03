import { test as setup, expect } from "@playwright/test";
import { execSync } from "child_process";

const authFile = "./tests/e2e/.auth/user.json";

function getSecret(name: string): string {
  const vaultName = process.env.KEY_VAULT_NAME || "buddyburn-beta-kv";
  const result = execSync(
    `az keyvault secret show --vault-name "${vaultName}" --name "${name}" --query value -o tsv`,
    { encoding: "utf-8" }
  ).trim();
  return result;
}

setup("authenticate", async ({ page }) => {
  const email =
    process.env.TEST_USER_EMAIL || getSecret("test-user-email");
  const password =
    process.env.TEST_USER_PASSWORD || getSecret("test-user-password");

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).first().click();

  // Wait for redirect to home page after login
  await expect(page).toHaveURL("/", { timeout: 15000 });

  await page.context().storageState({ path: authFile });
});
