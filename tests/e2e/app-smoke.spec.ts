import { expect, test } from "@playwright/test";

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

test("a player can start a challenge puzzle and mark a grid cell", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.route("**/api/puzzle**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(puzzle),
  }));
  await page.route("**/api/events**", route => route.fulfill({ status: 204, body: "" }));

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
