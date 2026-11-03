import { test, expect, users, loginAs, S1, PASSWORD } from "../fixtures";
import type { Page } from "@playwright/test";

// #71 — кіру мен шығу: жалпы қате мәтіні (аккаунтты анықтатпайды), бағыттаулар, cookie.
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Құпия сөз").fill(password);
  await page.getByRole("button", { name: "Кіру", exact: true }).click();
}
const hasSession = async (page: Page) => (await page.context().cookies()).some((c) => c.name === "debug_session");

test.describe("Кіру және шығу (#71)", () => {
  test("A71-1, A71-2: қате құпия сөз мен белгісіз email — бірдей жалпы қате, cookie жоқ", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]) });
    await login(page, S1.email, "wrong-pass-9");
    const msg = page.locator(".msg.err");
    await expect(msg).toBeVisible();
    const wrongPassword = await msg.textContent();
    await expect(page).toHaveURL(/\/login$/);
    expect(await hasSession(page)).toBe(false);

    await login(page, "nobody@mock.test", "wrong-pass-9");
    await expect(page.locator(".msg.err")).toHaveText(wrongPassword!);
    expect(await hasSession(page)).toBe(false);
  });

  test("A71-3: дұрыс деректер → /contest, тақырыпта студенттің аты", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]) });
    await login(page, S1.email, PASSWORD);
    await expect(page).toHaveURL(/\/contest$/);
    await expect(page.locator(".c-name")).toHaveText("Серіков Айдос");
    expect(await hasSession(page)).toBe(true);
  });

  test("A71-4: кірген студент /login ашса → /contest", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]) });
    await loginAs(page, S1.email);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/contest$/);
  });

  test("A71-5: /me-дегі «Шығу» → /login, сосын /contest → /login?next=/contest", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]) });
    await loginAs(page, S1.email);
    await page.goto("/me");
    await page.getByRole("button", { name: "Шығу" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await hasSession(page)).toBe(false);
    await page.goto("/contest");
    await expect(page).toHaveURL(/\/login\?next=\/contest$/);
  });

  test("A71-6: «Кіру» / «Тіркелу» қойындылары форманы ауыстырады", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Тегі")).toHaveCount(0);
    await page.getByRole("tab", { name: "Тіркелу" }).click();
    await expect(page.getByLabel("Тегі")).toBeVisible();
    await page.getByRole("tab", { name: "Кіру" }).click();
    await expect(page.getByLabel("Тегі")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Кіру", exact: true })).toBeVisible();
  });
});
