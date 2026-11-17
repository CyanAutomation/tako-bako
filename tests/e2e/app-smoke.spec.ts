import { expect, test, type Page } from "@playwright/test";

const puzzle = {
  id: "browser-smoke-puzzle",
  seed: "browser-smoke-puzzle",
  puzzleToken: "browser-smoke-token",
  clues: [],
  difficulty: { level: 1, label: "Very easy", modelVersion: "smoke-test" },
  spec: {
    id: "tournament-order-v2",
    title: "Tournament Order",
    baseCategory: "judoka",
    categories: [
      { id: "judoka", label: "Judoka", values: ["Aki", "Ben"] },
      { id: "club", label: "Club", values: ["Lions", "Wolves"] },
    ],
  },
};

async function mockPuzzleApis(page: Page): Promise<void> {
  await page.route("**/api/puzzle**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(puzzle),
  }));
  await page.route("**/api/events**", route => route.fulfill({ status: 204, body: "" }));
}

test("a player can start a challenge puzzle and mark a grid cell", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await mockPuzzleApis(page);

  await page.goto("/");
  await expect(page).toHaveTitle("Tako Bako · Judo logic puzzles");
  await expect(page.getByRole("heading", { name: "One small grid. One satisfying deduction." })).toBeVisible();
  await page.getByRole("button", { name: "Start Beginner Level 1" }).click();

  await expect(page.getByRole("heading", { name: "Tournament Order" })).toBeVisible();
  const cell = page.getByRole("button", { name: "Aki, Lions: unknown. Select to change." });
  await cell.click();
  await expect(page.getByRole("button", { name: "Aki, Lions: yes. Select to change." })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("[TB-URL-04] browser Back returns to the landing page after starting a challenge", async ({ page }) => {
  await mockPuzzleApis(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Start Beginner Level 1" }).click();
  await expect(page.getByRole("heading", { name: "Tournament Order" })).toBeVisible();
  await expect(page).not.toHaveURL("/");

  await page.goBack();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "One small grid. One satisfying deduction." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Beginner Level 1" })).toBeVisible();
});

test("[TB-CLUE-02] restarting a challenge closes the open clue filters disclosure", async ({ page }) => {
  await mockPuzzleApis(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Start Beginner Level 1" }).click();
  await expect(page.getByRole("heading", { name: "Tournament Order" })).toBeVisible();

  const filters = page.locator("details.clue-filter-disclosure");
  await page.getByText("Review filters", { exact: true }).click();
  await expect(filters).toHaveJSProperty("open", true);

  await page.getByText("More", { exact: true }).click();
  await page.getByRole("button", { name: "Restart this level" }).click();

  await expect(page.getByRole("heading", { name: "Tournament Order" })).toBeVisible();
  await expect(filters).toHaveJSProperty("open", false);
});
