-- ============================================================
-- DEBUG · жүлдегерлердің кодын тексеру (көшіруді анықтау)
-- Бәрі тек оқиды (SELECT) — жарыс жүріп жатқанда да орындауға болады.
-- SQL Editor бір уақытта бір нәтиже көрсетеді: сұраныстарды БІР-БІРЛЕП орындаңыз.
-- ============================================================

-- 1) ҮЗДІК 10 ОҚУШЫНЫҢ ЕСЕПТЕЛГЕН КОДЫ (Debug және Build). Тек оқиды, ештеңе өзгертпейді.
with c as (
  select id from contests where status in ('running', 'published')
  order by (status = 'running') desc, starts_at asc limit 1
), top as (
  select * from contest_ranking((select id from c)) where rank <= 10
), last as (
  select distinct on (s.student_id, s.task_id) s.student_id, s.task_id, s.code, s.is_correct, s.created_at
  from submissions s join rounds r on r.id = s.round_id
  where s.contest_id = (select id from c) and r.kind in ('debug', 'code')
  order by s.student_id, s.task_id, s.created_at desc, s.id desc
)
select top.rank as "орын", top.name as "оқушы", top.score as "ұпай", t.idx as "тапсырма",
       case when l.is_correct then 'дұрыс' else 'қате' end as "нәтиже",
       to_char(l.created_at at time zone 'UTC' + interval '5 hours', 'HH24:MI:SS') as "уақыты",
       l.code as "код"
from top join last l on l.student_id = top.student_id join tasks t on t.id = l.task_id
order by top.rank, t.idx;


-- 2) BUILD КЕЗЕҢІНДЕ КОДЫ БІРДЕЙ ОҚУШЫЛАР (бос орын мен түсініктемелер есепке алынбайды).
--    Әр топта кім бірінші жібергені уақытымен көрсетіледі. Тек оқиды.
with c as (
  select id from contests where status in ('running', 'published')
  order by (status = 'running') desc, starts_at asc limit 1
), last as (
  select distinct on (s.student_id, s.task_id) s.student_id, s.task_id, s.code, s.is_correct, s.created_at
  from submissions s join rounds r on r.id = s.round_id
  where s.contest_id = (select id from c) and r.kind = 'code'
  order by s.student_id, s.task_id, s.created_at desc, s.id desc
), norm as (
  select l.*, md5(lower(regexp_replace(regexp_replace(l.code, '#[^\n]*', '', 'g'), '\s+', '', 'g'))) as h
  from last l where l.is_correct
)
select t.idx as "тапсырма", count(*) as "оқушы саны",
       string_agg(st.full_name || ' (' || to_char(n.created_at at time zone 'UTC' + interval '5 hours', 'HH24:MI:SS') || ')',
                  ' · ' order by n.created_at) as "кімдер (жіберген уақыты)",
       min(n.code) as "ортақ код"
from norm n join tasks t on t.id = n.task_id join students st on st.id = n.student_id
group by t.idx, n.h
having count(*) > 1
order by t.idx, count(*) desc;


-- 3) BUILD: кім қанша уақытта және нешінші әрекетте шешті (тым тез шешкендер көзге түседі). Тек оқиды.
with c as (
  select id from contests where status in ('running', 'published')
  order by (status = 'running') desc, starts_at asc limit 1
)
select t.idx as "тапсырма", st.full_name as "оқушы", count(*) as "әрекет саны",
       to_char(min(s.created_at) filter (where s.is_correct) - r.started_at, 'MI:SS') as "шешуге кеткен уақыт",
       length(max(s.code) filter (where s.is_correct)) as "код ұзындығы"
from submissions s join rounds r on r.id = s.round_id join tasks t on t.id = s.task_id join students st on st.id = s.student_id
where s.contest_id = (select id from c) and r.kind = 'code'
group by t.idx, st.full_name, r.started_at
having bool_or(s.is_correct)
order by t.idx, min(s.created_at) filter (where s.is_correct);
