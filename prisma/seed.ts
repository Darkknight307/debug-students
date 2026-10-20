/**
 * Жаңа дерекқорға: әкімші (ADMIN_EMAIL / ADMIN_PASSWORD) және «DEBUG · Студенттер» жарысы Қазан тапсырмаларымен
 * (10 Trace, 4 Debug, 2 Build, әр кезең 20 мин, бір аптадан кейін 15:00 KZ). Қайта іске қосу қауіпсіз.
 * Іске қосу: npm run db:seed
 */
import { readFileSync } from "node:fs";
import { getStore } from "../lib/server/store";
import { bootstrapAdmin } from "../lib/server/admin";
import type { AdminTask, Kind } from "../lib/client/types";

type SeedTask = Omit<AdminTask, "id" | "round_id"> & { kind: Kind };

async function main() {
  const store = getStore();
  await bootstrapAdmin(store);
  console.log(process.env.ADMIN_EMAIL ? `admin: ${process.env.ADMIN_EMAIL}` : "ADMIN_EMAIL берілмеген — әкімші құрылмады");

  if ((await store.listContests()).some((c) => c.slug === "students-1")) return console.log("students-1 бұрыннан бар — өткізілді");
  const day = new Date();
  day.setUTCHours(10, 0, 0, 0); // 15:00 Қазақстан уақыты = 10:00 UTC
  day.setUTCDate(day.getUTCDate() + 7);
  const contest = await store.createContest(
    { slug: "students-1", title: "DEBUG · Студенттер", starts_at: day.toISOString(), status: "published", board_locked: false, board_autolock_min: 10 },
    (["mcq", "debug", "code"] as Kind[]).map((kind, i) => ({
      idx: i + 1, kind, title: ["Trace — кодты оқу", "Debug — қатені түзет", "Build — өзің жаз"][i], duration_min: 20, status: "pending" as const, started_at: null, ends_at: null,
    })),
  );
  const rounds = await store.listRounds(contest.id);
  const tasks = JSON.parse(readFileSync(new URL("./seed-data/october-tasks.json", import.meta.url), "utf8")) as SeedTask[];
  for (const { kind, ...t } of tasks) await store.createTask({ ...t, round_id: rounds.find((r) => r.kind === kind)!.id, forbidden: t.forbidden ?? [], ai_refs: t.ai_refs ?? [] });
  console.log(`«${contest.title}» құрылды: ${tasks.length} тапсырма`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
