import { test, expect, contest, users, loginAs, closed, running, typeCode, editorText, expectNoHorizontalScroll, S1, ID, BUILD_STARTER } from "../fixtures";
import type { Page } from "@playwright/test";

// #77 — Build: функцияны өзі жазады; жасырын тесттер «дұрыс/қате» береді; тыйым салынған құрылым; браузердегі жоба.
const desktopOnly = () => test.skip(test.info().project.name === "mobile", "Python мен теру — тек desktop-та; телефонда тек бет пішімі (B77-6)");
const GOOD = "def g(a):\n    seen = []\n    for x in a:\n        if x not in seen:\n            seen.append(x)\n    return len(seen)\n";
const WRONG = "def g(a):\n    return len(a)\n";
const FORBIDDEN = "def g(a):\n    return len(set(a))\n";

async function open(page: Page, hooks: { seed(d: Record<string, unknown[]>): Promise<void> }) {
  await hooks.seed({ users: users([S1]), ...contest({ startsIn: -3_600_000, r1: closed(), r2: closed(), r3: running() }) });
  await loginAs(page, S1.email);
  await page.goto("/contest");
  await expect(page.locator(".cm-content")).toBeVisible();
}
async function submit(page: Page, code: string) {
  await typeCode(page, code);
  expect((await editorText(page)).trimEnd()).toBe(code.trimEnd());
  await expect(page.locator(".qcount.py")).toHaveText("Python дайын", { timeout: 90_000 });
  await page.getByRole("button", { name: "Жіберу" }).click();
}
const subs = async (hooks: { dump(): Promise<Record<string, Record<string, unknown>[]>> }) => (await hooks.dump()).submissions;

test.describe("Build кезеңі (#77)", () => {
  test("B77-1: шарт, функция аты және тыйым белгілері", async ({ page, hooks }) => {
    desktopOnly();
    await open(page, hooks);
    await expect(page.getByText("Тізімдегі әр түрлі мәндердің санын қайтар.")).toBeVisible();
    await expect(page.getByText("функция: g()")).toBeVisible();
    await expect(page.getByText("тыйым: set(")).toBeVisible();
  });

  test("B77-2: дұрыс шешім → «✓ Дұрыс», 4 ұпай, сақталды", async ({ page, hooks }) => {
    desktopOnly();
    await open(page, hooks);
    await submit(page, GOOD);
    await expect(page.getByText("✓ Дұрыс")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("4 ұпай есептелді")).toBeVisible();
    expect((await subs(hooks)).map((s) => [s.task_id, s.is_correct])).toEqual([[ID.b15, true]]);
  });

  test("B77-3: қате шешім → «✗ Қате», қате деп сақталды", async ({ page, hooks }) => {
    desktopOnly();
    await open(page, hooks);
    await submit(page, WRONG);
    await expect(page.getByText("✗ Қате")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Жасырын тесттердің кейбірі өтпеді")).toBeVisible();
    expect((await subs(hooks)).map((s) => [s.task_id, s.is_correct])).toEqual([[ID.b15, false]]);
  });

  test("B77-4: set( бар шешім — тыйым хабары, ештеңе сақталмайды", async ({ page, hooks }) => {
    desktopOnly();
    await open(page, hooks);
    await submit(page, FORBIDDEN);
    await expect(page.getByText("«set(» қолдануға болмайды")).toBeVisible();
    expect(await subs(hooks)).toHaveLength(0);
  });

  test("B77-5: терілген код қайта ашқанда қалады; «бастапқы код» шаблонды қайтарады", async ({ page, hooks }) => {
    desktopOnly();
    await open(page, hooks);
    await typeCode(page, WRONG);
    await page.reload();
    await expect.poll(async () => (await editorText(page)).trimEnd()).toBe(WRONG.trimEnd());
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "бастапқы код" }).click();
    await expect.poll(async () => (await editorText(page)).trimEnd()).toBe(BUILD_STARTER.trimEnd());
  });

  test("B77-6: 375 px — көлденең айналым жоқ", async ({ page, hooks }) => {
    await open(page, hooks);
    await expectNoHorizontalScroll(page);
    await expect(page.getByRole("button", { name: "Жіберу" })).toBeVisible();
  });
});
