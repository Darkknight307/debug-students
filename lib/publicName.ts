/**
 * Көпшілікке көрсетілетін аты: тек «Тегі Аты» (әкесінің аты жазылмайды).
 * Басты беттегі қатысушылар тізімінде қолданылады.
 */
export function publicName(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return parts.slice(0, 2).join(" ") || "Аты көрсетілмеген";
}
