import { test, expect, contest, users, adminLogin, closed, S1, S2, S3, ID, iso } from "../fixtures";

// #83 — ЖИ талдауы күдікті шешімдерді себебімен көрсетеді; «Қайта тексеру» жүлдегерлердің кодын барлық тестте
// әкімшінің браузерінде қайта орындайды және тек есеп береді (ұпай өзгермейді).
const GOOD_A = "def g(a):\n    seen = []\n    count = 0\n    for x in a:\n        if x not in seen:\n            seen.append(x)\n            count = count + 1\n    return count\n";
const GOOD_B = GOOD_A.replace(/seen/g, "uniq").replace(/count/g, "total").replace(/\bx\b/g, "item");
const BAD = "def g(a):\n    return len(a)\n";
const build = (n: number, student: string, code: string, at: number) => ({
  id: n, contest_id: ID.contest, round_id: ID.r3, task_id: ID.b15, student_id: student, answer: null, code, is_correct: true, points: 4, reason: null, created_at: iso(-3_000_000 + at * 60_000),
});
const subs = [build(1, S1.id, GOOD_A, 1), build(2, S2.id, GOOD_B, 3), build(3, S3.id, BAD, 5)];
const activity = [S1, S2, S3].map((s, i) => ({
  round_id: ID.r3, student_id: s.id, contest_id: ID.contest, updated_at: iso(-2_000_000),
  data: { blur_count: i, hidden_count: 0, tasks: { [ID.b15]: { keys: 180 + i * 10, dels: 12, blocked: i === 1 ? 2 : 0, pauses: 3, think_ms: 40_000 } } },
}));
const world = (withActivity: boolean) => ({
  users: users([S1, S2, S3], true),
  ...contest({ startsIn: -3_600_000, status: "finished", r1: closed(), r2: closed(), r3: closed() }),
  submissions: subs,
  ...(withActivity ? { activity } : {}),
});

test.describe("ЖИ талдауы және жүлдегерлерді қайта тексеру (#83)", () => {
  test("AI83-1, AI83-2: күдік деңгейлері, бірдей құрылымды жұп, аты бойынша сүзгі", async ({ page, hooks }) => {
    await hooks.seed(world(true));
    await adminLogin(page);
    await page.goto(`/admin/c/${ID.contest}/ai`);
    const rows = page.locator("tr.lvrow");
    await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(rows.nth(i).locator(".badge")).toHaveText(/^(жоғары|орташа|төмен) · /);
    await expect(page.getByText("Бұл жарыста бақылау дерегі жоқ")).toHaveCount(0);

    await rows.filter({ hasText: "Қайрат Бота" }).click();
    await expect(page.locator("tr.detail")).toContainText("құрылымы бірдей: Серіков Айдос");

    await page.getByPlaceholder("аты-жөні…").fill("Омаров");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Омаров Ержан");
  });

  test("AI83-3: бақылау дерегі жоқ жарыс — ескерту көрсетіледі", async ({ page, hooks }) => {
    await hooks.seed(world(false));
    await adminLogin(page);
    await page.goto(`/admin/c/${ID.contest}/ai`);
    await expect(page.locator("tr.lvrow")).toHaveCount(3);
    await expect(page.getByText(/Бұл жарыста бақылау дерегі жоқ/)).toBeVisible();
  });

  test("AI83-4, AI83-5: «Қайта тексеру» — ✓ толық өткенге, ✗ құлағанға; рейтинг өзгермейді", async ({ page, hooks }) => {
    test.setTimeout(150_000);
    await hooks.seed(world(true));
    await adminLogin(page);
    const ranking = async () => (await page.request.get(`/api/admin/contests/${ID.contest}/ranking`)).json();
    const before = await ranking();
    await page.goto(`/admin/c/${ID.contest}`);
    const panel = page.locator("section.card", { hasText: "жүлдегерлерді қайта тексеру" });
    await panel.getByRole("button", { name: "Қайта тексеру" }).click();
    await expect(panel.locator(".card-head")).toContainText("✓ дайын", { timeout: 120_000 });
    const cell = (name: string) => panel.locator("tr", { hasText: name }).locator("td").last();
    await expect(cell("Серіков Айдос")).toHaveText("✓ 4");
    await expect(cell("Қайрат Бота")).toHaveText("✓ 4");
    await expect(cell("Омаров Ержан")).toHaveText(/^✗ 1\/4$/);
    expect(await ranking()).toEqual(before);
  });
});
