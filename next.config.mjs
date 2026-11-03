/** @type {import('next').NextConfig} */
const nextConfig = {
  // Үй қалтасында бөгде package-lock.json бар — түбірді нақты көрсетеміз
  outputFileTracingRoot: import.meta.dirname,
  // Docker бейнесі (#64): бір Node процесі — standalone сервер. Vercel құрастыруы бұрынғыдай (айнымалы тек Dockerfile-да)
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? {
        output: "standalone",
        // Бейнеге runtime-да керек емес файлдар кірмейді: next/image қолданылмайды (sharp), тип тексеру — тек құрастыруда
        outputFileTracingExcludes: { "*": ["node_modules/sharp/**", "node_modules/@img/**", "node_modules/typescript/**"] },
      }
    : {}),
  // E2E тесті өз build қалтасын қолданады — қатар жүрген dev-сервердің .next-ін бұзбасын
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Лендинг пен лидерборд әзірге статикалық HTML күйінде қалады (public/).
  // URL-дер өзгермеуі үшін rewrite жасаймыз. Кейін оларға динамикалық дерек
  // (кіру күйі, ағымдағы жарыс) керек болғанда React компоненттеріне көшіреміз.
  // Шрифт пен Trace суреттерінің аты нұсқасын/хэшін қамтиды — ұзақ кэштеуге болады
  async headers() {
    const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
    return [
      { source: "/fonts/:file*", headers: immutable },
      { source: "/t/:file*", headers: immutable },
    ];
  },
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      { source: "/board", destination: "/board.html" },
    ];
  },
};
export default nextConfig;
