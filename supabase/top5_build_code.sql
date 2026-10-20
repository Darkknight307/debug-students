-- ҮЗДІК 5 ОҚУШЫНЫҢ BUILD КЕЗЕҢІНДЕГІ КОДЫ. Тек оқиды, ештеңе өзгертпейді.
-- Жарыс күйіне («жүріп жатыр» / «аяқталды») тәуелсіз: соңғы жауап түскен жарысты алады.
with c as (
  select contest_id as id from submissions order by created_at desc limit 1
), top as (
  select * from contest_ranking((select id from c)) where rank <= 5
), build as (
  select s.*, t.idx, t.title
  from submissions s join rounds r on r.id = s.round_id join tasks t on t.id = s.task_id
  where s.contest_id = (select id from c) and r.kind = 'code'
), last as (
  select distinct on (student_id, task_id) * from build
  order by student_id, task_id, created_at desc, id desc
), tries as (
  select student_id, task_id, count(*) as n from build group by 1, 2
)
select top.rank  as "орын",
       top.name  as "оқушы",
       top.score as "жалпы ұпай",
       l.idx     as "тапсырма",
       case when l.is_correct then 'дұрыс' else 'қате' end as "нәтиже",
       tr.n      as "әрекет саны",
       to_char(l.created_at at time zone 'UTC' + interval '5 hours', 'HH24:MI:SS') as "жіберген уақыты",
       l.code    as "код"
from top
join last l   on l.student_id = top.student_id
join tries tr on tr.student_id = l.student_id and tr.task_id = l.task_id
order by top.rank, l.idx;
