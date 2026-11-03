import { test, expect, contest, users, loginAs, closed, running, editorText, expectNoHorizontalScroll, S1, ID } from "../fixtures";
import type { Page } from "@playwright/test";

// #76 — Debug: бастапқы код, «бір жол» ережесі, браузердегі Python (Pyodide), жасырын тесттер, көшіру-қою бұғаты.
const desktopOnly = () => test.skip(test.info().project.name === "mobile", "Python мен теру — тек desktop-та; телефонда тек бет пішімі (D76-6)");

async function open(page: Page, hooks: { seed(d: Record<string, unknown[]>): Promise<void> }) {
  await hooks.seed({ users: users([S1]), ...contest({ startsIn: -3_600_000, r1: closed(), r2: running() }) });
  await loginAs(page, S1.email);
  await page.goto("/contest");
  await expect(page.locator(".cm-content")).toBeVisible();
}
/** Жолдың соңына барып, соңғы n таңбаны өшіреді. */
async function trimLine(page: Page, hasText: string, n: number) {
  await page.locator(".cm-line", { hasText }).click();
  await page.keyboard.press("End");
  for (let i = 0; i < n; i++) await page.keyboard.press("Backspace");
}
const pythonReady = (page: Page) => expect(page.locator(".qcount.py")).toHaveText("Python дайын", { timeout: 90_000 });
const subs = async (hooks: { dump(): Promise<Record<string, Record<string, unknown>[]>> }) => (await hooks.dump()).submissions;

test.describe("Debug кезеңі (#76)", () => {
  test("D76-1…D76-3: бастапқы код → бір жолды түзету → ашық мысал өтеді → «✓ Дұрыс»", async ({ page, hooks }) => {
    desktopOnly();
    await open(page, hooks);
    expect(await editorText(page)).toContain("return s + 1");
    await expect(page.getByText("тек 1 жолды өзгертуге болады")).toBeVisible();
    await expect(page.locator(".counter")).toHaveText("өзгерген жол: 0 / 1");

    await trimLine(page, "return s + 1", 4);
    expect(await editorText(page)).toContain("    return s\n");
    await expect(page.locator(".counter")).toHaveText("өзгерген жол: 1 / 1");
    await pythonReady(page);
    await page.getByRole("button", { name: "Тексеру" }).click();
    await expect(page.getByText("ашық мысалдар · 1/1 өтті")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Жіберу" }).click();
    await expect(page.getByText("✓ Дұрыс")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("3 ұпай есептелді")).toBeVisible();
    await expect(page.locator(".qchip.ok")).toHaveCount(1);
    expect((await subs(hooks)).map((s) => [s.task_id, s.is_correct])).toEqual([[ID.d11, true]]);
  });

  test("D76-4: екі жол өзгерсе — ереже хабары, ештеңе сақталмайды", async ({ page, hooks }) => {
    desktopOnly();
    await open(page, hooks);
    await trimLine(page, "return s + 1", 4);
    await trimLine(page, "s = 0", 1);
    await page.keyboard.insertText("1");
    await expect(page.locator(".counter")).toHaveText("өзгерген жол: 2 / 1");
    await page.getByRole("button", { name: "Жіберу" }).click();
    await expect(page.getByText("Тек 1 жолды өзгертуге болады — сіз 2 жолды өзгерттіңіз")).toBeVisible();
    expect(await subs(hooks)).toHaveLength(0);
  });

  test("D76-5: редакторға қою бұғатталады, код өзгермейді, ескерту жанады", async ({ page, hooks }) => {
    desktopOnly();
    await open(page, hooks);
    const before = await editorText(page);
    await page.locator(".cm-content").evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "def f(a):\n    return sum(a)\n");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(page.locator(".clip-note")).toHaveClass(/hit/);
    expect(await editorText(page)).toBe(before);
  });

  test("D76-6: 375 px — көлденең айналым жоқ, редактор мен батырмалар көрінеді", async ({ page, hooks }) => {
    await open(page, hooks);
    await expectNoHorizontalScroll(page);
    await expect(page.locator(".cm-editor")).toBeVisible();
    for (const name of ["Тексеру", "Жіберу"]) await expect(page.getByRole("button", { name })).toBeVisible();
  });
});
