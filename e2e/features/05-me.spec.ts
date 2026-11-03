import { test, expect, users, loginAs, expectNoHorizontalScroll, S1 } from "../fixtures";

// #73 — /me: өз профилі (контактілер жасырылған), жарыс/лидерборд/шығу сілтемелері; кірмеген адамға жабық.
test.describe("Студент беті /me (#73)", () => {
  test("M73-1: кірмеген адам → /login", async ({ page }) => {
    await page.goto("/me");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("M73-2: аты, оқу орны, курс, жасырылған email мен телефон; толық контакт бетте жоқ", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]) });
    await loginAs(page, S1.email);
    await page.goto("/me");
    await expect(page.getByRole("heading", { name: "Серіков Айдос" })).toBeVisible();
    const row = (k: string) => page.locator("dl > div", { has: page.locator("dt", { hasText: k }) }).locator("dd");
    await expect(row("Оқу орны")).toHaveText("Мок университеті");
    await expect(row("Курс")).toHaveText("2 курс");
    await expect(row("Email")).toHaveText("s1•••@mock.test");
    await expect(row("Телефон")).toHaveText("••• ••• 00 01");
    const text = await page.locator("body").innerText();
    expect(text).not.toContain(S1.email);
    expect(text).not.toMatch(/7010000001|701 000 00 01/);
  });

  test("M73-3: «Жарыс бетіне өту», «Лидерборд», «Шығу»", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]) });
    await loginAs(page, S1.email);
    await page.goto("/me");
    await page.getByRole("link", { name: "Жарыс бетіне өту" }).click();
    await expect(page).toHaveURL(/\/contest$/);
    await page.goto("/me");
    await page.getByRole("link", { name: "Лидерборд" }).click();
    await expect(page).toHaveURL(/\/board$/);
    await page.goto("/me");
    await page.getByRole("button", { name: "Шығу" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("M73-4: 375 px — көлденең айналым жоқ, үш әрекет көрінеді", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]) });
    await loginAs(page, S1.email);
    await page.goto("/me");
    await expect(page.getByRole("heading", { name: "Серіков Айдос" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    for (const l of [page.getByRole("link", { name: "Жарыс бетіне өту" }), page.getByRole("link", { name: "Лидерборд" }), page.getByRole("button", { name: "Шығу" })]) {
      await expect(l).toBeVisible();
    }
  });
});
