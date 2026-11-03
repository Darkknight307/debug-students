import { test, expect, users, S1, PASSWORD } from "../fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

// #72 — құпия сөзді қалпына келтіру: хат (тест outbox-ы) → жаңа құпия сөз → ескісі жарамайды, сілтеме бір рет.
async function requestLink(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Құпия сөзді ұмыттым" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Сілтеме жіберу" }).click();
  await expect(page.getByText(`хат жіберілді: ${email}`)).toBeVisible();
}
/** Сілтеменің жолы мен параметрі (хост контейнер ішінен басқаша көрінуі мүмкін). */
const pathOf = (link: string) => {
  const u = new URL(link);
  return u.pathname + u.search;
};
async function save(page: Page, password: string, repeat = password) {
  await page.getByLabel("Жаңа құпия сөз").fill(password);
  await page.getByLabel("Қайталаңыз").fill(repeat);
  await page.getByRole("button", { name: "Сақтау" }).click();
}
/** Браузерден бөлек сұраныс контексі: беттегі сессияға әсер етпейді. */
const loginStatus = async (request: APIRequestContext, password: string) =>
  (await request.post("/api/auth/login", { data: { email: S1.email, password } })).status();

test.describe("Құпия сөзді қалпына келтіру (#72)", () => {
  test("F72-1…F72-4: хат тек тіркелген адамға, сәйкес емес қайталау, жаңа құпия сөз, ескісі жарамайды", async ({ page, hooks, request }) => {
    await hooks.seed({ users: users([S1]) });
    await requestLink(page, S1.email);
    await requestLink(page, "nobody@mock.test");
    const mail = await hooks.outbox();
    expect(mail.map((m) => m.to)).toEqual([S1.email]);

    await page.goto(pathOf(mail[0].link));
    await save(page, "new-fixture-pass-2", "other-fixture-pass");
    await expect(page.getByText("Құпия сөздер сәйкес емес.")).toBeVisible();

    expect(await loginStatus(request, PASSWORD)).toBe(200); // ештеңе өзгермеді

    await save(page, "new-fixture-pass-2");
    await expect(page.getByText("құпия сөз жаңартылды").or(page.getByRole("heading", { name: "Серіков Айдос" }))).toBeVisible();
    expect(await loginStatus(request, PASSWORD)).toBe(401);
    expect(await loginStatus(request, "new-fixture-pass-2")).toBe(200);
  });

  test("F72-5: сол сілтеме екінші рет — қате және «Жаңа хат сұрау»", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]) });
    await requestLink(page, S1.email);
    const [m] = await hooks.outbox();
    await page.goto(pathOf(m.link));
    await save(page, "new-fixture-pass-2");
    await expect(page.getByText("құпия сөз жаңартылды").or(page.getByRole("heading", { name: "Серіков Айдос" }))).toBeVisible();
    await page.context().clearCookies();
    await page.goto(pathOf(m.link));
    await save(page, "new-fixture-pass-3");
    await expect(page.locator(".msg.err")).toBeVisible();
    await expect(page.getByRole("link", { name: "Жаңа хат сұрау" })).toBeVisible();
  });
});
