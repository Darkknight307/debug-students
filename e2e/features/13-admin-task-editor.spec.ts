import { test, expect, contest, users, adminLogin, ID } from "../fixtures";
import type { Locator, Page } from "@playwright/test";

// #81 — тапсырма редакторы: Trace тапсырмасы (сурет жүктеу), Debug тапсырмасы (эталон Python-да есептеледі), тексерістер, өңдеу, өшіру.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const section = (page: Page, title: string) => page.locator("section", { has: page.getByRole("heading", { name: title }) });
const editor = (page: Page) => page.locator("form", { has: page.getByPlaceholder("Тізімдегі ең үлкен сан") });
const field = (form: Locator, label: string) => form.locator(".field", { hasText: label });
async function openNew(page: Page, round: string) {
  await section(page, round).getByRole("button", { name: "+ тапсырма" }).click();
  await expect(editor(page)).toBeVisible();
  return editor(page);
}
async function fillTrace(form: Locator, title: string, options: string[], correct?: number) {
  await form.getByPlaceholder("Тізімдегі ең үлкен сан").fill(title);
  await form.locator("textarea").first().fill("```python\nprint(max([3, 9, 4]))\n```");
  for (let i = 0; i < options.length; i++) await form.getByPlaceholder(`${"abcd"[i]} нұсқасы`).fill(options[i]);
  if (correct !== undefined) await form.locator('input[type="radio"][name="correct"]').nth(correct).check();
}
const taskTitles = async (hooks: { dump(): Promise<Record<string, Record<string, unknown>[]>> }) => (await hooks.dump()).tasks.map((t) => t.title as string).sort();

test.describe("Тапсырма редакторы (#81)", () => {
  test.beforeEach(async ({ page, hooks }) => {
    await hooks.seed({ users: users([], true), ...contest({ status: "draft" }) });
    await adminLogin(page);
    await page.goto(`/admin/c/${ID.contest}`);
    await expect(page.getByRole("heading", { name: "Тест жарысы" })).toBeVisible();
  });

  test("TE81-1, TE81-2: Trace тапсырмасы суретімен сақталады; сурет 200 image/png; сурет емес файл қабылданбайды", async ({ page, hooks }) => {
    const form = await openNew(page, "Trace — кодты оқу");
    await fillTrace(form, "Ең үлкен сан", ["9", "3", "4", "16"], 0);
    await form.locator('input[type="file"]').setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(form.getByText("! тек сурет файлы")).toBeVisible();
    await form.locator('input[type="file"]').setInputFiles({ name: "code.png", mimeType: "image/png", buffer: PNG });
    await expect(form.locator("img")).toBeVisible();
    await form.getByRole("button", { name: "Сақтау" }).click();
    await expect(editor(page)).toHaveCount(0);

    const row = section(page, "Trace — кодты оқу").locator(".card", { hasText: "Ең үлкен сан" });
    await expect(row).toContainText("дұрыс жауап: a");
    await expect(row).toContainText("сурет");
    const saved = (await hooks.dump()).tasks.find((t) => t.title === "Ең үлкен сан")!;
    expect(saved.image_url).toMatch(/^\/api\/images\/[0-9a-f-]{36}$/);
    const img = await page.request.get(saved.image_url as string);
    expect(img.status()).toBe(200);
    expect(img.headers()["content-type"]).toBe("image/png");
  });

  test("TE81-3: дұрыс жауапсыз және бір ғана нұсқамен сақталмайды", async ({ page, hooks }) => {
    const before = await taskTitles(hooks);
    const form = await openNew(page, "Trace — кодты оқу");
    await fillTrace(form, "Жауапсыз сұрақ", ["1", "2"], 2); // белгіленгені — бос «c» нұсқасы
    await form.getByRole("button", { name: "Сақтау" }).click();
    await expect(form.getByText("! дұрыс жауапты белгілеңіз (бос емес нұсқа)")).toBeVisible();
    await form.getByPlaceholder("b нұсқасы").fill("");
    await form.getByRole("button", { name: "Сақтау" }).click();
    await expect(form.getByText("! кемінде екі жауап нұсқасы керек")).toBeVisible();
    expect(await taskTitles(hooks)).toEqual(before);
  });

  test("TE81-4: Debug тапсырмасы — эталон қатесі бар кодпен бірдей болса сақталмайды; дұрысы Python-да есептеліп сақталады", async ({ page, hooks }) => {
    const form = await openNew(page, "Debug — қатені түзет");
    const buggy = "def total(a):\n    s = 1\n    for x in a:\n        s += x\n    return s\n";
    await form.getByPlaceholder("Тізімдегі ең үлкен сан").fill("Қосынды қатесі");
    await field(form, "Қатесі бар код").locator("textarea").fill(buggy);
    await field(form, "Эталон шешім").locator("textarea").fill(buggy);
    await field(form, "Функция аты").locator("input").fill("total");
    await field(form, "Жасырын тесттер").locator("textarea").fill("[[1, 2]]\n[[]]\n[[5, 5]]");
    await form.getByRole("button", { name: "Сақтау" }).click();
    await expect(form.getByText("! эталон шешім қатесі бар кодтан айырмашылығы жоқ")).toBeVisible();

    await field(form, "Эталон шешім").locator("textarea").fill(buggy.replace("s = 1", "s = 0"));
    await form.getByRole("button", { name: "Сақтау" }).click();
    await expect(editor(page)).toHaveCount(0, { timeout: 90_000 });
    const row = section(page, "Debug — қатені түзет").locator(".card", { hasText: "Қосынды қатесі" });
    await expect(row).toContainText("total() · 0 ашық + 3 жасырын тест");
    const saved = (await hooks.dump()).tasks.find((t) => t.title === "Қосынды қатесі")!;
    expect(saved.tests_hidden).toEqual([{ args: [[1, 2]], expected: "3" }, { args: [[]], expected: "0" }, { args: [[5, 5]], expected: "10" }]);
  });

  test("TE81-5: атауын өңдеу сақталады; өшіру тізімнен де, дерекқордан да алып тастайды", async ({ page, hooks }) => {
    const trace = section(page, "Trace — кодты оқу");
    await trace.locator(".card", { hasText: "Тізім ұзындығы" }).getByRole("button", { name: "өңдеу" }).click();
    await editor(page).getByPlaceholder("Тізімдегі ең үлкен сан").fill("Тізім ұзындығы (өңделді)");
    await editor(page).getByRole("button", { name: "Сақтау" }).click();
    await expect(trace.locator(".card", { hasText: "Тізім ұзындығы (өңделді)" })).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await trace.locator(".card", { hasText: "Тізім ұзындығы (өңделді)" }).getByRole("button", { name: "өшіру" }).click();
    await expect(trace.locator(".card", { hasText: "Тізім ұзындығы" })).toHaveCount(0);
    expect(await taskTitles(hooks)).not.toContain("Тізім ұзындығы (өңделді)");
  });
});
