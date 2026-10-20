/**
 * Әрекеттер санағышы (жады ішінде).
 * Serverless-те әр инстанстың өз санағышы бар — бұл толық қорғаныс емес,
 * бірақ біздің серверді Supabase Auth-қа пароль іріктейтін не хат шашатын құралға айналдырмайды.
 * Кіруде тек СӘТСІЗ әрекеттер саналады: 500 студент бір мезетте дұрыс кірсе, ешкім бұғатталмайды.
 * Тіркелу, хатты қайта жіберу, «ұмыттым» — әр әрекет саналады (`hit`).
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function tooManyFailures(key: string, limit: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  return !!b && b.resetAt > now && b.count >= limit;
}

export function recordFailure(key: string, windowMs: number, now = Date.now()): void {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + windowMs });
  else b.count++;
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
}

export function clearFailures(key: string): void {
  buckets.delete(key);
}

/** Әр әрекетті санайды: шекке жетсе true (бұл әрекет саналмайды), әйтпесе санап, false қайтарады. */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (tooManyFailures(key, limit, now)) return true;
  recordFailure(key, windowMs, now);
  return false;
}
