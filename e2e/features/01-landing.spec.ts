import { test, expect, contest, users, loginAs, expectNoHorizontalScroll, S1 } from "../fixtures";

// #69 — басты бет: жарияланған жарыс, кері санақ, қатысушылар тізімі, тіркелуге апару.
test.describe("Лендинг (#69)", () => {
  test("L69-1, L69-2: жарыстың атауы, сан күйіндегі кері санақ, тек «Тегі Аты» тізімі", async ({ page, hooks }) => {
    await hooks.seed({ users: users(), ...contest({ startsIn: 2 * 86_400_000 + 3 * 3_600_000 }) });
    await page.goto("/");
    await expect(page.locator("#heroTitle")).toHaveText("Тест жарысы");
    await expect.poll(async () => Number(await page.locator("#cdD").textContent())).toBe(2);
    for (const id of ["#cdH", "#cdM", "#cdS"]) await expect(page.locator(id)).toHaveText(/^\d{2}$/);
    const roster = page.locator("#rosterList");
    await expect(roster).toContainText("Серіков Айдос");
    await expect(roster).toContainText("Қайрат Бота");
    await expect(page.locator("#bigCount")).toHaveText("2");
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/@mock\.test|\+?7701|Мок универ|Мок колледж/);
  });

  test("L69-3: «Тіркелу» тіркелу формасына апарады", async ({ page, hooks }) => {
    await hooks.seed({ ...contest() });
    await page.goto("/");
    await page.locator("#heroCta").click();
    await expect(page).toHaveURL(/\/login\?tab=register$/);
    await expect(page.getByLabel("Тегі")).toBeVisible();
    await expect(page.getByLabel("Оқу орны")).toBeVisible();
  });

  test("L69-4: кірген студентке «Жарыс бетіне өту» және «Жарыс беті»", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]), ...contest() });
    await loginAs(page, S1.email);
    await page.goto("/");
    await expect(page.locator("#heroCta")).toHaveText("Жарыс бетіне өту");
    await expect(page.locator("#heroCta")).toHaveAttribute("href", "/contest");
    await expect(page.locator("#chipLoginFull")).toHaveText("Жарыс беті");
    await expect(page.locator("#chipLogin")).toHaveAttribute("href", "/contest");
  });

  test("L69-5: жарыс жоқ — бет қатесіз ашылады, тізім бос", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#dateChip")).toHaveText("жақында");
    await expect(page.locator("#heroTitle")).toHaveText("");
    await expect(page.locator("#rosterList")).toContainText("Тізім бос");
    await expect(page.locator("#heroCta")).toBeVisible();
  });

  test("L69-6: 375 px — көлденең айналым жоқ, кіру белгісі көрінеді", async ({ page, hooks }) => {
    await hooks.seed({ users: users(), ...contest() });
    await page.goto("/");
    await expect(page.locator("#heroTitle")).toHaveText("Тест жарысы");
    await expectNoHorizontalScroll(page);
    await expect(page.locator("#chipLogin")).toBeVisible();
  });
});
