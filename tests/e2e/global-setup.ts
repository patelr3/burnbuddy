import { test as setup, expect } from "@playwright/test";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";

const authFile = "./tests/e2e/.auth/user.json";
const emptyState = JSON.stringify({ cookies: [], origins: [] });

function getSecret(name: string): string {
  const vaultName = process.env.KEY_VAULT_NAME || "buddyburn-beta-kv";
  const result = execSync(
    `az keyvault secret show --vault-name "${vaultName}" --name "${name}" --query value -o tsv`,
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
  return result;
}

function getCredentials(): { email: string; password: string } | null {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (email && password) return { email, password };

  try {
    return {
      email: getSecret("test-user-email"),
      password: getSecret("test-user-password"),
    };
  } catch {
    return null;
  }
}

setup("authenticate", async ({ page }) => {
  mkdirSync("./tests/e2e/.auth", { recursive: true });

  const creds = getCredentials();
  if (!creds) {
    // Write empty storage state so dependent projects can still start
    writeFileSync(authFile, emptyState);
    return;
  }

  await page.goto("/login");
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /sign in/i }).first().click();

  // Wait for redirect to home page after login
  await expect(page).toHaveURL("/", { timeout: 15000 });

  await page.context().storageState({ path: authFile });
});
