-- Phase 31: Executive Strategy Review & Benefits Realization.

insert into public.projectflow_schema_versions (version, label)
values (22, 'executive-strategy-review-benefits-realization')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.objective_benefits (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.portfolio_objectives(id) on delete cascade,
  title text not null,
  description text,
  benefit_type text not null default 'other'
    check (benefit_type in ('financial','customer','operational','risk','capability','other')),
  status text not null default 'planned'
    check (status in ('planned','realizing','realized','not_realized')),
  owner_user_id uuid references auth.users(id) on delete set null,
  target_date date,
  expected_outcome text,
  realized_outcome text,
  evidence text,
  realized_at timestamptz,
  version bigint not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.objective_strategy_reviews (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.portfolio_objectives(id) on delete cascade,
  review_date date not null default current_date,
  period_label text not null,
  assessment text not null
    check (assessment in ('on_track','at_risk','off_track','achieved')),
  summary text,
  decisions_needed text,
  objective_progress_snapshot numeric,
  delivery_progress_snapshot numeric,
  active_risks_snapshot integer not null default 0,
  critical_risks_snapshot integer not null default 0,
  pending_decisions_snapshot integer not null default 0,
  key_results_snapshot jsonb not null default '[]'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists objective_benefits_objective_status_idx
  on public.objective_benefits(objective_id, status, target_date);
create index if not exists objective_reviews_objective_date_idx
  on public.objective_strategy_reviews(objective_id, review_date desc, created_at desc);

alter table public.objective_benefits enable row level security;
alter table public.objective_strategy_reviews enable row level security;

revoke all on table public.objective_benefits from anon, authenticated;
revoke all on table public.objective_strategy_reviews from anon, authenticated;

create or replace function public.projectflow_objective_progress(
  p_objective_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $projectflow$
  with rows as (
    select
      kr.weight,
      greatest(
        0::numeric,
        least(
          100::numeric,
          case
            when kr.direction = 'increase' then
              case
                when kr.target_value = kr.baseline_value then
                  case when kr.current_value >= kr.target_value then 100 else 0 end
                else ((kr.current_value - kr.baseline_value)
                  / nullif(kr.target_value - kr.baseline_value, 0)) * 100
              end
            else
              case
                when kr.baseline_value = kr.target_value then
                  case when kr.current_value <= kr.target_value then 100 else 0 end
                else ((kr.baseline_value - kr.current_value)
                  / nullif(kr.baseline_value - kr.target_value, 0)) * 100
              end
          end
        )
      ) as progress
    from public.objective_key_results kr
    where kr.objective_id = p_objective_id
  )
  select case
    when count(*) = 0 or sum(weight) <= 0 then null
    else sum(progress * weight) / sum(weight)
  end
  from rows;
$projectflow$;

revoke all on function public.projectflow_objective_progress(uuid) from public;

create or replace function public.projectflow_objective_delivery_progress(
  p_objective_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $projectflow$
  select avg(n.progress::numeric)
  from public.objective_project_links opl
  join public.boards b on b.project_id = opl.project_id
  join public.canvas_nodes n on n.board_id = b.id
  where opl.objective_id = p_objective_id
    and n.kind in ('task','milestone');
$projectflow$;

revoke all on function public.projectflow_objective_delivery_progress(uuid) from public;

create or replace function public.save_objective_benefit(
  p_objective_id uuid,
  p_benefit_id uuid,
  p_expected_version bigint,
  p_title text,
  p_description text,
  p_benefit_type text,
  p_status text,
  p_owner_user_id uuid,
  p_target_date date,
  p_expected_outcome text,
  p_realized_outcome text,
  p_evidence text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_id uuid := coalesce(p_benefit_id, gen_random_uuid());
  v_old public.objective_benefits%rowtype;
  v_new public.objective_benefits%rowtype;
  v_project_id text;
begin
  if not public.projectflow_can_edit_objective(p_objective_id) then
    raise exception 'BENEFIT_EDIT_DENIED' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_title, ''))) not between 1 and 200
     or char_length(coalesce(p_description, '')) > 5000
     or char_length(coalesce(p_expected_outcome, '')) > 5000
     or char_length(coalesce(p_realized_outcome, '')) > 5000
     or char_length(coalesce(p_evidence, '')) > 5000
     or p_benefit_type not in ('financial','customer','operational','risk','capability','other')
     or p_status not in ('planned','realizing','realized','not_realized')
  then
    raise exception 'BENEFIT_INVALID_INPUT' using errcode = '22023';
  end if;

  if p_owner_user_id is not null and p_owner_user_id <> auth.uid() and not exists (
    select 1
    from public.objective_project_links opl
    join public.projects p on p.id = opl.project_id
    where opl.objective_id = p_objective_id
      and (
        p.created_by = p_owner_user_id
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = opl.project_id
            and pm.user_id = p_owner_user_id
        )
      )
  ) then
    raise exception 'BENEFIT_OWNER_INVALID' using errcode = '22023';
  end if;

  if p_benefit_id is null then
    insert into public.objective_benefits (
      id, objective_id, title, description, benefit_type, status,
      owner_user_id, target_date, expected_outcome, realized_outcome,
      evidence, realized_at, created_by
    )
    values (
      v_id, p_objective_id, trim(p_title), nullif(trim(coalesce(p_description, '')), ''),
      p_benefit_type, p_status, p_owner_user_id, p_target_date,
      nullif(trim(coalesce(p_expected_outcome, '')), ''),
      nullif(trim(coalesce(p_realized_outcome, '')), ''),
      nullif(trim(coalesce(p_evidence, '')), ''),
      case when p_status = 'realized' then now() else null end,
      auth.uid()
    )
    returning * into v_new;
  else
    select * into v_old
    from public.objective_benefits
    where id = p_benefit_id
      and objective_id = p_objective_id
    for update;

    if not found then
      raise exception 'BENEFIT_NOT_FOUND' using errcode = 'P0002';
    end if;

    if p_expected_version is null or v_old.version <> p_expected_version then
      raise exception 'BENEFIT_VERSION_MISMATCH' using errcode = '40001';
    end if;

    update public.objective_benefits
    set
      title = trim(p_title),
      description = nullif(trim(coalesce(p_description, '')), ''),
      benefit_type = p_benefit_type,
      status = p_status,
      owner_user_id = p_owner_user_id,
      target_date = p_target_date,
      expected_outcome = nullif(trim(coalesce(p_expected_outcome, '')), ''),
      realized_outcome = nullif(trim(coalesce(p_realized_outcome, '')), ''),
      evidence = nullif(trim(coalesce(p_evidence, '')), ''),
      realized_at = case
        when p_status = 'realized' and v_old.status <> 'realized' then now()
        when p_status = 'realized' then v_old.realized_at
        when p_status in ('planned','realizing') then null
        else v_old.realized_at
      end,
      version = version + 1,
      updated_at = now()
    where id = p_benefit_id
    returning * into v_new;
  end if;

  for v_project_id in
    select project_id
    from public.objective_project_links
    where objective_id = p_objective_id
  loop
    perform public.projectflow_append_audit_event(
      v_project_id,
      'project',
      case when p_benefit_id is null
        then 'strategic_benefit_created'
        else 'strategic_benefit_updated'
      end,
      'objective_benefit',
      v_id::text,
      case when p_benefit_id is null then null else
        jsonb_build_object(
          'title', v_old.title,
          'status', v_old.status,
          'target_date', v_old.target_date
        )
      end,
      jsonb_build_object(
        'title', v_new.title,
        'status', v_new.status,
        'target_date', v_new.target_date
      ),
      jsonb_build_object(
        'objective_id', p_objective_id,
        'source', 'strategy_review'
      )
    );
  end loop;

  return to_jsonb(v_new);
end;
$projectflow$;

revoke all on function public.save_objective_benefit(
  uuid, uuid, bigint, text, text, text, text, uuid, date, text, text, text
) from public;
grant execute on function public.save_objective_benefit(
  uuid, uuid, bigint, text, text, text, text, uuid, date, text, text, text
) to authenticated;

create or replace function public.record_objective_strategy_review(
  p_objective_id uuid,
  p_period_label text,
  p_assessment text,
  p_summary text,
  p_decisions_needed text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_review public.objective_strategy_reviews%rowtype;
  v_project_id text;
  v_active_risks integer := 0;
  v_critical_risks integer := 0;
  v_pending_decisions integer := 0;
begin
  if not public.projectflow_can_edit_objective(p_objective_id) then
    raise exception 'STRATEGY_REVIEW_DENIED' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_period_label, ''))) not between 1 and 120
     or p_assessment not in ('on_track','at_risk','off_track','achieved')
     or char_length(coalesce(p_summary, '')) > 7000
     or char_length(coalesce(p_decisions_needed, '')) > 5000
  then
    raise exception 'STRATEGY_REVIEW_INVALID_INPUT' using errcode = '22023';
  end if;

  select
    count(*) filter (
      where r.status in ('open','mitigating')
    ),
    count(*) filter (
      where r.status in ('open','mitigating')
        and r.severity = 'critical'
    )
  into v_active_risks, v_critical_risks
  from public.project_risks r
  join public.objective_project_links opl on opl.project_id = r.project_id
  where opl.objective_id = p_objective_id;

  select count(*)
  into v_pending_decisions
  from public.project_decisions d
  join public.objective_project_links opl on opl.project_id = d.project_id
  where opl.objective_id = p_objective_id
    and d.status = 'proposed';

  insert into public.objective_strategy_reviews (
    objective_id,
    period_label,
    assessment,
    summary,
    decisions_needed,
    objective_progress_snapshot,
    delivery_progress_snapshot,
    active_risks_snapshot,
    critical_risks_snapshot,
    pending_decisions_snapshot,
    key_results_snapshot,
    created_by
  )
  values (
    p_objective_id,
    trim(p_period_label),
    p_assessment,
    nullif(trim(coalesce(p_summary, '')), ''),
    nullif(trim(coalesce(p_decisions_needed, '')), ''),
    public.projectflow_objective_progress(p_objective_id),
    public.projectflow_objective_delivery_progress(p_objective_id),
    v_active_risks,
    v_critical_risks,
    v_pending_decisions,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', kr.id,
          'title', kr.title,
          'unit', kr.unit,
          'direction', kr.direction,
          'baseline_value', kr.baseline_value,
          'current_value', kr.current_value,
          'target_value', kr.target_value,
          'weight', kr.weight
        )
        order by kr.created_at, kr.id
      )
      from public.objective_key_results kr
      where kr.objective_id = p_objective_id
    ), '[]'::jsonb),
    auth.uid()
  )
  returning * into v_review;

  for v_project_id in
    select project_id
    from public.objective_project_links
    where objective_id = p_objective_id
  loop
    perform public.projectflow_append_audit_event(
      v_project_id,
      'project',
      'strategy_review_recorded',
      'objective_strategy_review',
      v_review.id::text,
      null,
      jsonb_build_object(
        'period_label', v_review.period_label,
        'assessment', v_review.assessment,
        'objective_progress_snapshot', v_review.objective_progress_snapshot,
        'delivery_progress_snapshot', v_review.delivery_progress_snapshot
      ),
      jsonb_build_object(
        'objective_id', p_objective_id,
        'source', 'strategy_review'
      )
    );
  end loop;

  return to_jsonb(v_review);
end;
$projectflow$;

revoke all on function public.record_objective_strategy_review(
  uuid, text, text, text, text
) from public;
grant execute on function public.record_objective_strategy_review(
  uuid, text, text, text, text
) to authenticated;

create or replace function public.list_strategy_review_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'benefits',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'objective_id', b.objective_id,
          'title', b.title,
          'description', b.description,
          'benefit_type', b.benefit_type,
          'status', b.status,
          'owner_user_id', b.owner_user_id,
          'owner_name', case
            when b.owner_user_id is null then null
            else coalesce(
              nullif(pr.full_name, ''),
              nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
              'مستخدم'
            )
          end,
          'target_date', b.target_date,
          'expected_outcome', b.expected_outcome,
          'realized_outcome', b.realized_outcome,
          'evidence', b.evidence,
          'realized_at', b.realized_at,
          'version', b.version,
          'created_at', b.created_at,
          'updated_at', b.updated_at
        )
        order by
          case b.status
            when 'realizing' then 0
            when 'planned' then 1
            when 'realized' then 2
            else 3
          end,
          b.target_date nulls last,
          b.updated_at desc
      )
      from public.objective_benefits b
      where public.projectflow_can_view_objective(b.objective_id)
    ), '[]'::jsonb),
    'reviews',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'objective_id', r.objective_id,
          'review_date', r.review_date,
          'period_label', r.period_label,
          'assessment', r.assessment,
          'summary', r.summary,
          'decisions_needed', r.decisions_needed,
          'objective_progress_snapshot', r.objective_progress_snapshot,
          'delivery_progress_snapshot', r.delivery_progress_snapshot,
          'active_risks_snapshot', r.active_risks_snapshot,
          'critical_risks_snapshot', r.critical_risks_snapshot,
          'pending_decisions_snapshot', r.pending_decisions_snapshot,
          'key_results_snapshot', r.key_results_snapshot,
          'created_by', r.created_by,
          'created_at', r.created_at
        )
        order by r.review_date desc, r.created_at desc
      )
      from public.objective_strategy_reviews r
      where public.projectflow_can_view_objective(r.objective_id)
    ), '[]'::jsonb)
  );
end;
$projectflow$;

revoke all on function public.list_strategy_review_data() from public;
grant execute on function public.list_strategy_review_data() to authenticated;
