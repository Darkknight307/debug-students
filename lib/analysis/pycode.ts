/**
 * Python кодын талдауға арналған жеңіл құралдар (браузерде де, тестте де жұмыс істейді).
 *
 * Мақсаты — екі оқушының кодын айнымалы атауларына, бос орындарға және түсініктемелерге
 * тәуелсіз салыстыру. Толық Python парсері емес: жарыстағы қысқа функцияларға жетеді.
 */

const KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
  "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
  "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

/** Кіріктірілген атаулар айнымалы емес — олар сол күйі қалады (len мен max-ты шатастырмау үшін). */
const BUILTINS = new Set([
  "abs", "all", "any", "bool", "chr", "dict", "divmod", "enumerate", "filter", "float", "frozenset", "input", "int",
  "isinstance", "len", "list", "map", "max", "min", "ord", "pow", "print", "range", "reversed", "round", "set",
  "sorted", "str", "sum", "tuple", "type", "zip",
]);

const OPERATORS = [
  "**=", "//=", ">>=", "<<=", "...", "!=", "==", "<=", ">=", "->", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
  "**", "//", "<<", ">>", ":=",
];

export type Token = { t: "name" | "kw" | "num" | "str" | "op" | "nl" | "indent" | "dedent"; v: string; attr?: boolean; fstr?: boolean };

/** Кодты таңбаларға бөледі. Түсініктемелер мен бос жолдар түспейді. */
export function tokenize(code: string): { tokens: Token[]; commentLines: number } {
  const src = code.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  const tokens: Token[] = [];
  const indents = [0];
  let i = 0, depth = 0, lineStart = true, commentLines = 0;
  const n = src.length;
  const isIdStart = (c: string) => /[\p{L}_]/u.test(c);
  const isId = (c: string) => /[\p{L}\p{N}_]/u.test(c);

  while (i < n) {
    if (lineStart && depth === 0) {
      // Жол басы: шегіністі өлшейміз; бос жол мен тек түсініктемесі бар жол есепке алынбайды
      let j = i, col = 0;
      while (j < n && src[j] === " ") { j++; col++; }
      if (j >= n) break;
      if (src[j] === "\n") { i = j + 1; continue; }
      if (src[j] === "#") {
        commentLines++;
        while (j < n && src[j] !== "\n") j++;
        i = j + 1;
        continue;
      }
      if (col > indents[indents.length - 1]) {
        indents.push(col);
        tokens.push({ t: "indent", v: "IND" });
      } else {
        while (col < indents[indents.length - 1]) {
          indents.pop();
          tokens.push({ t: "dedent", v: "DED" });
        }
      }
      i = j;
      lineStart = false;
    }

    const c = src[i];
    if (c === "\n") {
      if (depth === 0) {
        if (tokens.length && tokens[tokens.length - 1].t !== "nl") tokens.push({ t: "nl", v: "NL" });
        lineStart = true;
      }
      i++;
      continue;
    }
    if (c === " ") { i++; continue; }
    if (c === "\\" && src[i + 1] === "\n") { i += 2; continue; }
    if (c === "#") {
      commentLines++;
      while (i < n && src[i] !== "\n") i++;
      continue;
    }

    // Жол литералы (префикстерімен, үштік тырнақшамен)
    const sm = /^([rRbBuUfF]{0,2})("""|'''|"|')/.exec(src.slice(i, i + 5));
    if (sm && (sm[1] === "" || !isId(src[i - 1] ?? " "))) {
      const quote = sm[2];
      let j = i + sm[0].length;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src.startsWith(quote, j)) { j += quote.length; break; }
        if (quote.length === 1 && src[j] === "\n") break;
        j++;
      }
      tokens.push({ t: "str", v: src.slice(i + sm[0].length, Math.max(i + sm[0].length, j - quote.length)), fstr: /f/i.test(sm[1]) });
      i = j;
      continue;
    }

    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isId(src[j])) j++;
      const word = src.slice(i, j);
      const prev = tokens[tokens.length - 1];
      tokens.push({ t: KEYWORDS.has(word) ? "kw" : "name", v: word, attr: prev?.t === "op" && prev.v === "." });
      i = j;
      continue;
    }

    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < n && /[0-9a-zA-Z_.]/.test(src[j])) j++;
      tokens.push({ t: "num", v: src.slice(i, j) });
      i = j;
      continue;
    }

    const op = OPERATORS.find((o) => src.startsWith(o, i)) ?? c;
    if ("([{".includes(op)) depth++;
    if (")]}".includes(op)) depth = Math.max(0, depth - 1);
    tokens.push({ t: "op", v: op });
    i += op.length;
  }
  // Соңғы жолдың аяғында «\n» бар-жоғына қарамастан кілт бірдей болуы керек
  if (tokens.length && tokens[tokens.length - 1].t !== "nl") tokens.push({ t: "nl", v: "NL" });
  while (indents.length > 1) {
    indents.pop();
    tokens.push({ t: "dedent", v: "DED" });
  }
  return { tokens, commentLines };
}

/**
 * Құрылым кілті: айнымалы атаулары пайда болу ретімен v0, v1, … деп алмастырылады,
 * жол литералдары STR болады. Екі кодтың кілті тең болса — олар тек атауларымен ерекшеленеді.
 */
export function structureTokens(tokens: Token[]): string[] {
  const names = new Map<string, string>();
  return tokens.map((k) => {
    if (k.t === "str") return "STR";
    if (k.t !== "name" || k.attr || BUILTINS.has(k.v)) return k.v;
    if (!names.has(k.v)) names.set(k.v, "v" + names.size);
    return names.get(k.v)!;
  });
}

/** Дәл кілт: атаулар да сақталады (бос орын мен түсініктеме ғана еленбейді). */
export function exactTokens(tokens: Token[]): string[] {
  return tokens.map((k) => (k.t === "str" ? `"${k.v}"` : k.v));
}

/** Екі таңба тізбегінің ұқсастығы: 2·LCS / (|a| + |b|). 1 = бірдей. */
export function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  if (a.length > b.length) [a, b] = [b, a];
  // Ұзындығы тым әртүрлі болса, жоғары ұқсастық мүмкін емес — есептемей-ақ шығамыз
  const upper = (2 * a.length) / (a.length + b.length);
  if (upper < 0.5) return upper;
  let prev = new Uint16Array(a.length + 1), cur = new Uint16Array(a.length + 1);
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      cur[i] = a[i - 1] === b[j - 1] ? prev[i - 1] + 1 : Math.max(prev[i], cur[i - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return (2 * prev[a.length]) / (a.length + b.length);
}

/* ---------------- қолданылған құрылымдар ---------------- */

export type FeatureId =
  | "dictset" | "compact" | "helpers" | "idioms" | "tryexcept" | "classes" | "import" | "recursion" | "aiextras";

export const FEATURE_LABEL: Record<FeatureId, string> = {
  dictset: "сөздік не жиын (dict, set)",
  compact: "list comprehension, lambda не үштік оператор",
  helpers: "f-string, join, enumerate, zip",
  idioms: "«if not s», теріс индекс не кесінді",
  tryexcept: "try / except",
  classes: "класс",
  import: "import",
  recursion: "рекурсия",
  aiextras: "docstring не тип аннотациясы",
};

/** Кодта қандай құрылымдар кездесетінін анықтайды. */
export function detectFeatures(tokens: Token[]): FeatureId[] {
  const found = new Set<FeatureId>();
  const names = new Set(tokens.filter((k) => k.t === "name" && !k.attr).map((k) => k.v));
  const attrs = new Set(tokens.filter((k) => k.attr).map((k) => k.v));
  const kws = new Set(tokens.filter((k) => k.t === "kw").map((k) => k.v));

  if (tokens.some((k) => k.t === "op" && k.v === "{")) found.add("dictset");
  if (["dict", "set", "frozenset", "defaultdict", "Counter", "OrderedDict"].some((x) => names.has(x))) found.add("dictset");
  if (["items", "keys", "values", "setdefault"].some((x) => attrs.has(x))) found.add("dictset");

  if (kws.has("lambda")) found.add("compact");
  let depth = 0;
  tokens.forEach((k, i) => {
    if (k.t === "op" && "([{".includes(k.v)) depth++;
    if (k.t === "op" && ")]}".includes(k.v)) depth = Math.max(0, depth - 1);
    if (k.t === "kw" && k.v === "for" && depth > 0) found.add("compact"); // жақша ішіндегі for — comprehension
    if (k.t === "kw" && k.v === "else" && !(tokens[i + 1]?.t === "op" && tokens[i + 1].v === ":")) found.add("compact"); // a if b else c
    if (k.t === "kw" && k.v === "not" && tokens[i - 1]?.v === "if" && tokens[i + 1]?.t === "name" && tokens[i + 2]?.v === ":") found.add("idioms");
    if (k.t === "op" && k.v === "[" && tokens[i + 1]?.v === "-" && tokens[i + 2]?.t === "num" && tokens[i + 3]?.v === "]") found.add("idioms");
    if (k.t === "op" && k.v === "->") found.add("aiextras");
    // def f(...): келесі логикалық жол бірден жол литералы болса — docstring
    if (k.t === "indent" && tokens[i + 1]?.t === "str" && tokens[i + 2]?.t === "nl" && tokens[i - 1]?.t === "nl") {
      let j = i - 2;
      while (j >= 0 && tokens[j].t !== "nl") j--;
      if (tokens[j + 1]?.v === "def") found.add("aiextras");
    }
  });
  // Кесінді: [ ... : ... ] — сөздік литералынан тыс жерде
  let br = 0, brace = 0;
  for (const k of tokens) {
    if (k.t !== "op") continue;
    if (k.v === "{") brace++;
    if (k.v === "}") brace = Math.max(0, brace - 1);
    if (k.v === "[") br++;
    if (k.v === "]") br = Math.max(0, br - 1);
    if (k.v === ":" && br > 0 && brace === 0) found.add("idioms");
  }

  if (tokens.some((k) => k.fstr)) found.add("helpers");
  if (attrs.has("join") || ["enumerate", "zip"].some((x) => names.has(x))) found.add("helpers");
  if (kws.has("try") || kws.has("except")) found.add("tryexcept");
  if (kws.has("class")) found.add("classes");
  if (kws.has("import")) found.add("import");

  // Рекурсия: функция өз атын денесінде шақырады
  const defIdx = tokens.findIndex((k) => k.t === "kw" && k.v === "def");
  const fn = defIdx >= 0 ? tokens[defIdx + 1]?.v : null;
  if (fn && tokens.some((k, i) => i > defIdx + 1 && k.t === "name" && k.v === fn && tokens[i + 1]?.v === "(")) found.add("recursion");

  return [...found];
}

/**
 * Оқушы шамамен қанша таңба терді: шегініс есептелмейді (редактор өзі қояды),
 * шаблонда дайын тұрған жолдар (def …, «# осында жаз») да есептелмейді.
 */
export function typedChars(code: string, starter: string | null): number {
  const given = new Set((starter ?? "").split("\n").map((l) => l.trim()).filter(Boolean));
  const lines = code.split("\n").map((l) => l.trim()).filter((l) => l && !given.has(l));
  return lines.reduce((sum, l) => sum + l.length + 1, 0);
}

/** Кез келген оқушы таңдай салатын жалпы атаулар: олардың сәйкес келуі көшіруді білдірмейді. */
const COMMON_NAMES = new Set([
  "a", "b", "c", "d", "e", "f", "i", "j", "k", "l", "m", "n", "p", "q", "r", "s", "t", "x", "y", "z",
  "res", "result", "results", "ans", "answer", "out", "output", "ret", "count", "cnt", "counter", "cur", "curr", "current",
  "prev", "last", "first", "next", "temp", "tmp", "num", "nums", "number", "ch", "char", "chars", "total", "summ", "best",
  "idx", "index", "length", "size", "flag", "found", "lst", "arr", "array", "word", "words", "line", "text", "string",
  "value", "val", "item", "elem", "el", "key", "left", "right", "start", "end", "maxi", "mini", "mx", "mn",
  "max_len", "current_len", "cur_len", "max_length", "current_length", "max_count", "current_count", "longest",
]);

/**
 * Кодтағы «ерекше» айнымалы атаулары: жалпы тізімде жоқ және 3 таңбадан ұзын.
 * Екі оқушының коды осындай атауларына дейін сәйкес келсе — бұл кездейсоқтыққа ұқсамайды.
 * Функция аты мен оның параметрлері есептелмейді (олар шаблонда берілген).
 */
export function distinctiveNames(tokens: Token[]): string[] {
  const given = new Set<string>();
  const def = tokens.findIndex((k) => k.t === "kw" && k.v === "def");
  if (def >= 0) {
    for (let i = def + 1; i < tokens.length && tokens[i].t !== "nl"; i++) if (tokens[i].t === "name") given.add(tokens[i].v);
  }
  const out = new Set<string>();
  for (const k of tokens) {
    if (k.t !== "name" || k.attr || BUILTINS.has(k.v) || given.has(k.v)) continue;
    if (k.v.length > 3 && !COMMON_NAMES.has(k.v.toLowerCase())) out.add(k.v);
  }
  return [...out];
}
