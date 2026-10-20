/**
 * Хат жіберу интерфейсі. MVP-де — консольге жазатын мейлер (сілтеме сервер логында);
 * SMTP кейін (#48). E2E_TEST_HOOKS=1 болғанда хаттар outbox-та сақталады (/api/test-hooks/outbox).
 */
export type Mail = { to: string; subject: string; text: string; link?: string };

const g = globalThis as unknown as { __debugOutbox?: Mail[] };
export const outbox = (): Mail[] => (g.__debugOutbox ??= []);

export async function sendMail(mail: Mail): Promise<void> {
  if (process.env.E2E_TEST_HOOKS === "1") {
    outbox().push(mail);
    return;
  }
  // Email-дің өзі логқа толық жазылмайды
  const masked = mail.to.replace(/^(.{2}).*(@.*)$/, "$1•••$2");
  console.info(`[mail] ${masked}: ${mail.subject} — ${mail.link ?? ""}`);
}

/** «Ұмыттым» формасын көрсету: хат шынымен жететін болса (SMTP, #48) не әзірлеу/тест режимінде (консоль). */
export function emailsEnabled(): boolean {
  return process.env.AUTH_EMAILS_ENABLED === "1" || process.env.NODE_ENV !== "production";
}
