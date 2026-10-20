import { NextResponse, type NextRequest } from "next/server";
import { getStore, type TableName } from "../../../../lib/server/store";
import { hashPassword } from "../../../../lib/server/password";
import { outbox } from "../../../../lib/server/mailer";
import { afterWrite } from "../../../../lib/server/admin";
import { forgetUser } from "../../../../lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Тек e2e тесттер үшін (E2E_TEST_HOOKS=1). Әйтпесе — 404, маршрут жоқ сияқты.
 *   POST reset | seed {table: rows} | patch {table, id, set};  GET dump | outbox
 * seed-те users жолдары `password` берсе, ол scrypt-пен хэштеледі.
 */
const off = () => process.env.E2E_TEST_HOOKS !== "1";
const nf = () => new NextResponse("Not found", { status: 404 });

export async function GET(_req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  if (off()) return nf();
  const { action } = await ctx.params;
  if (action === "dump") return NextResponse.json(await getStore().dump());
  if (action === "outbox") return NextResponse.json(outbox());
  return nf();
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  if (off()) return nf();
  const { action } = await ctx.params;
  const store = getStore();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (action === "reset") {
    await store.reset();
    outbox().length = 0;
  } else if (action === "seed") {
    const data = b as Record<TableName, Record<string, unknown>[]>;
    if (data.users) {
      data.users = await Promise.all(
        data.users.map(async ({ password, ...u }) => ({
          role: "student", last_name: "", first_name: "", university: "Мок университеті", course: null, phone: null,
          first_login_at: new Date().toISOString(), last_login_at: new Date().toISOString(),
          ...u, password_hash: await hashPassword(String(password ?? "fixture-pass")),
        })),
      );
    }
    await store.seed(data);
  } else if (action === "patch") {
    await store.patch(b.table as TableName, String(b.id), b.set as Record<string, unknown>);
  } else return nf();
  afterWrite();
  forgetUser();
  return NextResponse.json({ ok: true });
}
