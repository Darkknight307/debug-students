/**
 * Маршрут қатесі: статус + студентке/әкімшіге көрсетілетін хабар. Импортсыз бөлек модуль — Next.js-сіз жұмыс
 * істейтін код (seed, Docker-дегі бумаланған скрипттер) оны next/server-ді тартпай қолдана алады (#85).
 */
export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}
