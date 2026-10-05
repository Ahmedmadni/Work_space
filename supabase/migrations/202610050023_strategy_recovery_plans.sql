-- Phase 34: Strategy Commitments & Recovery Plans.

insert into public.projectflow_schema_versions (version, label)
values (23, 'strategy-commitments-recovery-plans')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.objective_recovery_plans (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.portfolio_objectives(id) on delete cascade,
  title text not null,
  summary text,
  success_criteria text,
  trigger_reason text not null default 'manual'
    check (trigger_reason in ('manual','projected_late','stalled','overdue')),
  status text not null default 'active'
    check (status in ('draft','active','recovered','closed','cancelled')),
  owner_user_id uuid references auth.users(id) on delete set null,
  target_recovery_date date,
  baseline_objective_progress numeric,
  baseline_daily_progress_rate numeric,
  baseline_review_count integer not null default 0,
  activated_at timestamptz,
  recovered_at timestamptz,
  closed_at timestamptz,
  version bigint not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recovery_commitments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.objective_recovery_plans(id) on delete cascade,
  title text not null,
  description text,
  owner_user_id uuid references auth.users(id) on delete set null,
  due_date date,
  status text not null default 'open'
    check (status in ('open','in_progress','done','cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists objective_recovery_plans_objective_status_idx
  on public.objective_recovery_plans(objective_id, status, target_recovery_date);
create index if not exists recovery_commitments_plan_status_idx
  on public.recovery_commitments(plan_id, status, due_date);
create index if not exists recovery_commitments_owner_idx
  on public.recovery_commitments(owner_user_id, status, due_date);

alter table public.objective_recovery_plans enable row level security;
alter table public.recovery_commitments enable row level security;

revoke all on table public.objective_recovery_plans from anon, authenticated;
revoke all on table public.recovery_commitments from anon, authenticated;

create or replace function public.projectflow_user_in_objective_projects(
  p_objective_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $projectflow$
  select p_user_id is not null and exists (
    select 1
    from public.objective_project_links opl
    join public.projects p on p.id = opl.project_id
    where opl.objective_id = p_objective_id
      and (
        p.created_by = p_user_id
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = opl.project_id
            and pm.user_id = p_user_id
        )
      )
  );
$projectflow$;

revoke all on function public.projectflow_user_in_objective_projects(uuid, uuid)
  from public;

create or replace function public.projectflow_objective_trend_rate(
  p_objective_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $projectflow$
  with ranked as (
    select distinct on (r.review_date)
      r.review_date,
      r.objective_progress_snapshot,
      r.created_at
    from public.objective_strategy_reviews r
    where r.objective_id = p_objective_id
      and r.objective_progress_snapshot is not null
    order by r.review_date desc, r.created_at desc
    limit 6
  ),
  ordered as (
    select
      review_date,
      objective_progress_snapshot::double precision as progress,
      extract(epoch from review_date::timestamp) / 86400.0 as day_number
    from ranked
    order by review_date
  )
  select case
    when count(*) < 2
      or max(review_date) = min(review_date)
      then null
    else regr_slope(progress, day_number)::numeric
  end
  from ordered;
$projectflow$;

revoke all on function public.projectflow_objective_trend_rate(uuid)
  from public;

create or replace function public.save_objective_recovery_plan(
  p_objective_id uuid,
  p_plan_id uuid,
  p_expected_version bigint,
  p_title text,
  p_summary text,
  p_success_criteria text,
  p_trigger_reason text,
  p_status text,
  p_owner_user_id uuid,
  p_target_recovery_date date,
  p_commitments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_id uuid := coalesce(p_plan_id, gen_random_uuid());
  v_old public.objective_recovery_plans%rowtype;
  v_new public.objective_recovery_plans%rowtype;
  v_commitment jsonb;
  v_commitment_id uuid;
  v_existing public.recovery_commitments%rowtype;
  v_project_id text;
  v_review_count integer := 0;
  v_baseline_progress numeric;
  v_baseline_rate numeric;
  v_title text := trim(coalesce(p_title, ''));
  v_summary text := nullif(trim(coalesce(p_summary, '')), '');
  v_success text := nullif(trim(coalesce(p_success_criteria, '')), '');
  v_seen_ids uuid[] := array[]::uuid[];
  v_owner uuid;
  v_status text;
begin
  if not public.projectflow_can_edit_objective(p_objective_id) then
    raise exception 'RECOVERY_PLAN_EDIT_DENIED' using errcode = '42501';
  end if;

  if char_length(v_title) not between 1 and 200
     or char_length(coalesce(v_summary, '')) > 7000
     or char_length(coalesce(v_success, '')) > 5000
     or p_trigger_reason not in ('manual','projected_late','stalled','overdue')
     or p_status not in ('draft','active','recovered','closed','cancelled')
     or jsonb_typeof(coalesce(p_commitments, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_commitments, '[]'::jsonb)) > 100
  then
    raise exception 'RECOVERY_PLAN_INVALID_INPUT' using errcode = '22023';
  end if;

  if p_owner_user_id is not null
     and p_owner_user_id <> auth.uid()
     and not public.projectflow_user_in_objective_projects(
       p_objective_id,
       p_owner_user_id
     )
  then
    raise exception 'RECOVERY_PLAN_OWNER_INVALID' using errcode = '22023';
  end if;

  select
    public.projectflow_objective_progress(p_objective_id),
    public.projectflow_objective_trend_rate(p_objective_id),
    (
      select count(*)
      from public.objective_strategy_reviews r
      where r.objective_id = p_objective_id
        and r.objective_progress_snapshot is not null
    )
  into
    v_baseline_progress,
    v_baseline_rate,
    v_review_count;

  if p_plan_id is null then
    insert into public.objective_recovery_plans (
      id,
      objective_id,
      title,
      summary,
      success_criteria,
      trigger_reason,
      status,
      owner_user_id,
      target_recovery_date,
      baseline_objective_progress,
      baseline_daily_progress_rate,
      baseline_review_count,
      activated_at,
      recovered_at,
      closed_at,
      created_by
    )
    values (
      v_id,
      p_objective_id,
      v_title,
      v_summary,
      v_success,
      p_trigger_reason,
      p_status,
      p_owner_user_id,
      p_target_recovery_date,
      v_baseline_progress,
      v_baseline_rate,
      v_review_count,
      case when p_status = 'active' then now() else null end,
      case when p_status = 'recovered' then now() else null end,
      case when p_status = 'closed' then now() else null end,
      auth.uid()
    )
    returning * into v_new;
  else
    select * into v_old
    from public.objective_recovery_plans
    where id = p_plan_id
      and objective_id = p_objective_id
    for update;

    if not found then
      raise exception 'RECOVERY_PLAN_NOT_FOUND' using errcode = 'P0002';
    end if;

    if p_expected_version is null or v_old.version <> p_expected_version then
      raise exception 'RECOVERY_PLAN_VERSION_MISMATCH' using errcode = '40001';
    end if;

    update public.objective_recovery_plans
    set
      title = v_title,
      summary = v_summary,
      success_criteria = v_success,
      trigger_reason = p_trigger_reason,
      status = p_status,
      owner_user_id = p_owner_user_id,
      target_recovery_date = p_target_recovery_date,
      activated_at = case
        when p_status = 'active' and v_old.status <> 'active' then now()
        when p_status = 'active' then v_old.activated_at
        else v_old.activated_at
      end,
      recovered_at = case
        when p_status = 'recovered' and v_old.status <> 'recovered' then now()
        when p_status = 'recovered' then v_old.recovered_at
        when p_status in ('draft','active') then null
        else v_old.recovered_at
      end,
      closed_at = case
        when p_status = 'closed' and v_old.status <> 'closed' then now()
        when p_status = 'closed' then v_old.closed_at
        when p_status in ('draft','active','recovered') then null
        else v_old.closed_at
      end,
      version = version + 1,
      updated_at = now()
    where id = p_plan_id
    returning * into v_new;
  end if;

  for v_commitment in
    select value
    from jsonb_array_elements(coalesce(p_commitments, '[]'::jsonb))
  loop
    if char_length(trim(coalesce(v_commitment->>'title', ''))) not between 1 and 200
       or char_length(coalesce(v_commitment->>'description', '')) > 4000
       or coalesce(v_commitment->>'status', 'open')
          not in ('open','in_progress','done','cancelled')
    then
      raise exception 'RECOVERY_COMMITMENT_INVALID_INPUT' using errcode = '22023';
    end if;

    begin
      v_commitment_id :=
        coalesce(nullif(v_commitment->>'id', '')::uuid, gen_random_uuid());
    exception when invalid_text_representation then
      raise exception 'RECOVERY_COMMITMENT_INVALID_ID' using errcode = '22023';
    end;

    begin
      v_owner := nullif(v_commitment->>'owner_user_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'RECOVERY_COMMITMENT_OWNER_INVALID' using errcode = '22023';
    end;

    if v_owner is not null
       and v_owner <> auth.uid()
       and not public.projectflow_user_in_objective_projects(
         p_objective_id,
         v_owner
       )
    then
      raise exception 'RECOVERY_COMMITMENT_OWNER_INVALID' using errcode = '22023';
    end if;

    v_status := coalesce(v_commitment->>'status', 'open');

    select * into v_existing
    from public.recovery_commitments
    where id = v_commitment_id
      and plan_id = v_id
    for update;

    if found then
      update public.recovery_commitments
      set
        title = trim(v_commitment->>'title'),
        description = nullif(trim(coalesce(v_commitment->>'description', '')), ''),
        owner_user_id = v_owner,
        due_date = case
          when nullif(v_commitment->>'due_date', '') is null then null
          else (v_commitment->>'due_date')::date
        end,
        status = v_status,
        completed_at = case
          when v_status = 'done' and v_existing.status <> 'done' then now()
          when v_status = 'done' then v_existing.completed_at
          when v_status in ('open','in_progress') then null
          else v_existing.completed_at
        end,
        updated_at = now()
      where id = v_commitment_id;
    else
      insert into public.recovery_commitments (
        id,
        plan_id,
        title,
        description,
        owner_user_id,
        due_date,
        status,
        completed_at
      )
      values (
        v_commitment_id,
        v_id,
        trim(v_commitment->>'title'),
        nullif(trim(coalesce(v_commitment->>'description', '')), ''),
        v_owner,
        case
          when nullif(v_commitment->>'due_date', '') is null then null
          else (v_commitment->>'due_date')::date
        end,
        v_status,
        case when v_status = 'done' then now() else null end
      );
    end if;

    v_seen_ids := array_append(v_seen_ids, v_commitment_id);
  end loop;

  -- Commitments are soft-cancelled rather than deleted to preserve history.
  update public.recovery_commitments
  set
    status = 'cancelled',
    updated_at = now()
  where plan_id = v_id
    and not (id = any(v_seen_ids))
    and status <> 'cancelled';

  for v_project_id in
    select project_id
    from public.objective_project_links
    where objective_id = p_objective_id
  loop
    perform public.projectflow_append_audit_event(
      v_project_id,
      'project',
      case when p_plan_id is null
        then 'recovery_plan_created'
        else 'recovery_plan_updated'
      end,
      'objective_recovery_plan',
      v_id::text,
      case when p_plan_id is null then null else
        jsonb_build_object(
          'title', v_old.title,
          'status', v_old.status,
          'owner_user_id', v_old.owner_user_id,
          'target_recovery_date', v_old.target_recovery_date
        )
      end,
      jsonb_build_object(
        'title', v_new.title,
        'status', v_new.status,
        'owner_user_id', v_new.owner_user_id,
        'target_recovery_date', v_new.target_recovery_date,
        'commitment_count', jsonb_array_length(coalesce(p_commitments, '[]'::jsonb))
      ),
      jsonb_build_object(
        'objective_id', p_objective_id,
        'trigger_reason', v_new.trigger_reason,
        'source', 'strategy_recovery'
      )
    );

    insert into public.project_activity (
      project_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      v_project_id,
      auth.uid(),
      case when p_plan_id is null
        then 'recovery_plan_created'
        else 'recovery_plan_updated'
      end,
      'objective_recovery_plan',
      v_id::text,
      jsonb_build_object(
        'objective_id', p_objective_id,
        'title', v_new.title,
        'status', v_new.status,
        'target_recovery_date', v_new.target_recovery_date
      )
    );
  end loop;

  return jsonb_build_object(
    'id', v_new.id,
    'version', v_new.version
  );
end;
$projectflow$;

revoke all on function public.save_objective_recovery_plan(
  uuid, uuid, bigint, text, text, text, text, text, uuid, date, jsonb
) from public;
grant execute on function public.save_objective_recovery_plan(
  uuid, uuid, bigint, text, text, text, text, text, uuid, date, jsonb
) to authenticated;

create or replace function public.list_objective_recovery_plans()
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
    'plans',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', rp.id,
          'objective_id', rp.objective_id,
          'title', rp.title,
          'summary', rp.summary,
          'success_criteria', rp.success_criteria,
          'trigger_reason', rp.trigger_reason,
          'status', rp.status,
          'owner_user_id', rp.owner_user_id,
          'owner_name', case
            when rp.owner_user_id is null then null
            else coalesce(
              nullif(pr.full_name, ''),
              nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
              'مستخدم'
            )
          end,
          'target_recovery_date', rp.target_recovery_date,
          'baseline_objective_progress', rp.baseline_objective_progress,
          'baseline_daily_progress_rate', rp.baseline_daily_progress_rate,
          'baseline_review_count', rp.baseline_review_count,
          'activated_at', rp.activated_at,
          'recovered_at', rp.recovered_at,
          'closed_at', rp.closed_at,
          'version', rp.version,
          'created_by', rp.created_by,
          'created_at', rp.created_at,
          'updated_at', rp.updated_at,
          'commitments', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', rc.id,
                'title', rc.title,
                'description', rc.description,
                'owner_user_id', rc.owner_user_id,
                'owner_name', case
                  when rc.owner_user_id is null then null
                  else coalesce(
                    nullif(cpr.full_name, ''),
                    nullif(split_part(coalesce(cu.email, ''), '@', 1), ''),
                    'مستخدم'
                  )
                end,
                'due_date', rc.due_date,
                'status', rc.status,
                'completed_at', rc.completed_at,
                'created_at', rc.created_at,
                'updated_at', rc.updated_at
              )
              order by
                case rc.status
                  when 'in_progress' then 0
                  when 'open' then 1
                  when 'done' then 2
                  else 3
                end,
                rc.due_date nulls last,
                rc.created_at
            )
            from public.recovery_commitments rc
            left join auth.users cu on cu.id = rc.owner_user_id
            left join public.profiles cpr on cpr.id = rc.owner_user_id
            where rc.plan_id = rp.id
          ), '[]'::jsonb)
        )
        order by
          case rp.status
            when 'active' then 0
            when 'draft' then 1
            when 'recovered' then 2
            when 'closed' then 3
            else 4
          end,
          rp.target_recovery_date nulls last,
          rp.updated_at desc
      )
      from public.objective_recovery_plans rp
      left join auth.users u on u.id = rp.owner_user_id
      left join public.profiles pr on pr.id = rp.owner_user_id
      where public.projectflow_can_view_objective(rp.objective_id)
    ), '[]'::jsonb)
  );
end;
$projectflow$;

revoke all on function public.list_objective_recovery_plans() from public;
grant execute on function public.list_objective_recovery_plans() to authenticated;
