/**
 * Configuration-Driven Assembly smoke — Manifest card titles + metrics network.
 *
 * Env:
 *   ECC_UI_BASE_URL (default http://127.0.0.1:5173)
 *   ASSEMBLY_SMOKE_ROUTE — ECC route e.g. /ops/sales-dash
 *   ASSEMBLY_SMOKE_TITLES — comma-separated expected data-assembly-title values
 *   ASSEMBLY_SMOKE_METRICS_PATH — path fragment to assert in network (default /api/v1/metrics)
 *   ASSEMBLY_SMOKE_REQUIRE=1 — fail-closed when route unset (never skip-as-green)
 *
 * Without ASSEMBLY_SMOKE_REQUIRE, skips when route unset (local/CI without live stack).
 * Prefer scripts/assembly_ops_dashboard_smoke.py --mode live for Hands/DoD gates.
 */
import { expect, test } from "@playwright/test";

const route = process.env.ASSEMBLY_SMOKE_ROUTE?.trim() || "";
const requireLive =
  process.env.ASSEMBLY_SMOKE_REQUIRE?.trim().toLowerCase() === "1" ||
  process.env.ASSEMBLY_SMOKE_REQUIRE?.trim().toLowerCase() === "true" ||
  process.env.ASSEMBLY_SMOKE_REQUIRE?.trim().toLowerCase() === "yes";
const titles = (process.env.ASSEMBLY_SMOKE_TITLES || "Total Revenue,Sales History")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const metricsPath =
  process.env.ASSEMBLY_SMOKE_METRICS_PATH?.trim() || "/api/v1/metrics";

test.describe("assembly dashboard smoke", () => {
  if (requireLive && !route) {
    test("ASSEMBLY_SMOKE_ROUTE required when ASSEMBLY_SMOKE_REQUIRE=1", () => {
      throw new Error(
        "ASSEMBLY_SMOKE_ROUTE unset with ASSEMBLY_SMOKE_REQUIRE=1 — refuse skip-as-green",
      );
    });
  } else {
    test.skip(!route, "Set ASSEMBLY_SMOKE_ROUTE to run live assembly smoke");
  }

  test("shows Manifest card titles and hits metrics data_source", async ({
    page,
  }) => {
    test.skip(!route, "route required");
    const metricsHits: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes(metricsPath)) metricsHits.push(url);
    });

    await page.goto(route);
    for (const title of titles) {
      await expect(
        page.locator(`[data-assembly-title="${title}"]`).first(),
      ).toBeVisible({ timeout: 30_000 });
    }

    const refresh = page.getByRole("button", { name: /refresh/i });
    if (await refresh.count()) {
      await refresh.first().click();
    }
    await page.waitForTimeout(1500);
    expect(
      metricsHits.length,
      `expected network to ${metricsPath}, got ${metricsHits.join(", ") || "none"}`,
    ).toBeGreaterThan(0);
  });
});
