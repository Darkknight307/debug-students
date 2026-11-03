import { test, expect, users, loginAs, ADMIN, S1 } from "../fixtures";
import type { Page } from "@playwright/test";

// #79 — әкімші панеліне тек әкімші кіреді: кіру формасы, қате құпия сөз, студент сессиясы, шығу.
async function adminForm(page: Page, password: string) {
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Құпия сөз").fill(password);
  await page.getByRole("button", { name: "Кіру" }).click();
}

test.describe("Әкімшінің кіруі және қорғауы (#79)", () => {
  test("AA79-1: кірмеген адам /admin → «Панельге кіру»", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Панельге кіру" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Құпия сөз")).toBeVisible();
  });

  test("AA79-2: қате құпия сөз — қате хабары, форма орнында", async ({ page, hooks }) => {
    await hooks.seed({ users: users([], true) });
    await page.goto("/admin");
    await adminForm(page, "wrong-admin-pass");
    await expect(page.locator(".msg.err")).toHaveText(/^! /);
    await expect(page.getByRole("heading", { name: "Панельге кіру" })).toBeVisible();
  });

  test("AA79-3: студент сессиясы әкімші панелін ашпайды, API 401/403", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1], true) });
    await loginAs(page, S1.email);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Панельге кіру" })).toBeVisible();
    expect([401, 403]).toContain((await page.request.get("/api/admin/contests")).status());
  });

  test("AA79-4, AA79-5: әкімші кіреді, «Жаңа жарыс» көрінеді; шыққан соң форма қайтады, API 401", async ({ page, hooks }) => {
    await hooks.seed({ users: users([], true) });
    await page.goto("/admin");
    await adminForm(page, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Жарыстар" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Жаңа жарыс" })).toBeVisible();
    expect((await page.request.get("/api/admin/contests")).status()).toBe(200);

    await page.getByRole("button", { name: "Шығу" }).click();
    await expect(page.getByRole("heading", { name: "Панельге кіру" })).toBeVisible();
    expect((await page.request.get("/api/admin/contests")).status()).toBe(401);
  });
});
