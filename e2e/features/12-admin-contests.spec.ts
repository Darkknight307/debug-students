import { test, expect, users, adminLogin, expectNoHorizontalScroll } from "../fixtures";
import type { Page } from "@playwright/test";

// #80 — әкімші жарысты құрады, жариялайды, өңдейді; қате мәндер; жариялау басты бетке жетеді.
async function createContest(page: Page) {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Жаңа жарыс" }).click();
  await page.getByLabel("Кілт (ай)").fill("2026-12");
  await page.getByLabel("Басталу уақыты").fill("2026-12-20T15:00");
  await page.getByLabel("Атауы").fill("DEBUG · Желтоқсан");
  await page.getByRole("button", { name: "Құру" }).click();
  const card = page.locator("a.card", { hasText: "DEBUG · Желтоқсан" });
  await expect(card).toBeVisible();
  return card;
}
const landingTitle = async (page: Page) => (await (await page.request.get("/api/public/landing")).json()).contest?.title ?? null;

test.describe("Жарыстарды басқару (#80)", () => {
  test.beforeEach(async ({ page, hooks }) => {
    await hooks.seed({ users: users([], true) });
    await adminLogin(page);
  });

  test("AC80-1, AC80-2: жаңа жарыс «жоба» күйінде, үш кезеңмен; жариялаған соң басты бетте", async ({ page }) => {
    const card = await createContest(page);
    await expect(card.locator(".pill")).toHaveText("жоба");
    expect(await landingTitle(page)).toBeNull();
    await card.click();
    await expect(page.getByRole("heading", { name: "DEBUG · Желтоқсан" })).toBeVisible();
    await expect(page.locator("section h2")).toHaveText(["Trace — кодты оқу", "Debug — қатені түзет", "Build — өзің жаз"]);
    await page.getByRole("button", { name: "жарияланды" }).click();
    await expect(page.getByRole("button", { name: "жарияланды" })).not.toHaveClass(/btn-ghost/);
    await expect.poll(() => landingTitle(page)).toBe("DEBUG · Желтоқсан");
  });

  test("AC80-3: атауы мен уақытын өңдеу сақталады (қайта ашқанда да)", async ({ page }) => {
    await (await createContest(page)).click();
    await page.getByRole("button", { name: "өңдеу" }).click();
    await page.getByLabel("Атауы").fill("DEBUG · Желтоқсан 2026");
    await page.getByLabel("Басталу уақыты").fill("2026-12-21T16:30");
    await page.getByRole("button", { name: "Сақтау" }).click();
    await expect(page.getByRole("heading", { name: "DEBUG · Желтоқсан 2026" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "DEBUG · Желтоқсан 2026" })).toBeVisible();
    const res = await (await page.request.get("/api/admin/contests")).json();
    const list = (Array.isArray(res) ? res : res.contests) as { title: string; starts_at: string }[];
    expect(list.map((c) => [c.title, c.starts_at])).toEqual([["DEBUG · Желтоқсан 2026", "2026-12-21T11:30:00.000Z"]]);
  });

  test("AC80-4: бос атау мен қате уақыт — хабарлар, ештеңе өзгермейді", async ({ page, hooks }) => {
    await (await createContest(page)).click();
    await page.getByRole("button", { name: "өңдеу" }).click();
    await page.getByLabel("Атауы").fill("   ");
    await page.getByRole("button", { name: "Сақтау" }).click();
    await expect(page.locator(".msg.err")).toHaveText("! жарыстың атауы керек");
    // Браузердің өз тексерісін өшіріп, беттің тексерісін көреміз (бос уақыт)
    await page.getByLabel("Атауы").fill("Жаңа атау");
    await page.locator("form", { has: page.getByLabel("Басталу уақыты") }).evaluate((f) => ((f as HTMLFormElement).noValidate = true));
    await page.getByLabel("Басталу уақыты").fill("");
    await page.getByRole("button", { name: "Сақтау" }).click();
    await expect(page.locator(".msg.err")).toHaveText("! басталу уақытын дұрыс енгізіңіз");
    const c = (await hooks.dump()).contests[0];
    expect([c.title, c.starts_at]).toEqual(["DEBUG · Желтоқсан", "2026-12-20T10:00:00.000Z"]);
  });

  test("AC80-5: 375 px — жарыс беті көлденең айналмайды", async ({ page }) => {
    await (await createContest(page)).click();
    await expect(page.getByRole("heading", { name: "DEBUG · Желтоқсан" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
