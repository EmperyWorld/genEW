/**
 * Trust Hardening — security regression:
 * sensitive GET/POST without Bearer → 401 when auth_required.
 */
import { expect, test } from "@playwright/test";

const skipLive = process.env.ECC_E2E_SKIP_LIVE === "1";
const apiBase = process.env.VITE_ECC_API_BASE ?? "http://127.0.0.1:8006";

const SENSITIVE = [
  { method: "GET" as const, path: "/api/v1/jobs" },
  { method: "GET" as const, path: "/api/v1/audit" },
  { method: "GET" as const, path: "/api/v1/autonomous/jobs" },
  { method: "GET" as const, path: "/api/v1/autonomous/mode" },
  {
    method: "POST" as const,
    path: "/api/v1/jobs/00000000-0000-0000-0000-000000000000/claim",
  },
];

test.describe("Trust security regression", () => {
  test.skip(skipLive, "ECC_E2E_SKIP_LIVE=1");

  test("sensitive endpoints reject unauthenticated access", async ({
    request,
  }) => {
    const health = await request.get(`${apiBase}/api/v1/health`);
    expect(health.ok()).toBeTruthy();
    const body = (await health.json()) as { auth_required?: boolean };
    test.skip(!body.auth_required, "auth_required is false (lab profile)");

    // Public health remains open
    expect(health.status()).toBe(200);

    for (const ep of SENSITIVE) {
      const res =
        ep.method === "GET"
          ? await request.get(`${apiBase}${ep.path}`)
          : await request.post(`${apiBase}${ep.path}`, { data: {} });
      expect(res.status(), `${ep.method} ${ep.path}`).toBe(401);
    }
  });
});
