/** @type {import('next').NextConfig} */
const nextConfig = {
  // Үй қалтасында бөгде package-lock.json бар — түбірді нақты көрсетеміз
  outputFileTracingRoot: import.meta.dirname,
  // Vercel демосы: seed-телген SQLite үлгісі әр функцияның бумасына кіреді (lib/server/store/index.ts → /tmp-ға көшіріледі)
  outputFileTracingIncludes: { "/**": ["./prisma/demo.db"] },
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
