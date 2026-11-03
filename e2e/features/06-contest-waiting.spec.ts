import { test, expect, contest, users, loginAs, closed, pending, running, S1, ID, iso } from "../fixtures";

// #74 — /contest күйлері: жарыс жоқ, кері санақ, кезеңдер арасы, кезең өзі ашылады, жарыс аяқталды.
test.describe("Жарыс беті: күйлер мен кері санақ (#74)", () => {
  test("W74-1: кірмеген адам → /login?next=/contest", async ({ page }) => {
    await page.goto("/contest");
    await expect(page).toHaveURL(/\/login\?next=\/contest$/);
  });

  test("W74-2: жарияланған жарыс жоқ → «Қазір жарыс жоқ»", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]) });
    await loginAs(page, S1.email);
    await page.goto("/contest");
    await expect(page.getByRole("heading", { name: "Қазір жарыс жоқ" })).toBeVisible();
  });

  test("W74-3: болашақтағы жарыс → кері санақ, студенттің аты, үш кезең", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]), ...contest({ startsIn: 2 * 3_600_000 }) });
    await loginAs(page, S1.email);
    await page.goto("/contest");
    await expect(page.getByRole("heading", { name: "Жарыс басталуына" })).toBeVisible();
    await expect(page.locator(".c-big")).toHaveText(/\d{1,2}:\d{2}:\d{2}|\d+/);
    await expect(page.locator(".c-name")).toHaveText("Серіков Айдос");
    await expect(page.locator(".c-steps li")).toHaveText([/Trace/, /Debug/, /Build/]);
  });

  test("W74-4: 1-кезең жабық, 2-сі күтуде → «2-кезең · Debug жақында»", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]), ...contest({ startsIn: -3_600_000, r1: closed(), r2: pending() }) });
    await loginAs(page, S1.email);
    await page.goto("/contest");
    await expect(page.getByRole("heading", { name: "2-кезең · Debug жақында" })).toBeVisible();
  });

  test("W74-5: оператор кезеңді ашса, бет өзі ауысады және «басталды» жолағы шығады", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]), ...contest({ startsIn: -60_000 }), variants: [{ contest_id: ID.contest, student_id: S1.id, variant: "A" }] });
    await loginAs(page, S1.email);
    await page.goto("/contest");
    await expect(page.getByRole("heading", { name: "1-кезең · Trace жақында" })).toBeVisible();
    await hooks.patch("rounds", ID.r1, { ...running(), started_at: iso(0) });
    await expect(page.locator(".c-banner")).toHaveText(/1-кезең басталды · Trace/, { timeout: 20_000 });
    await expect(page.getByRole("radiogroup").first()).toBeVisible();
  });

  test("W74-6: барлық кезең жабық → «Жарыс аяқталды» және «Лидерборд»", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]), ...contest({ startsIn: -3_600_000, r1: closed(), r2: closed(), r3: closed() }) });
    await loginAs(page, S1.email);
    await page.goto("/contest");
    await expect(page.getByRole("heading", { name: "Жарыс аяқталды" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Лидерборд" })).toHaveAttribute("href", "/board");
  });
});
