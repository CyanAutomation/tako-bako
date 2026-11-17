import { expect, test, type Page } from "@playwright/test";
import { loadFixtures, type SimulatorFixture } from "../../simulator/fixture-loader.js";

const beginner = loadFixtures().find(fixture => fixture.publicPuzzle.templateId === "tournament-order-v2")!;
const progressKey = "tako-bako.challenge-progress.v1";

function listenForPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  return errors;
}

async function startBeginner(page: Page): Promise<void> {
  const generatedPuzzle = page.waitForResponse(response => response.url().includes("/api/puzzle") && response.request().method() === "GET");
  const startedEvent = page.waitForResponse(response => response.url().endsWith("/api/events") && response.request().method() === "POST");
  await page.goto("/");
  await page.getByRole("button", { name: "Start Beginner Level 1" }).click();
  const response = await generatedPuzzle;
  expect(response.status()).toBe(200);
  expect(response.headers()["x-tako-bako-simulator"]).toBe("true");
  await startedEvent;
  await expect(page.getByRole("heading", { name: "Tournament Order" })).toBeVisible();
}

async function markSolution(page: Page, fixture: SimulatorFixture, incorrect = false): Promise<void> {
  const categories = fixture.publicPuzzle.spec.categories;
  const base = categories.find(category => category.id === fixture.publicPuzzle.spec.baseCategory)!;
  const answer = structuredClone(fixture.solution.assignments);
  if (incorrect) {
    const categoryId = Object.keys(answer)[0]!;
    [answer[categoryId]![0], answer[categoryId]![1]] = [answer[categoryId]![1]!, answer[categoryId]![0]!];
  }

  for (const category of categories.filter(candidate => candidate.id !== base.id)) {
    await page.getByRole("tab", { name: category.label }).click();
    for (const [row, subject] of base.values.entries()) {
      const value = answer[category.id]![row]!;
      await page.getByRole("button", { name: `${subject}, ${value}: unknown. Select to change.` }).click();
    }
  }
}

async function savedProgress(page: Page): Promise<unknown> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), progressKey);
}

async function completedCourseIds(page: Page): Promise<string[]> {
  const saved = await savedProgress(page) as { completed?: unknown } | null;
  return saved && Array.isArray(saved.completed)
    ? saved.completed.filter((value): value is string => typeof value === "string")
    : [];
}

test("simulated Beginner Level 1 starts through the app API and renders fixture categories and clues", async ({ page }) => {
  const pageErrors = listenForPageErrors(page);
  await startBeginner(page);

  const base = beginner.publicPuzzle.spec.categories.find(category => category.id === beginner.publicPuzzle.spec.baseCategory)!;
  for (const category of beginner.publicPuzzle.spec.categories.filter(candidate => candidate.id !== base.id)) {
    await expect(page.getByRole("tab", { name: category.label })).toBeVisible();
  }
  await expect(page.getByText(beginner.publicPuzzle.clues[0]!.text, { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("a correct simulated answer completes Beginner Level 1 and saves Challenge progress", async ({ page }) => {
  const pageErrors = listenForPageErrors(page);
  await startBeginner(page);
  await markSolution(page, beginner);

  const verification = page.waitForResponse(response => response.url().endsWith("/api/puzzle") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Check my solution" }).click();
  const response = await verification;
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ correct: true });
  await expect(page.getByRole("status")).toContainText("Beginner Level 1 is complete");
  await expect.poll(() => savedProgress(page)).toEqual({ version: 1, completed: ["beginner-1"] });
  expect(pageErrors).toEqual([]);
});

test("a complete but incorrect simulated answer is rejected without advancing progress", async ({ page }) => {
  const pageErrors = listenForPageErrors(page);
  await startBeginner(page);
  await markSolution(page, beginner, true);

  const verification = page.waitForResponse(response => response.url().endsWith("/api/puzzle") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Check my solution" }).click();
  const response = await verification;
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ correct: false });
  await expect(page.getByRole("status")).toContainText("Not quite yet");
  await expect.poll(() => completedCourseIds(page)).toEqual([]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("the simulated hint flow displays a valid fixture clue", async ({ page }) => {
  const pageErrors = listenForPageErrors(page);
  await startBeginner(page);

  const hintResponse = page.waitForResponse(response => response.url().endsWith("/api/hint") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Get a hint" }).click();
  const response = await hintResponse;
  expect(response.status()).toBe(200);
  const hint = await response.json() as { kind: string; clue: { id: string; text: string } };
  expect(beginner.publicPuzzle.clues.some(clue => clue.id === hint.clue.id && clue.text === hint.clue.text)).toBe(true);
  await expect(page.getByRole("status")).toContainText(`Hint: ${hint.clue.text}`);
  expect(pageErrors).toEqual([]);
});
