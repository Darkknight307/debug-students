-- ============================================================
-- DEBUG · СТУДЕНТТЕР — АЛҒАШҚЫ ЖАРЫСТЫҢ ТАПСЫРМАЛАРЫ (Қазан жарысының үлгісі)
-- 001 → 002 → 003 → 007-ден кейін. Supabase → SQL Editor → New query → осыны толық қойып, Run.
--
-- Тапсырмалар АҒЫМДАҒЫ жарысқа қосылады: «жүріп жатыр» күйіндегі, ол болмаса
-- ең жақын «жарияланды» күйіндегі жарыс (сайт та дәл сол жарысты көрсетеді).
-- Жарыс мүлде жоқ болса (жаңа дерекқор), «DEBUG · Студенттер» жарысы үш кезеңімен
-- өзі құрылады: «жарияланды» күйінде, басталуы — бір аптадан кейін 15:00 (Қазақстан уақыты).
-- Атауын, күнін, тапсырмаларын кейін әкімші панелінде өзгертесіз.
--   Trace  — 10 сұрақ (1 ұпайдан), бәріне бір нұсқа
--   Debug  — 4 тапсырма (3 ұпайдан), бір жолды түзету
--   Build  — 2 тапсырма (4 ұпайдан)
-- Үш кезеңнің де ұзақтығы 20 минутқа қойылады.
--
-- Қауіпсіздік: жарыста тапсырма бұрыннан бар болса, скрипт ештеңе өзгертпей тоқтайды.
-- ============================================================
do $oct$
declare c uuid; ctitle text; r1 uuid; r2 uuid; r3 uuid; n int;
begin
  select id, title into c, ctitle from contests
   where status in ('running', 'published')
   order by (status = 'running') desc, starts_at asc limit 1;
  if c is null then
    insert into contests (slug, title, starts_at, status)
    values ('students-1', 'DEBUG · Студенттер',
            -- 15:00 Қазақстан уақыты (UTC+5) = 10:00 UTC; tz базасының нұсқасына тәуелді болмау үшін UTC-мен есептейміз
            (date_trunc('day', now() at time zone 'UTC') + interval '7 days 10 hours') at time zone 'UTC',
            'published')
    returning id, title into c, ctitle;
    insert into rounds (contest_id, idx, kind, title, duration_min) values
      (c, 1, 'mcq',   'Trace — кодты оқу',    20),
      (c, 2, 'debug', 'Debug — қатені түзет', 20),
      (c, 3, 'code',  'Build — өзің жаз',     20);
    raise notice '«%» жарысы құрылды (жарияланды, бір аптадан кейін 15:00).', ctitle;
  end if;

  select id into r1 from rounds where contest_id = c and kind = 'mcq'   order by idx limit 1;
  select id into r2 from rounds where contest_id = c and kind = 'debug' order by idx limit 1;
  select id into r3 from rounds where contest_id = c and kind = 'code'  order by idx limit 1;
  if r1 is null or r2 is null or r3 is null then
    raise exception '«%» жарысында үш кезеңнің бірі жоқ (Trace/Debug/Build).', ctitle;
  end if;

  select count(*) into n from tasks where round_id in (r1, r2, r3);
  if n > 0 then
    raise exception '«%» жарысында % тапсырма бұрыннан бар — ештеңе өзгертілген жоқ. Оларды осы файлдағылармен ауыстыру үшін алдымен мынаны орындаңыз:  delete from tasks where round_id in (select id from rounds where contest_id = ''%'');', ctitle, n, c;
  end if;

  update rounds set duration_min = 20 where id in (r1, r2, r3);

  -- ---------- Trace: 10 сұрақ, бәріне бір нұсқа (variant = null) ----------
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 1, null, 'Кодтың қызметі', 'Төмендегі кодтың қызметі:', 1, '[{"key": "a", "text": "енгізілген санның барлық бөлгіштерінің қосындысы мен көбейтіндісін табады"}, {"key": "b", "text": "берілген аралықтағы ең кіші және ең үлкен жай сандарды анықтайды"}, {"key": "c", "text": "берілген аралықтағы ең кіші және үлкен сандарды анықтайды"}, {"key": "d", "text": "енгізілген санның 1 мен өзінен басқа ең үлкен және ең кіші бөлгіштерін табады"}]'::jsonb, 'd', '/t/b096819e46cc4b19.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 2, null, 'Цифрлармен жұмыс', 'n = 7649 мәнін бергендегі код нәтижесі:', 1, '[{"key": "a", "text": "san: 9 4 6 7"}, {"key": "b", "text": "san: 946"}, {"key": "c", "text": "san: 9467"}, {"key": "d", "text": "san: 26"}]'::jsonb, 'c', '/t/6ea16a28f6f090b8.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 3, null, 'Жылдар саны', 'Пайдаланушы x = 100, p = 20, y = 144 мәндерін енгізгендегі нәтиже:', 1, '[{"key": "a", "text": "sizge kerektisi 3 jyl"}, {"key": "b", "text": "sizge kerektisi 2 jyl"}, {"key": "c", "text": "sizge kerektisi 144 jyl"}, {"key": "d", "text": "sizge kerektisi 1 jyl"}]'::jsonb, 'b', '/t/2771bd0b2c00483f.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 4, null, 'Тізімді өзгерту', '5 10 1 2 3 10 -10 мәндерін бергендегі код нәтижесі:', 1, '[{"key": "a", "text": "A= [1, 2, 3, 10, -10]"}, {"key": "b", "text": "A= [10, -10, 1, 2, 3]"}, {"key": "c", "text": "A= [-10, 1, 2, 3, 10]"}, {"key": "d", "text": "A= [2, 3, 10, -10, 1]"}]'::jsonb, 'd', '/t/e6e93f7ba89e78df.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 5, null, 'Кодтың мақсаты', 'Кодтың мақсаты:', 1, '[{"key": "a", "text": "N санының жай сан екенін тексеру"}, {"key": "b", "text": "N санының барлық бөлгіштерін тауып, экранға шығару"}, {"key": "c", "text": "N санын 2-ге бөліп, жұп немесе тақ екенін анықтау"}, {"key": "d", "text": "N санына дейінгі барлық жай сандарды табу"}]'::jsonb, 'a', '/t/65f689e913647200.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 6, null, 'Көріну аймағы', 'Соңғы жолдың нәтижесі:', 1, '[{"key": "a", "text": "??? y = 12"}, {"key": "b", "text": "??? y = 9"}, {"key": "c", "text": "??? y = 5"}, {"key": "d", "text": "Қате шығады, y функция ішінде өзгертілді"}]'::jsonb, 'a', '/t/f986125bfa71cd27.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 7, null, 'Үш айнымалы', 'Код нәтижесі:', 1, '[{"key": "a", "text": "x тең 3 , y тең 9 , z тең 15\nx тең 48 , y тең 35 , z тең 4\nx тең 100 , y тең 4 , z тең 50"}, {"key": "b", "text": "x тең 3 , y тең 4 , z тең 15\nx тең 48 , y тең 4 , z тең 35\nx тең 100 , y тең 4 , z тең 50"}, {"key": "c", "text": "x тең 3 , y тең 9 , z тең 15\nx тең 48 , y тең 4 , z тең 35\nx тең 100 , y тең 4 , z тең 50"}, {"key": "d", "text": "x тең 3 , y тең 9 , z тең 15\nx тең 48 , y тең 4 , z тең 35\nx тең 50 , y тең 4 , z тең 100"}]'::jsonb, 'c', '/t/4f07fcd20ca9cff5.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 8, null, 'Рекурсия', 'Recursion(5) шақырылғандағы код нәтижесі:', 1, '[{"key": "a", "text": "2 3 4 5"}, {"key": "b", "text": "5 4 3 2"}, {"key": "c", "text": "5 4 3 2 1"}, {"key": "d", "text": "1 2 3 4 5"}]'::jsonb, 'a', '/t/8d0aa6ef4e070c24.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 9, null, 'Функция түрі', 'Кодта қолданылған функция түрі:', 1, '[{"key": "a", "text": "параметрсіз процедура"}, {"key": "b", "text": "рекурсивтік функция"}, {"key": "c", "text": "параметрлі функция"}, {"key": "d", "text": "лямбда функция"}]'::jsonb, 'b', '/t/fc6c41aa73f6d287.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 10, null, 'Жолды талдау', 's айнымалысына "ЖБ ағай краш қой " мәнін бергендегі нәтиже
(назар аудар: жол соңында бір бос орын бар)', 1, '[{"key": "a", "text": "6"}, {"key": "b", "text": "4"}, {"key": "c", "text": "5"}, {"key": "d", "text": "3"}]'::jsonb, 'c', '/t/13232afac10d59e8.png');

  -- ---------- Debug (11–14) және Build (15–16): шығыстары эталон шешімнен есептелген ----------
  insert into tasks (round_id, idx, title, statement, points, starter_code, solution_code, entry, max_changed_lines, forbidden, tests_public, tests_hidden) values (
    r2, 11, 'Цифрлар қосындысы', 'Натурал санның цифрларының қосындысын қайтарады.
Мысалы: 1234 → 10.
БІР жолда қате бар — тек соны түзет.', 3,
    $c$def cifr_qosyndy(n):
    s = 0
    while n > 0:
        s = s + n % 10
        n = n / 10
    return s
$c$,
    $c$def cifr_qosyndy(n):
    s = 0
    while n > 0:
        s = s + n % 10
        n = n // 10
    return s
$c$,
    'cifr_qosyndy', 1, '{}'::text[],
    '[{"args": [1234], "expected": "10"}, {"args": [7], "expected": "7"}]'::jsonb,
    '[{"args": [0], "expected": "0"}, {"args": [9], "expected": "9"}, {"args": [10], "expected": "1"}, {"args": [99], "expected": "18"}, {"args": [505], "expected": "10"}, {"args": [1000], "expected": "1"}, {"args": [9999], "expected": "36"}, {"args": [123456], "expected": "21"}, {"args": [1000000], "expected": "1"}, {"args": [80808], "expected": "24"}, {"args": [31], "expected": "4"}, {"args": [2026], "expected": "10"}]'::jsonb);
  insert into tasks (round_id, idx, title, statement, points, starter_code, solution_code, entry, max_changed_lines, forbidden, tests_public, tests_hidden) values (
    r2, 12, 'Палиндром', 'Жол палиндром болса (екі жағынан бірдей оқылса) True, әйтпесе False қайтарады.
Мысалы: "anna" → True, "python" → False.
БІР жолда қате бар — тек соны түзет.', 3,
    $c$def palindrom(s):
    n = len(s)
    for i in range(n // 2):
        if s[i] != s[n - i]:
            return False
    return True
$c$,
    $c$def palindrom(s):
    n = len(s)
    for i in range(n // 2):
        if s[i] != s[n - 1 - i]:
            return False
    return True
$c$,
    'palindrom', 1, '{}'::text[],
    '[{"args": ["anna"], "expected": "True"}, {"args": ["python"], "expected": "False"}]'::jsonb,
    '[{"args": [""], "expected": "True"}, {"args": ["a"], "expected": "True"}, {"args": ["aa"], "expected": "True"}, {"args": ["ab"], "expected": "False"}, {"args": ["aba"], "expected": "True"}, {"args": ["abca"], "expected": "False"}, {"args": ["abcba"], "expected": "True"}, {"args": ["abccba"], "expected": "True"}, {"args": ["abcdba"], "expected": "False"}, {"args": ["qazaq"], "expected": "True"}, {"args": ["kiyik"], "expected": "True"}, {"args": ["debug"], "expected": "False"}, {"args": ["xyzzyx"], "expected": "True"}, {"args": ["xyzzyy"], "expected": "False"}]'::jsonb);
  insert into tasks (round_id, idx, title, statement, points, starter_code, solution_code, entry, max_changed_lines, forbidden, tests_public, tests_hidden) values (
    r2, 13, 'Ең кіші элементтің орны', 'Тізімдегі ең кіші элементтің орнын (индексін) қайтарады. Ең кішісі бірнешеу болса — біріншісінің орнын.
Мысалы: [5, 3, 8] → 1.
БІР жолда қате бар — тек соны түзет.', 3,
    $c$def eng_kishi_orny(a):
    k = 0
    for i in range(1, len(a)):
        if a[i] < a[k]:
            k = a[i]
    return k
$c$,
    $c$def eng_kishi_orny(a):
    k = 0
    for i in range(1, len(a)):
        if a[i] < a[k]:
            k = i
    return k
$c$,
    'eng_kishi_orny', 1, '{}'::text[],
    '[{"args": [[5, 3, 8]], "expected": "1"}, {"args": [[4, 9, 1, 7]], "expected": "2"}]'::jsonb,
    '[{"args": [[9]], "expected": "0"}, {"args": [[1, 2, 3]], "expected": "0"}, {"args": [[3, 2, 1, 0]], "expected": "3"}, {"args": [[4, 4, 1, 1]], "expected": "2"}, {"args": [[-1, -5, -5]], "expected": "1"}, {"args": [[10, 20, 5, 30]], "expected": "2"}, {"args": [[7, 7, 7]], "expected": "0"}, {"args": [[0, -1]], "expected": "1"}, {"args": [[100, 50, 75, 50, 25]], "expected": "4"}, {"args": [[2, 1, 2, 1, 0, 3]], "expected": "4"}, {"args": [[-3, -2, -1]], "expected": "0"}, {"args": [[8, 6, 7, 5, 3, 0, 9]], "expected": "5"}]'::jsonb);
  insert into tasks (round_id, idx, title, statement, points, starter_code, solution_code, entry, max_changed_lines, forbidden, tests_public, tests_hidden) values (
    r2, 14, 'Ең үлкен ортақ бөлгіш', 'Екі теріс емес бүтін санның ең үлкен ортақ бөлгішін (ЕҮОБ) Евклид алгоритмімен табады.
Мысалы: euob(12, 8) → 4.
БІР жолда қате бар — тек соны түзет.', 3,
    $c$def euob(a, b):
    while b != 0:
        a, b = b, a // b
    return a
$c$,
    $c$def euob(a, b):
    while b != 0:
        a, b = b, a % b
    return a
$c$,
    'euob', 1, '{}'::text[],
    '[{"args": [12, 8], "expected": "4"}, {"args": [7, 3], "expected": "1"}]'::jsonb,
    '[{"args": [1, 1], "expected": "1"}, {"args": [5, 0], "expected": "5"}, {"args": [0, 9], "expected": "9"}, {"args": [100, 75], "expected": "25"}, {"args": [17, 17], "expected": "17"}, {"args": [48, 18], "expected": "6"}, {"args": [18, 48], "expected": "6"}, {"args": [13, 5], "expected": "1"}, {"args": [1000, 10], "expected": "10"}, {"args": [81, 27], "expected": "27"}, {"args": [35, 14], "expected": "7"}, {"args": [2026, 10], "expected": "2"}, {"args": [9, 28], "expected": "1"}, {"args": [64, 48], "expected": "16"}]'::jsonb);
  insert into tasks (round_id, idx, title, statement, points, starter_code, solution_code, entry, max_changed_lines, forbidden, tests_public, tests_hidden) values (
    r3, 15, 'Жолды сығу', 'Жолды сығ: қатар тұрған бірдей таңбалардың орнына «таңба + саны» жаз.

Мысалдар:
```
"aaabbc"  →  "a3b2c1"
"abc"     →  "a1b1c1"
""        →  ""
```
Жолда тек кіші латын әріптері болады. Кітапхана қолдануға болмайды (import жоқ).', 4,
    $c$def sygu(s):
    # осында жаз
    pass
$c$,
    $c$def sygu(s):
    if s == "":
        return ""
    res = ""
    cur = s[0]
    n = 1
    for ch in s[1:]:
        if ch == cur:
            n += 1
        else:
            res += cur + str(n)
            cur = ch
            n = 1
    res += cur + str(n)
    return res
$c$,
    'sygu', null, array['import']::text[],
    '[{"args": ["aaabbc"], "expected": "''a3b2c1''"}, {"args": [""], "expected": "''''"}]'::jsonb,
    '[{"args": ["a"], "expected": "''a1''"}, {"args": ["abc"], "expected": "''a1b1c1''"}, {"args": ["aaaaaaaaaaaa"], "expected": "''a12''"}, {"args": ["aabbaa"], "expected": "''a2b2a2''"}, {"args": ["zzzzy"], "expected": "''z4y1''"}, {"args": ["abbbbbbbbbbc"], "expected": "''a1b10c1''"}, {"args": ["xyxyxy"], "expected": "''x1y1x1y1x1y1''"}, {"args": ["kkkkkkkkkkkkkkkkkkkkk"], "expected": "''k21''"}, {"args": ["debug"], "expected": "''d1e1b1u1g1''"}, {"args": ["aabbccdd"], "expected": "''a2b2c2d2''"}, {"args": ["mississippi"], "expected": "''m1i1s2i1s2i1p2i1''"}, {"args": ["qqqwwwweee"], "expected": "''q3w4e3''"}, {"args": ["z"], "expected": "''z1''"}, {"args": ["abccccccccccccba"], "expected": "''a1b1c12b1a1''"}]'::jsonb);
  insert into tasks (round_id, idx, title, statement, points, starter_code, solution_code, entry, max_changed_lines, forbidden, tests_public, tests_hidden) values (
    r3, 16, 'Ең ұзын өспелі бөлік', 'Тізімде қатар тұрған, әрқайсысы алдыңғысынан ҮЛКЕН сандардың ең ұзын тізбегінің ұзындығын қайтар.

Мысалдар:
```
[1, 2, 2, 3, 4, 1]  →  3     (2, 3, 4)
[5, 4, 3]           →  1
[]                  →  0
```
Тең сандар өсу болып саналмайды. Кітапхана қолдануға болмайды (import жоқ).', 4,
    $c$def eng_uzyn_ospeli(a):
    # осында жаз
    pass
$c$,
    $c$def eng_uzyn_ospeli(a):
    if len(a) == 0:
        return 0
    best = 1
    cur = 1
    for i in range(1, len(a)):
        if a[i] > a[i - 1]:
            cur = cur + 1
        else:
            cur = 1
        if cur > best:
            best = cur
    return best
$c$,
    'eng_uzyn_ospeli', null, array['import']::text[],
    '[{"args": [[1, 2, 2, 3, 4, 1]], "expected": "3"}, {"args": [[5, 4, 3]], "expected": "1"}]'::jsonb,
    '[{"args": [[]], "expected": "0"}, {"args": [[7]], "expected": "1"}, {"args": [[1, 2, 3, 4, 5]], "expected": "5"}, {"args": [[5, 4, 3, 2, 1]], "expected": "1"}, {"args": [[1, 1, 1]], "expected": "1"}, {"args": [[1, 2, 1, 2, 3]], "expected": "3"}, {"args": [[3, 4, 5, 1, 2]], "expected": "3"}, {"args": [[1, 3, 2, 4, 6, 8, 7]], "expected": "4"}, {"args": [[-3, -2, -1, 0]], "expected": "4"}, {"args": [[2, 2, 3, 3, 4, 4]], "expected": "2"}, {"args": [[10, 20, 30, 5, 6, 7, 8, 9]], "expected": "5"}, {"args": [[1, 2, 3, 1, 2, 3, 4, 1, 2]], "expected": "4"}, {"args": [[0, 0]], "expected": "1"}, {"args": [[9, 1, 2]], "expected": "2"}, {"args": [[4, 5]], "expected": "2"}, {"args": [[5, 4]], "expected": "1"}, {"args": [[1, 2, 3, 3, 4, 5, 6]], "expected": "4"}, {"args": [[-1, -5, -2, 0, 3, 3]], "expected": "4"}]'::jsonb);

  raise notice '«%» жарысына 16 тапсырма қосылды: Trace 10, Debug 4, Build 2. Үш кезең де 20 минут.', ctitle;
end $oct$;
