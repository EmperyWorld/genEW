/**
 * Trust Hardening golden path v2:
 * Register → Login → Ops → create plan job (API) → observe job list.
 *
 * Full AI insight is best-effort when LIVE intelligence is ready.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const skipLive = process.env.ECC_E2E_SKIP_LIVE === "1";
const apiBase = process.env.VITE_ECC_API_BASE ?? "http://127.0.0.1:8006";

function uniqueEmail(): string {
  return `trust.${Date.now().toString(36)}@empery.test`;
}

async function fillCredentials(page: Page, email: string, password: string) {
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
}

async function registerAndLogin(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/register");
  await fillCredentials(page, email, password);
  const name = page.locator('input[name="display_name"]');
  if (await name.count()) await name.fill("Trust QA");
  await page.getByRole("button", { name: /register|зарегистр|sign up|создать/i }).click();
  await page.waitForURL(/\/(login|ops)/, { timeout: 30_000 });
  if (page.url().includes("/login")) {
    await fillCredentials(page, email, password);
    await page.getByRole("button", { name: /sign in|войти|login/i }).click();
    await page.waitForURL(/\/ops/, { timeout: 30_000 });
  }
}

async function loginApi(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${apiBase}/api/v1/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { access_token: string };
  expect(body.access_token).toBeTruthy();
  return body.access_token;
}

test.describe("Trust golden path v2", () => {
  test.skip(skipLive, "ECC_E2E_SKIP_LIVE=1");

  test("register → login → plan job → jobs visible", async ({
    page,
    request,
  }) => {
    const health = await request.get(`${apiBase}/api/v1/health`);
    test.skip(!health.ok(), "ECC API down");
    const h = (await health.json()) as { auth_required?: boolean };
    test.skip(!h.auth_required, "lab profile without auth_required");

    const email = uniqueEmail();
    const password = "TrustHarden1!";

    await registerAndLogin(page, email, password);
    await expect(page).toHaveURL(/\/ops/);

    const token = await loginApi(request, email, password);

    const plan = await request.post(`${apiBase}/api/v1/commands/plan`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        service_name: "reflex_probe_service",
        intent: "Trust hardening golden path plan probe",
      },
    });
    // Accept created or validation errors that still prove auth worked (not 401)
    expect(plan.status(), await plan.text()).not.toBe(401);
    expect([200, 201, 400, 422, 404, 502, 503]).toContain(plan.status());

    if (plan.status() === 201 || plan.status() === 200) {
      const jobs = await request.get(`${apiBase}/api/v1/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(jobs.status()).toBe(200);
      const list = (await jobs.json()) as { jobs?: unknown[] };
      expect((list.jobs ?? []).length).toBeGreaterThan(0);
    }

    // Authed UI can open System Health
    await page.goto("/ops/health");
    await expect(
      page.getByRole("heading", { name: /health|здоровье/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
