-- ============================================================
-- DEBUG · РЕПЕТИЦИЯ ЖАРЫСЫ (қыркүйектің тапсырмаларымен)
-- 003_stages.sql-ден кейін SQL Editor-де орындаңыз. Қайта орындау қауіпсіз:
-- 'rehearsal' жарысы бар болса, ештеңе өзгермейді.
-- Trace суреттері сайттың өзінде: /t/*.png
-- ============================================================
do $seed$
declare c uuid; r1 uuid; r2 uuid; r3 uuid;
begin
  if exists (select 1 from contests where slug = 'rehearsal') then
    raise notice 'rehearsal бұрыннан бар — өткізіп жібердік';
    return;
  end if;

  insert into contests (slug, title, starts_at, status)
  values ('rehearsal', 'DEBUG · Репетиция', now() + interval '1 day', 'draft')
  returning id into c;

  insert into rounds (contest_id, idx, kind, title, duration_min) values (c, 1, 'mcq',   'Trace — кодты оқу',    20) returning id into r1;
  insert into rounds (contest_id, idx, kind, title, duration_min) values (c, 2, 'debug', 'Debug — қатені түзет', 30) returning id into r2;
  insert into rounds (contest_id, idx, kind, title, duration_min) values (c, 3, 'code',  'Build — өзің жаз',     20) returning id into r3;

  -- ---------- Trace: A және B нұсқалары (дұрыс жауаптар Apps Script-тегі ANSWERS-тен) ----------
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 1, 'A', 'Кодтың қызметі', 'Төмендегі кодтың қызметі:', 1, '[{"key": "a", "text": "енгізілген санның барлық бөлгіштерінің қосындысы мен көбейтіндісін табады"}, {"key": "b", "text": "берілген аралықтағы ең кіші және ең үлкен жай сандарды анықтайды"}, {"key": "c", "text": "берілген аралықтағы ең кіші және үлкен сандарды анықтайды"}, {"key": "d", "text": "енгізілген санның 1 мен өзінен басқа ең үлкен және ең кіші бөлгіштерін табады"}]'::jsonb, 'd', '/t/b096819e46cc4b19.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 2, 'A', 'Цифрлармен жұмыс', 'n = 7649 мәнін бергендегі код нәтижесі:', 1, '[{"key": "a", "text": "san: 9 4 6 7"}, {"key": "b", "text": "san: 946"}, {"key": "c", "text": "san: 9467"}, {"key": "d", "text": "san: 26"}]'::jsonb, 'c', '/t/6ea16a28f6f090b8.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 3, 'A', 'Жылдар саны', 'Пайдаланушы x = 100, p = 20, y = 144 мәндерін енгізгендегі нәтиже:', 1, '[{"key": "a", "text": "sizge kerektisi 3 jyl"}, {"key": "b", "text": "sizge kerektisi 2 jyl"}, {"key": "c", "text": "sizge kerektisi 144 jyl"}, {"key": "d", "text": "sizge kerektisi 1 jyl"}]'::jsonb, 'b', '/t/2771bd0b2c00483f.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 4, 'A', 'Тізімді өзгерту', '5 10 1 2 3 10 -10 мәндерін бергендегі код нәтижесі:', 1, '[{"key": "a", "text": "A= [1, 2, 3, 10, -10]"}, {"key": "b", "text": "A= [10, -10, 1, 2, 3]"}, {"key": "c", "text": "A= [-10, 1, 2, 3, 10]"}, {"key": "d", "text": "A= [2, 3, 10, -10, 1]"}]'::jsonb, 'd', '/t/e6e93f7ba89e78df.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 5, 'A', 'Кодтың мақсаты', 'Кодтың мақсаты:', 1, '[{"key": "a", "text": "N санының жай сан екенін тексеру"}, {"key": "b", "text": "N санының барлық бөлгіштерін тауып, экранға шығару"}, {"key": "c", "text": "N санын 2-ге бөліп, жұп немесе тақ екенін анықтау"}, {"key": "d", "text": "N санына дейінгі барлық жай сандарды табу"}]'::jsonb, 'a', '/t/65f689e913647200.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 6, 'A', 'Көріну аймағы', 'Соңғы жолдың нәтижесі:', 1, '[{"key": "a", "text": "??? y = 12"}, {"key": "b", "text": "??? y = 9"}, {"key": "c", "text": "??? y = 5"}, {"key": "d", "text": "Қате шығады, y функция ішінде өзгертілді"}]'::jsonb, 'a', '/t/f986125bfa71cd27.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 7, 'A', 'Үш айнымалы', 'Код нәтижесі:', 1, '[{"key": "a", "text": "x тең 3 , y тең 9 , z тең 15\nx тең 48 , y тең 35 , z тең 4\nx тең 100 , y тең 4 , z тең 50"}, {"key": "b", "text": "x тең 3 , y тең 4 , z тең 15\nx тең 48 , y тең 4 , z тең 35\nx тең 100 , y тең 4 , z тең 50"}, {"key": "c", "text": "x тең 3 , y тең 9 , z тең 15\nx тең 48 , y тең 4 , z тең 35\nx тең 100 , y тең 4 , z тең 50"}, {"key": "d", "text": "x тең 3 , y тең 9 , z тең 15\nx тең 48 , y тең 4 , z тең 35\nx тең 50 , y тең 4 , z тең 100"}]'::jsonb, 'c', '/t/4f07fcd20ca9cff5.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 8, 'A', 'Рекурсия', 'Recursion(5) шақырылғандағы код нәтижесі:', 1, '[{"key": "a", "text": "2 3 4 5"}, {"key": "b", "text": "5 4 3 2"}, {"key": "c", "text": "5 4 3 2 1"}, {"key": "d", "text": "1 2 3 4 5"}]'::jsonb, 'a', '/t/8d0aa6ef4e070c24.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 9, 'A', 'Функция түрі', 'Кодта қолданылған функция түрі:', 1, '[{"key": "a", "text": "параметрсіз процедура"}, {"key": "b", "text": "рекурсивтік функция"}, {"key": "c", "text": "параметрлі функция"}, {"key": "d", "text": "лямбда функция"}]'::jsonb, 'b', '/t/fc6c41aa73f6d287.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 10, 'A', 'Жолды талдау', 's айнымалысына "ЖБ ағай краш қой " мәнін бергендегі нәтиже
(назар аудар: жол соңында бір бос орын бар)', 1, '[{"key": "a", "text": "6"}, {"key": "b", "text": "4"}, {"key": "c", "text": "5"}, {"key": "d", "text": "3"}]'::jsonb, 'c', '/t/13232afac10d59e8.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 1, 'B', 'Кодтың қызметі', 'Төмендегі кодтың қызметі:', 1, '[{"key": "a", "text": "енгізілген санның 1 мен өзінен басқа ең үлкен және ең кіші бөлгіштерін табады"}, {"key": "b", "text": "енгізілген санның барлық бөлгіштерінің қосындысы мен көбейтіндісін табады"}, {"key": "c", "text": "берілген аралықтағы ең кіші және ең үлкен жай сандарды анықтайды"}, {"key": "d", "text": "берілген аралықтағы ең кіші және үлкен сандарды анықтайды"}]'::jsonb, 'a', '/t/b096819e46cc4b19.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 2, 'B', 'Цифрлармен жұмыс', 'n = 7649 мәнін бергендегі код нәтижесі:', 1, '[{"key": "a", "text": "san: 946"}, {"key": "b", "text": "san: 9467"}, {"key": "c", "text": "san: 26"}, {"key": "d", "text": "san: 9 4 6 7"}]'::jsonb, 'b', '/t/6ea16a28f6f090b8.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 3, 'B', 'Жылдар саны', 'Пайдаланушы x = 100, p = 20, y = 144 мәндерін енгізгендегі нәтиже:', 1, '[{"key": "a", "text": "sizge kerektisi 2 jyl"}, {"key": "b", "text": "sizge kerektisi 144 jyl"}, {"key": "c", "text": "sizge kerektisi 1 jyl"}, {"key": "d", "text": "sizge kerektisi 3 jyl"}]'::jsonb, 'a', '/t/2771bd0b2c00483f.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 4, 'B', 'Тізімді өзгерту', '5 10 1 2 3 10 -10 мәндерін бергендегі код нәтижесі:', 1, '[{"key": "a", "text": "A= [-10, 1, 2, 3, 10]"}, {"key": "b", "text": "A= [10, -10, 1, 2, 3]"}, {"key": "c", "text": "A= [2, 3, 10, -10, 1]"}, {"key": "d", "text": "A= [1, 2, 3, 10, -10]"}]'::jsonb, 'c', '/t/e6e93f7ba89e78df.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 5, 'B', 'Кодтың мақсаты', 'Кодтың мақсаты:', 1, '[{"key": "a", "text": "N санының барлық бөлгіштерін тауып, экранға шығару"}, {"key": "b", "text": "N санына дейінгі барлық жай сандарды табу"}, {"key": "c", "text": "N санының жай сан екенін тексеру"}, {"key": "d", "text": "N санын 2-ге бөліп, жұп немесе тақ екенін анықтау"}]'::jsonb, 'c', '/t/65f689e913647200.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 6, 'B', 'Көріну аймағы', 'Соңғы жолдың нәтижесі:', 1, '[{"key": "a", "text": "??? y = 5"}, {"key": "b", "text": "??? y = 9"}, {"key": "c", "text": "Қате шығады, y функция ішінде өзгертілді"}, {"key": "d", "text": "??? y = 12"}]'::jsonb, 'd', '/t/f986125bfa71cd27.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 7, 'B', 'Үш айнымалы', 'Код нәтижесі:', 1, '[{"key": "a", "text": "x тең 3 , y тең 9 , z тең 15\nx тең 48 , y тең 35 , z тең 4\nx тең 100 , y тең 4 , z тең 50"}, {"key": "b", "text": "x тең 3 , y тең 9 , z тең 15\nx тең 48 , y тең 4 , z тең 35\nx тең 100 , y тең 4 , z тең 50"}, {"key": "c", "text": "x тең 3 , y тең 9 , z тең 15\nx тең 48 , y тең 4 , z тең 35\nx тең 50 , y тең 4 , z тең 100"}, {"key": "d", "text": "x тең 3 , y тең 4 , z тең 15\nx тең 48 , y тең 4 , z тең 35\nx тең 100 , y тең 4 , z тең 50"}]'::jsonb, 'b', '/t/4f07fcd20ca9cff5.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 8, 'B', 'Рекурсия', 'Recursion(5) шақырылғандағы код нәтижесі:', 1, '[{"key": "a", "text": "5 4 3 2 1"}, {"key": "b", "text": "5 4 3 2"}, {"key": "c", "text": "1 2 3 4 5"}, {"key": "d", "text": "2 3 4 5"}]'::jsonb, 'd', '/t/8d0aa6ef4e070c24.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 9, 'B', 'Функция түрі', 'Кодта қолданылған функция түрі:', 1, '[{"key": "a", "text": "параметрлі функция"}, {"key": "b", "text": "параметрсіз процедура"}, {"key": "c", "text": "лямбда функция"}, {"key": "d", "text": "рекурсивтік функция"}]'::jsonb, 'd', '/t/fc6c41aa73f6d287.png');
  insert into tasks (round_id, idx, variant, title, statement, points, options, correct, image_url) values (r1, 10, 'B', 'Жолды талдау', 's айнымалысына "ЖБ ағай краш қой " мәнін бергендегі нәтиже
(назар аудар: жол соңында бір бос орын бар)', 1, '[{"key": "a", "text": "6"}, {"key": "b", "text": "5"}, {"key": "c", "text": "4"}, {"key": "d", "text": "3"}]'::jsonb, 'b', '/t/13232afac10d59e8.png');

  -- ---------- Debug және Build: ашық мысалдар + жасырын тесттер (шығыстары эталон шешімнен есептелген) ----------
  insert into tasks (round_id, idx, title, statement, points, starter_code, solution_code, entry, max_changed_lines, forbidden, tests_public, tests_hidden) values (
    r2, 11, 'Қосынды', 'a-дан b-ға дейінгі сандардың қосындысын қайтарады (a мен b те қосылады).
БІР жолда қате бар — тек соны түзет.', 3,
    $c$def qosyndy(a, b):
    s = 0
    for i in range(a, b):
        s = s + i
    return s
$c$,
    $c$def qosyndy(a, b):
    s = 0
    for i in range(a, b + 1):
        s = s + i
    return s
$c$,
    'qosyndy', 1, '{}'::text[],
    '[{"args": [2, 4], "expected": "9"}, {"args": [7, 7], "expected": "7"}]'::jsonb,
    '[{"args": [1, 10], "expected": "55"}, {"args": [4, 8], "expected": "30"}, {"args": [0, 0], "expected": "0"}, {"args": [-3, 3], "expected": "0"}, {"args": [5, 5], "expected": "5"}, {"args": [1, 100], "expected": "5050"}, {"args": [-10, -5], "expected": "-45"}, {"args": [3, 4], "expected": "7"}, {"args": [10, 20], "expected": "165"}, {"args": [0, 1], "expected": "1"}, {"args": [-2, 0], "expected": "-3"}, {"args": [50, 51], "expected": "101"}]'::jsonb);
  insert into tasks (round_id, idx, title, statement, points, starter_code, solution_code, entry, max_changed_lines, forbidden, tests_public, tests_hidden) values (
    r2, 12, 'Дауысты дыбыстар', 'Жолдағы дауысты дыбыстардың (a, e, i, o, u) санын қайтарады.
БІР жолда қате бар — тек соны түзет.', 3,
    $c$def dauysty(s):
    n = 0
    for ch in s:
        if ch in "aeiou":
            n = 1
    return n
$c$,
    $c$def dauysty(s):
    n = 0
    for ch in s:
        if ch in "aeiou":
            n = n + 1
    return n
$c$,
    'dauysty', 1, '{}'::text[],
    '[{"args": ["debug"], "expected": "2"}, {"args": ["python"], "expected": "1"}]'::jsonb,
    '[{"args": ["programming"], "expected": "3"}, {"args": ["aeiou"], "expected": "5"}, {"args": ["xyz"], "expected": "0"}, {"args": [""], "expected": "0"}, {"args": ["education"], "expected": "5"}, {"args": ["banana"], "expected": "3"}, {"args": ["queue"], "expected": "4"}, {"args": ["rhythm"], "expected": "0"}, {"args": ["computer science"], "expected": "6"}, {"args": ["a"], "expected": "1"}, {"args": ["ooo"], "expected": "3"}, {"args": ["kazakhstan"], "expected": "3"}]'::jsonb);
  insert into tasks (round_id, idx, title, statement, points, starter_code, solution_code, entry, max_changed_lines, forbidden, tests_public, tests_hidden) values (
    r2, 13, 'Ең үлкен сан', 'Тізімдегі ең үлкен санды қайтарады (max() қолданбай).
БІР жолда қате бар — тек соны түзет.', 3,
    $c$def eng_ulken(nums):
    m = 0
    for x in nums:
        if x > m:
            m = x
    return m
$c$,
    $c$def eng_ulken(nums):
    m = nums[0]
    for x in nums:
        if x > m:
            m = x
    return m
$c$,
    'eng_ulken', 1, '{}'::text[],
    '[{"args": [[3, 9, 2]], "expected": "9"}, {"args": [[-5, -2, -9]], "expected": "-2"}]'::jsonb,
    '[{"args": [[7]], "expected": "7"}, {"args": [[-1]], "expected": "-1"}, {"args": [[1, 2, 3, 4, 5]], "expected": "5"}, {"args": [[5, 4, 3, 2, 1]], "expected": "5"}, {"args": [[-10, -20, -3, -4]], "expected": "-3"}, {"args": [[0, -1, -2]], "expected": "0"}, {"args": [[4, 4, 4]], "expected": "4"}, {"args": [[-7, 0, 7]], "expected": "7"}, {"args": [[100, -100]], "expected": "100"}, {"args": [[-3, -3, -8]], "expected": "-3"}, {"args": [[2, 15, 15, 3]], "expected": "15"}, {"args": [[-50, -49, -51]], "expected": "-49"}]'::jsonb);
  insert into tasks (round_id, idx, title, statement, points, starter_code, solution_code, entry, max_changed_lines, forbidden, tests_public, tests_hidden) values (
    r2, 14, 'Теріс сандар', 'Тізімнен барлық теріс сандарды өшіріп, [тазартылған тізім, өшірілген сан] қайтарады.
БІР жолда қате бар — тек соны түзет.', 3,
    $c$def teris_oshir(nums):
    count = 0
    for x in nums:
        if x < 0:
            nums.remove(x)
            count += 1
    return [nums, count]
$c$,
    $c$def teris_oshir(nums):
    count = 0
    for x in nums[:]:
        if x < 0:
            nums.remove(x)
            count += 1
    return [nums, count]
$c$,
    'teris_oshir', 1, '{}'::text[],
    '[{"args": [[3, -1, 4]], "expected": "[[3, 4], 1]"}, {"args": [[-1, -2, 5]], "expected": "[[5], 2]"}]'::jsonb,
    '[{"args": [[]], "expected": "[[], 0]"}, {"args": [[1, 2, 3]], "expected": "[[1, 2, 3], 0]"}, {"args": [[-1, -2, -3]], "expected": "[[], 3]"}, {"args": [[0, -5, 0]], "expected": "[[0, 0], 1]"}, {"args": [[-4, -4, 2, -4]], "expected": "[[2], 3]"}, {"args": [[5, -1, -1, 6, -2]], "expected": "[[5, 6], 3]"}, {"args": [[-9]], "expected": "[[], 1]"}, {"args": [[10, -3, -7, -8, 11, -1]], "expected": "[[10, 11], 4]"}, {"args": [[-2, 0, -2, 0]], "expected": "[[0, 0], 2]"}, {"args": [[7, 8, -9, -10]], "expected": "[[7, 8], 2]"}]'::jsonb);
  insert into tasks (round_id, idx, title, statement, points, starter_code, solution_code, entry, max_changed_lines, forbidden, tests_public, tests_hidden) values (
    r3, 15, 'Қайталанатындарды өшіру', 'Тізімнен қайталанатын элементтерді өшір. Әр санның БІРІНШІ кездескен орны сақталуы керек.

Мысал: [3, 1, 3, 2, 1] → [3, 1, 2]

set() қолдануға БОЛМАЙДЫ — тек тізім амалдары.', 4,
    $c$def tazala_dubl(nums):
    # осында жаз
    pass
$c$,
    $c$def tazala_dubl(nums):
    res = []
    for x in nums:
        if x not in res:
            res.append(x)
    return res
$c$,
    'tazala_dubl', null, array['set(']::text[],
    '[{"args": [[3, 1, 3, 2, 1]], "expected": "[3, 1, 2]"}, {"args": [[]], "expected": "[]"}]'::jsonb,
    '[{"args": [[1, 1, 1]], "expected": "[1]"}, {"args": [[5, 4, 3]], "expected": "[5, 4, 3]"}, {"args": [[2, 2, 3, 3, 2]], "expected": "[2, 3]"}, {"args": [[-1, 1, -1, 0]], "expected": "[-1, 1, 0]"}, {"args": [[7]], "expected": "[7]"}, {"args": [[9, 8, 9, 7, 8, 6]], "expected": "[9, 8, 7, 6]"}, {"args": [[0, 0, 0, 1]], "expected": "[0, 1]"}, {"args": [[4, 5, 4, 5, 4, 5]], "expected": "[4, 5]"}, {"args": [[10, 20, 30, 20, 10]], "expected": "[10, 20, 30]"}, {"args": [[-5, -5, -6]], "expected": "[-5, -6]"}, {"args": [[1, 2, 3, 1, 2, 3, 4]], "expected": "[1, 2, 3, 4]"}]'::jsonb);
  insert into tasks (round_id, idx, title, statement, points, starter_code, solution_code, entry, max_changed_lines, forbidden, tests_public, tests_hidden) values (
    r3, 16, 'Жақын қайталау', 'nums тізімінде бір-бірінен ЕҢ КӨП ДЕГЕНДЕ k қадам қашықтықта тұрған екі бірдей сан бар ма?
Бар болса True, жоқ болса False қайтар.

Мысал: nums = [1, 2, 3, 1], k = 3 → True (екі 1-дің арасы 3 қадам)
Мысал: nums = [1, 2, 3, 1], k = 2 → False', 4,
    $c$def jaqyn_qaitalau(nums, k):
    # осында жаз
    pass
$c$,
    $c$def jaqyn_qaitalau(nums, k):
    last = {}
    for i, x in enumerate(nums):
        if x in last and i - last[x] <= k:
            return True
        last[x] = i
    return False
$c$,
    'jaqyn_qaitalau', null, '{}'::text[],
    '[{"args": [[1, 2, 3, 1], 3], "expected": "True"}, {"args": [[1, 2, 3, 1], 2], "expected": "False"}]'::jsonb,
    '[{"args": [[1, 0, 1, 1], 1], "expected": "True"}, {"args": [[1, 2, 3, 1, 2, 3], 2], "expected": "False"}, {"args": [[], 5], "expected": "False"}, {"args": [[7], 0], "expected": "False"}, {"args": [[5, 5], 0], "expected": "False"}, {"args": [[5, 5], 1], "expected": "True"}, {"args": [[1, 2, 1], 1], "expected": "False"}, {"args": [[1, 2, 1], 2], "expected": "True"}, {"args": [[4, 1, 2, 3, 4], 4], "expected": "True"}, {"args": [[4, 1, 2, 3, 4], 3], "expected": "False"}, {"args": [[9, 8, 7, 6], 10], "expected": "False"}, {"args": [[-1, -1], 1], "expected": "True"}]'::jsonb);

  raise notice 'rehearsal жарысы құрылды (жоба күйінде). Әкімші панелінен «жарияланды» етіңіз.';
end $seed$;
