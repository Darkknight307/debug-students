import { test, expect, contest, users, loginAs, running, S1 } from "../fixtures";

// Стек деңгейі (#56, интеграция): бір контейнер — статика + API + Postgres, жауап кілттері студентке шықпайды.
test.describe("Docker стегі: бір контейнер, Postgres, денсаулық", () => {
  test("P56-3a: /api/health — дерекқор қосулы, бейне нұсқасы бар", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBe(200);
    expect(r.headers()["cache-control"]).toContain("no-store");
    const body = await r.json();
    expect(body).toMatchObject({ ok: true, db: "up" });
    expect(typeof body.version).toBe("string");
  });

  test("P56-3b: бір контейнер статиканы да береді: беттер, Next чанктары, шрифт, Pyodide worker", async ({ request }) => {
    for (const p of ["/", "/board", "/login"]) {
      const r = await request.get(p);
      expect(r.status(), p).toBe(200);
      expect(r.headers()["content-type"], p).toContain("text/html");
    }
    const html = await (await request.get("/login")).text();
    const chunk = html.match(/\/_next\/static\/[^"']+\.js/)?.[0];
    expect(chunk, "Next.js чанкы табылды").toBeTruthy();
    expect((await request.get(chunk!)).status()).toBe(200);
    const font = await request.get("/fonts/ibm-plex-sans-latin-400.woff2");
    expect(font.status()).toBe(200);
    expect(font.headers()["cache-control"]).toContain("immutable");
    const worker = await request.get("/pyodide-worker.js");
    expect(worker.status()).toBe(200);
    expect(await worker.text()).toContain("pyodide");
  });

  test("P56-3c: тіркелу → /api/auth/me → жазба Postgres-те (dump)", async ({ request, hooks }) => {
    const reg = await request.post("/api/auth/register", {
      data: { lastName: "Стектов", firstName: "Әлібек", university: "Мок университеті", course: "1 курс", phone: "", email: "Stack1@Mock.Test", password: "fixture-pass-1" },
    });
    expect(reg.status()).toBe(200);
    const me = await (await request.get("/api/auth/me")).json();
    expect(me).toMatchObject({ loggedIn: true, name: "Стектов Әлібек" });
    const dump = await hooks.dump();
    expect(dump.users.map((u) => u.email)).toEqual(["stack1@mock.test"]);
    expect(JSON.stringify(dump.users)).not.toContain("password_hash");
  });

  test("P56-3d: студенттің күй жауабында жауап кілттері жоқ", async ({ page, hooks }) => {
    await hooks.seed({ users: users([S1]), ...contest({ startsIn: -60_000, r1: running() }) });
    await loginAs(page, S1.email);
    const r = await page.request.get("/api/contest/state?full=1");
    expect(r.status()).toBe(200);
    const text = await r.text();
    expect(text).toContain('"kind":"mcq"');
    expect(text).not.toMatch(/"correct"|SECRET_SOLUTION|tests_hidden|solution_code/);
  });
});
