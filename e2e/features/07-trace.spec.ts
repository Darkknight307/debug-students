import { test, expect, contest, users, loginAs, running, iso, S1, ID } from "../fixtures";
import type { Page } from "@playwright/test";

// #75 — Trace: жауап бірден сақталады, соңғы таңдау есептеледі, қайта ашқанда сақталған, уақыт біткен соң өзгермейді.
const variantA = [{ contest_id: ID.contest, student_id: S1.id, variant: "A" }];
const card = (page: Page, n: number) => page.locator("article.qcard").nth(n);
const subsOf = async (hooks: { dump(): Promise<Record<string, Record<string, unknown>[]>> }) =>
  ((await hooks.dump()).submissions as { task_id: string; answer: string; created_at: string; id: number }[]).sort((a, b) => a.id - b.id);

test.describe("Trace кезеңі (#75)", () => {
  test.beforeEach(async ({ page, hooks }) => {
    if (test.info().title.startsWith("T75-6")) return;
    await hooks.seed({ users: users([S1]), ...contest({ startsIn: -60_000, r1: running() }), variants: variantA });
    await loginAs(page, S1.email);
    await page.goto("/contest");
  });

  test("T75-1: тек өз нұсқасы мен ортақ сұрақтар, есептегіш 0/3", async ({ page }) => {
    await expect(page.locator("article.qcard")).toHaveCount(3);
    await expect(page.getByText("A нұсқасының сұрағы")).toBeVisible();
    await expect(page.getByText("B нұсқасының сұрағы")).toHaveCount(0);
    await expect(page.locator(".qcount")).toHaveText("0/3");
  });

  test("T75-2, T75-3: таңдау бірден сақталады; соңғы таңдау есептеледі", async ({ page, hooks }) => {
    await card(page, 0).getByRole("radio").nth(1).click();
    await expect(card(page, 0).locator(".save")).toHaveText("сақталды ✓");
    await expect(page.locator(".qcount")).toHaveText("1/3");
    expect((await subsOf(hooks)).map((s) => [s.task_id, s.answer])).toEqual([[ID.t1a, "b"]]);

    await page.waitForTimeout(400); // сервер бір тапсырмаға 250 мс-тан жиі жауапты қабылдамайды («Тым жиі»)
    await card(page, 0).getByRole("radio").nth(2).click();
    await expect(card(page, 0).locator(".save")).toHaveText("сақталды ✓");
    const subs = await subsOf(hooks);
    expect(subs.at(-1)).toMatchObject({ task_id: ID.t1a, answer: "c" });
    await expect(page.locator(".qcount")).toHaveText("1/3");
  });

  test("T75-4: қайта ашқанда таңдау сақталған", async ({ page }) => {
    await card(page, 1).getByRole("radio").nth(0).click();
    await expect(card(page, 1).locator(".save")).toHaveText("сақталды ✓");
    await page.reload();
    await expect(card(page, 1).getByRole("radio").nth(0)).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".qcount")).toHaveText("1/3");
  });

  test("T75-5: күй жауабында жауап кілттері жоқ", async ({ page }) => {
    const text = await (await page.request.get("/api/contest/state?full=1")).text();
    expect(text).toContain("A нұсқасының сұрағы");
    expect(text).not.toMatch(/"correct"|SECRET_SOLUTION|tests_hidden|solution_code/);
  });

  test("T75-6: уақыт біткен — нұсқалар өшірулі, хабар шығады, жаңа жауап сақталмайды", async ({ page, hooks }) => {
    // Кезең бет ашық тұрғанда аяқталады (4 с қалды) — студент «уақыт бітті» күйін көреді
    await hooks.seed({ users: users([S1]), ...contest({ startsIn: -3_600_000, r1: { status: "running", started_at: iso(-60_000), ends_at: iso(4_000) } }), variants: variantA });
    await loginAs(page, S1.email);
    await page.goto("/contest");
    await expect(page.locator("article.qcard")).toHaveCount(3);
    await expect(page.locator(".c-timer")).toContainText("уақыт бітті", { timeout: 10_000 });
    await expect(page.getByText("Кезең аяқталды. Жауаптарың сақталды — келесі кезеңді күт.")).toBeVisible();
    await expect(card(page, 0).getByRole("radio").first()).toBeDisabled();
    await card(page, 0).getByRole("radio").first().click({ force: true });
    expect(await subsOf(hooks)).toHaveLength(0);
  });
});
