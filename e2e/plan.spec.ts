/**
 * End-to-end smoke tests for the Capital Plan screen. Runs against the
 * `vite preview` build of `apps/web/dist`, which serves the same assets
 * a GitHub Pages deploy would — including the committed snapshot +
 * options JSONs under `public/data/`. So these tests pin behavior on
 * the actual production data, not synthetic fixtures.
 *
 * Bug history (2026-05-11): the Plan screen defaulted to "monthly"
 * but the ingest's expiration selector dropped monthly via dedupe.
 * The vitest integration test (CapitalPlanScreen.integration.test.tsx)
 * already catches that class at the data-shape layer; these e2e tests
 * additionally verify the rendered DOM the user actually sees.
 */
import { expect, test } from "@playwright/test";

test.describe("Capital Plan screen — e2e", () => {
  test("loads the Plan tab, shows the form, and populates the allocation table", async ({ page }) => {
    await page.goto("/#/plan");

    // Wait for the screen heading.
    await expect(
      page.getByRole("heading", { level: 1, name: /capital plan/i }),
    ).toBeVisible();

    // The three expiration-mode toggles render.
    const modeNav = page.getByRole("navigation", { name: /expiration mode/i });
    await expect(modeNav.getByRole("button", { name: /weekly/i })).toBeVisible();
    await expect(modeNav.getByRole("button", { name: /monthly/i })).toBeVisible();
    await expect(modeNav.getByRole("button", { name: /yearly/i })).toBeVisible();

    // Wait for options data to finish loading (the loading status disappears).
    await expect(page.getByText(/loading options data/i)).toBeHidden({ timeout: 30_000 });

    // At default capital ($10k) the table should render with at least
    // one data row. If the table is empty we're back in the regression
    // class where monthly slot is missing from the ingest output.
    const table = page.getByRole("table", { name: /capital allocation plan/i });
    await expect(table).toBeVisible();
    const rowCount = await table.getByRole("row").count();
    expect(rowCount).toBeGreaterThan(1);  // 1 header + ≥ 1 data row
  });

  test("changing capital to $70k allocates at least one contract", async ({ page }) => {
    await page.goto("/#/plan");
    await expect(page.getByText(/loading options data/i)).toBeHidden({ timeout: 30_000 });

    const capital = page.getByLabel(/capital available/i);
    await capital.fill("70000");
    await capital.blur();

    const table = page.getByRole("table", { name: /capital allocation plan/i });
    await expect(table).toBeVisible();

    // Sum the contracts column (index 5: #, Symbol, Strike, DTE,
    // Premium / contract, Contracts, ...) across data rows.
    const total = await table.evaluate((tbl: HTMLTableElement) => {
      const rows = Array.from(tbl.querySelectorAll("tbody tr"));
      let sum = 0;
      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        const text = cells[5]?.textContent?.trim() ?? "0";
        const n = parseInt(text, 10);
        if (Number.isFinite(n)) sum += n;
      }
      return sum;
    });
    expect(total).toBeGreaterThan(0);
  });

  test("summary shows total invested capital and annualized return on collateral", async ({ page }) => {
    await page.goto("/#/plan");
    await expect(page.getByText(/loading options data/i)).toBeHidden({ timeout: 30_000 });
    await page.getByLabel(/capital available/i).fill("50000");

    const summary = page.getByRole("region", { name: /plan summary/i });
    await expect(summary).toBeVisible();

    // Total invested capital appears as a positive dollar amount and is
    // ≤ the input capital. Headline annualized return is a percentage.
    await expect(summary.getByText(/total invested capital/i)).toBeVisible();
    await expect(summary.getByText(/annualized return on collateral/i)).toBeVisible();
    const annualized = summary
      .locator(".plan__stat", { hasText: /annualized return on collateral/i })
      .locator(".plan__stat-value");
    await expect(annualized).toHaveText(/^\d+(\.\d+)?%$/);
  });

  test("hide-unallocated toggle removes zero-contract rows from the table", async ({ page }) => {
    await page.goto("/#/plan");
    await expect(page.getByText(/loading options data/i)).toBeHidden({ timeout: 30_000 });

    // Set a deliberately small capital so multiple candidates allocate
    // 0 contracts (a single expensive strike eats the budget).
    await page.getByLabel(/capital available/i).fill("5000");

    const table = page.getByRole("table", { name: /capital allocation plan/i });
    await expect(table).toBeVisible();
    const allRows = await table.locator("tbody tr").count();

    const zeroRowsBefore = await table
      .locator("tbody tr td:nth-child(6)")
      .evaluateAll((cells) => cells.filter((c) => c.textContent?.trim() === "0").length);
    // Only assert the toggle when we actually have something to hide.
    test.skip(zeroRowsBefore === 0, "No zero-contract rows at this capital");

    await page.getByLabel(/hide unallocated/i).check();
    const filteredRows = await table.locator("tbody tr").count();
    expect(filteredRows).toBeLessThan(allRows);
    expect(filteredRows).toBe(allRows - zeroRowsBefore);
  });

  test("switching expiration mode re-renders the table", async ({ page }) => {
    await page.goto("/#/plan");
    await expect(page.getByText(/loading options data/i)).toBeHidden({ timeout: 30_000 });

    const modeNav = page.getByRole("navigation", { name: /expiration mode/i });
    const table = page.getByRole("table", { name: /capital allocation plan/i });

    // Weekly should always be populated — every committed JSON has a
    // weekly slot since the selector's first pick is the soonest date.
    await modeNav.getByRole("button", { name: /weekly/i }).click();
    await expect(table).toBeVisible();
    expect(await table.getByRole("row").count()).toBeGreaterThan(1);

    // Yearly: same — every committed JSON with a January-2027 listed
    // date populates this slot.
    await modeNav.getByRole("button", { name: /yearly/i }).click();
    await expect(table).toBeVisible();
    expect(await table.getByRole("row").count()).toBeGreaterThan(1);
  });
});
