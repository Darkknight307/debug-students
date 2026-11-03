import { test, expect, users, expectNoHorizontalScroll, S1, type Dump } from "../fixtures";
import type { Page } from "@playwright/test";

// #70 — тіркелу формасы: дұрыс тіркелу, қайталанған email, қате өрістер (ештеңе сақталмайды).
type Form = Partial<{ last: string; first: string; uni: string; course: string; phone: string; email: string; password: string }>;
const VALID: Form = { last: "Әлиев", first: "Ғалым", uni: "Мок университеті", course: "2 курс", email: "Galym.Aliev@Mock.Test", password: "fixture-pass-1" };

async function register(page: Page, f: Form) {
  await page.goto("/login?tab=register");
  if (f.last) await page.getByLabel("Тегі").fill(f.last);
  if (f.first) await page.getByLabel("Аты", { exact: true }).fill(f.first);
  if (f.uni) await page.getByLabel("Оқу орны").fill(f.uni);
  if (f.course) await page.getByLabel("Курс").selectOption(f.course);
  if (f.phone) await page.getByLabel("Телефон").fill(f.phone);
  if (f.email) await page.getByLabel("Email").fill(f.email);
  if (f.password) await page.getByLabel("Құпия сөз").fill(f.password);
  await page.getByRole("button", { name: "Тіркелу", exact: true }).click();
}
const students = (d: Dump) => d.users.filter((u) => u.role === "student");

test.describe("Тіркелу (#70)", () => {
  test("R70-1, R70-2: дұрыс форма → /me?welcome=1, бір студент сақталды", async ({ page, hooks }) => {
    await register(page, VALID);
    await expect(page).toHaveURL(/\/me\?welcome=1$/);
    await expect(page.getByRole("heading", { name: "Әлиев Ғалым" })).toBeVisible();
    await expect(page.getByText("✓ тіркелдіңіз — қатысушылар тізіміне қосылдыңыз")).toBeVisible();
    const s = students(await hooks.dump());
    expect(s.map((u) => [u.email, u.full_name])).toEqual([["galym.aliev@mock.test", "Әлиев Ғалым"]]);
  });

  test("R70-3: сол email қайта — қате, /login-да қалады, пайдаланушы саны өзгермейді", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]) });
    await register(page, { ...VALID, email: "S1@mock.test" });
    await expect(page.getByRole("status")).not.toHaveText("");
    await expect(page.locator(".msg.err")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    expect(students(await hooks.dump())).toHaveLength(1);
  });

  test("R70-4: 7 таңбалы құпия сөз — өріс белгіленіп, фокус алады, ештеңе сақталмайды", async ({ page, hooks }) => {
    await register(page, { ...VALID, password: "1234567" });
    const pw = page.getByLabel("Құпия сөз");
    await expect(pw).toHaveAttribute("aria-invalid", "true");
    await expect(pw).toBeFocused();
    await expect(page.locator(".msg.err")).toBeVisible();
    expect(students(await hooks.dump())).toHaveLength(0);
  });

  test("R70-5: нүктесіз домен (a@b) және курс таңдалмаса — бас тартады", async ({ page, hooks }) => {
    await register(page, { ...VALID, email: "a@b" });
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await register(page, { ...VALID, course: undefined });
    await expect(page.getByLabel("Курс")).toHaveAttribute("aria-invalid", "true");
    expect(students(await hooks.dump())).toHaveLength(0);
  });

  test("R70-6: телефонды тергенде пішімделген көрінісі шығады", async ({ page }) => {
    await page.goto("/login?tab=register");
    await page.getByLabel("Телефон").fill("87010000001");
    await expect(page.locator(".field", { has: page.getByLabel("Телефон") }).locator(".hint")).toContainText("701");
  });

  test("R70-7: 375 px — көлденең айналым жоқ, батырма көрінеді", async ({ page }) => {
    await page.goto("/login?tab=register");
    await expectNoHorizontalScroll(page);
    await expect(page.getByRole("button", { name: "Тіркелу", exact: true })).toBeVisible();
  });
});
