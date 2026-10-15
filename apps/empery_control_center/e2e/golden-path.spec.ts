/**
 * Market Ascension golden path:
 * Landing → Register → Login → Ops (fabric visible).
 *
 * Requires a live stack (ECC UI :5173, API :8006, Identity).
 * Skip with ECC_E2E_SKIP_LIVE=1 when stack is down.
 */
import { expect, test, type Page } from "@playwright/test";

const skipLive = process.env.ECC_E2E_SKIP_LIVE === "1";
const apiBase = process.env.VITE_ECC_API_BASE ?? "http://127.0.0.1:8006";

function uniqueEmail(): string {
  const stamp = Date.now().toString(36);
  return `market.${stamp}@empery.test`;
}

async function apiHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase}/api/v1/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fillCredentials(
  page: Page,
  email: string,
  password: string,
  displayName?: string,
) {
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  if (displayName !== undefined) {
    const nameInput = page.locator('input[name="display_name"]');
    if (await nameInput.count()) {
      await nameInput.fill(displayName);
    }
  }
}

test.describe("Market Ascension golden path", () => {
  test.skip(skipLive, "ECC_E2E_SKIP_LIVE=1");

  test.beforeAll(async () => {
    if (!(await apiHealthy())) {
      test.skip(true, `ECC API not reachable at ${apiBase}`);
    }
  });

  test("register → login → ops fabric", async ({ page }) => {
    const email = uniqueEmail();
    const password = "MarketAscend1!";

    await page.goto("/");
    await expect(page.getByRole("heading").first()).toBeVisible();

    // Prefer register CTA; fall back to /register
    const registerLink = page.getByRole("link", {
      name: /register|регистрац|создать аккаунт|sign up/i,
    });
    if (await registerLink.count()) {
      await registerLink.first().click();
    } else {
      await page.goto("/register");
    }

    await expect(page).toHaveURL(/register/);
    await fillCredentials(page, email, password, "Market QA");
    await page.getByRole("button", { name: /register|создать|sign up|зарегистр/i }).click();

    // Either auto-session → ops, or redirect to login
    await page.waitForURL(/\/(login|ops)/, { timeout: 30_000 });

    if (page.url().includes("/login")) {
      await fillCredentials(page, email, password);
      await page.getByRole("button", { name: /sign in|войти|login|вход/i }).click();
      await page.waitForURL(/\/ops/, { timeout: 30_000 });
    }

    await expect(page).toHaveURL(/\/ops/);
    // Fabric / status chrome should be present after auth
    await expect(
      page.getByText(/fabric|redis|health|статус|ткан/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("unauthenticated mutating job rejected when auth_required", async ({
    request,
  }) => {
    const health = await request.get(`${apiBase}/api/v1/health`);
    expect(health.ok()).toBeTruthy();
    const body = (await health.json()) as { auth_required?: boolean };
    test.skip(!body.auth_required, "auth_required is false (lab profile)");

    // Any mutating ECC route is gated; claim is a real POST handler.
    const res = await request.post(
      `${apiBase}/api/v1/jobs/00000000-0000-0000-0000-000000000000/claim`,
      { data: {} },
    );
    expect(res.status()).toBe(401);
  });
});
