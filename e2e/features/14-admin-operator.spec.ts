import { test, expect, contest, users, adminLogin, loginAs, S1, S2, ID } from "../fixtures";
import type { Browser, Page } from "@playwright/test";

// #82 — оператор консолі жарысты тірі жүргізеді, студент оны екінші браузерде көреді.
async function studentPage(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL || "http://localhost:3300", timezoneId: "Asia/Almaty", reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await loginAs(p, email);
  await p.goto("/contest");
  return p;
}
const roundRow = (page: Page, n: number) => page.locator("section.card", { hasText: "оператор консолі" }).locator(".between", { hasText: `${n}. ` }).first();
const endsAt = async (p: Page) => {
  const st = await (await p.request.get("/api/contest/state")).json();
  return Date.parse(st.rounds.find((r: { idx: number }) => r.idx === 1).endsAt);
};

test.describe("Оператор консолі (#82)", () => {
  test("OP82-1…OP82-6: бастау, жеке +5 мин, жіберілім санағы, лидербордты жабу, аяқтау", async ({ page, hooks, browser }) => {
    test.setTimeout(150_000);
    await hooks.seed({ users: users([S1, S2], true), ...contest({ startsIn: -60_000 }) });
    await adminLogin(page);
    await page.goto(`/admin/c/${ID.contest}`);
    const console_ = page.locator("section.card", { hasText: "оператор консолі" });
    await expect(console_.getByText("басталмаған")).toHaveCount(3);
    await expect(console_).toContainText("0 студент Trace ашты · 0 жіберілім");

    const student = await studentPage(browser, S1.email);
    const other = await studentPage(browser, S2.email);
    await expect(student.getByRole("heading", { name: "1-кезең · Trace жақында" })).toBeVisible();

    // OP82-2: бастау
    page.once("dialog", (d) => d.accept());
    await roundRow(page, 1).getByRole("button", { name: "бастау" }).click();
    await expect(roundRow(page, 1)).toContainText(/жүріп жатыр · \d{2}:\d{2} қалды/);
    await expect(student.getByRole("radiogroup").first()).toBeVisible({ timeout: 20_000 });

    // OP82-3: жеке +5 мин тек Серіков Айдосқа
    const [s1Before, s2Before] = [await endsAt(student), await endsAt(other)];
    await console_.getByPlaceholder("студенттің аты-жөні…").fill("Серік");
    await console_.getByRole("button", { name: /Серіков Айдос/ }).click();
    await expect(console_.getByText("✓ Серіков Айдос: +5 мин (1-кезең)")).toBeVisible();
    await expect.poll(async () => (await endsAt(student)) - s1Before, { timeout: 15_000 }).toBe(5 * 60_000);
    expect(await endsAt(other)).toBe(s2Before);

    // OP82-4: студент жауап береді → консольде 1 жіберілім
    await student.locator("article.qcard").first().getByRole("radio").nth(1).click();
    await expect(student.locator("article.qcard").first().locator(".save")).toHaveText("сақталды ✓");
    await expect(console_).toContainText("1 жіберілім", { timeout: 20_000 });

    // OP82-5: лидербордты қолмен жабу / ашу
    await console_.getByRole("button", { name: "қолмен жабу" }).click();
    await expect(console_.getByText("Лидерборд жабық 🔒")).toBeVisible();
    const board = await page.context().newPage();
    await board.goto("/board");
    await expect(board.getByText("Лидерборд жабылды")).toBeVisible();
    await console_.getByRole("button", { name: "ашу" }).click();
    await expect(console_.getByText("Лидерборд ашық")).toBeVisible();

    // OP82-6: аяқтау — жеке ұзартусыз студент 2-кезеңді күтеді; +5 мин алған студенттің өз 5 минуты қалады (әдейі солай)
    page.once("dialog", (d) => d.accept());
    await roundRow(page, 1).getByRole("button", { name: "аяқтау" }).click();
    await expect(roundRow(page, 1)).toContainText("аяқталды");
    await expect(other.getByRole("heading", { name: "2-кезең · Debug жақында" })).toBeVisible({ timeout: 20_000 });
    await expect(other.getByRole("radiogroup")).toHaveCount(0);
    await student.reload();
    await expect(student.getByRole("radiogroup").first()).toBeVisible();
    await expect(student.locator(".c-timer")).toContainText(/0[45]:\d{2}/);
    await student.context().close();
    await other.context().close();
  });
});
