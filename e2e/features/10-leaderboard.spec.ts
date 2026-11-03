import { test, expect, contest, users, closed, running, expectNoHorizontalScroll, S1, S2, S3, ID, iso } from "../fixtures";

// #78 — ашық лидерборд /board: тек «Тегі Аты», ұпай реті, тірі жаңару, бос және жабық күйлер.
const sub = (n: number, student: string, task: string, round: string, points: number) => ({
  id: n, contest_id: ID.contest, round_id: round, task_id: task, student_id: student, answer: null, code: "x", is_correct: true, points, reason: null, created_at: iso(-600_000 + n * 1000),
});
const base = [sub(1, S1.id, ID.t2, ID.r1, 1), sub(2, S1.id, ID.d11, ID.r2, 3), sub(3, S2.id, ID.t2, ID.r1, 1)];
const world = (extra = {}) => ({ users: users([S1, S2, S3]), ...contest({ startsIn: -3_600_000, r1: closed(), r2: running(), ...extra }) });

test.describe("Лидерборд (#78)", () => {
  test("LB78-1: жарыс жоқ — «Жарыс әлі басталған жоқ», жолдар жоқ", async ({ page }) => {
    await page.goto("/board");
    await expect(page.locator("#msgEmpty")).toBeVisible();
    await expect(page.locator("#msgEmptySub")).toHaveText("Жарыс әлі басталған жоқ");
    await expect(page.locator("#rows .row")).toHaveCount(0);
  });

  test("LB78-2, LB78-3: ұпай реті, тек есімдер; жаңа дұрыс жауап бетті жаңартпай шығады", async ({ page, hooks }) => {
    await hooks.seed({ ...world(), submissions: base });
    await page.goto("/board");
    const rows = page.locator("#rows .row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator(".nm")).toHaveText("Серіков Айдос");
    await expect(rows.nth(0).locator(".sc")).toHaveText(/4/);
    await expect(rows.nth(1).locator(".nm")).toHaveText("Қайрат Бота");
    expect(await page.locator("body").innerText()).not.toMatch(/@mock\.test|Мок универ|Мок колледж|\+7701/);

    await hooks.seed({ submissions: [...base, sub(4, S3.id, ID.d11, ID.r2, 3)] });
    await expect(rows).toHaveCount(3, { timeout: 25_000 });
    await expect(page.locator("#rows .row .nm", { hasText: "Омаров Ержан" })).toBeVisible();
  });

  test("LB78-4: әкімші жапқан лидерборд — құлып хабары, жолдар жоқ", async ({ page, hooks }) => {
    await hooks.seed({ ...world({ boardLocked: true }), submissions: base });
    await page.goto("/board");
    await expect(page.locator("#msgLock")).toBeVisible();
    await expect(page.getByText("Лидерборд жабылды")).toBeVisible();
    await expect(page.locator("#rows")).toBeHidden();
  });

  test("LB78-5: 375 px — көлденең айналым жоқ, есімдер оқылады", async ({ page, hooks }) => {
    await hooks.seed({ ...world(), submissions: base });
    await page.goto("/board");
    const name = page.locator("#rows .row .nm").first();
    await expect(name).toHaveText("Серіков Айдос");
    await expectNoHorizontalScroll(page);
    expect((await name.boundingBox())!.width).toBeGreaterThan(40);
  });
});
