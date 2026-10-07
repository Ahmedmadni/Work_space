-- Phase 45: Assurance Review Cadence & Reminders.

insert into public.projectflow_schema_versions (version, label)
values (31, 'assurance-review-cadence-reminders')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.executive_governance_assurance_cadence (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  review_interval_days integer not null
    check (review_interval_days between 1 and 366),
  warning_days_before integer
    check (warning_days_before is null or warning_days_before between 0 and 90),
  first_due_date date not null,
  is_enabled boolean not null default true,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint executive_governance_assurance_warning_not_above_interval_check
    check (
      warning_days_before is null
      or warning_days_before <= review_interval_days
    )
);

alter table public.executive_governance_assurance_cadence enable row level security;
revoke all on table public.executive_governance_assurance_cadence
  from anon, authenticated;

create or replace function public.projectflow_governance_assurance_cadence_json(
  p_row public.executive_governance_assurance_cadence
)
returns jsonb
language sql
stable
as $projectflow$
  select jsonb_build_object(
    'owner_user_id', p_row.owner_user_id,
    'review_interval_days', p_row.review_interval_days,
    'warning_days_before', p_row.warning_days_before,
    'first_due_date', p_row.first_due_date,
    'is_enabled', p_row.is_enabled,
    'version', p_row.version,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$projectflow$;

revoke all on function public.projectflow_governance_assurance_cadence_json(
  public.executive_governance_assurance_cadence
) from public;

create or replace function public.projectflow_governance_assurance_cadence_state(
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
declare
  v_cadence public.executive_governance_assurance_cadence%rowtype;
  v_latest_review_date date;
  v_latest_review_id uuid;
  v_next_due date;
  v_warning_date date;
  v_days_to_due integer;
  v_status text;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'profile', null,
      'latest_finalized_review_id', null,
      'latest_finalized_review_date', null,
      'next_due_date', null,
      'warning_date', null,
      'days_to_due', null,
      'status', 'no_cadence'
    );
  end if;

  select * into v_cadence
  from public.executive_governance_assurance_cadence
  where owner_user_id = p_user_id;

  if not found then
    return jsonb_build_object(
      'profile', null,
      'latest_finalized_review_id', null,
      'latest_finalized_review_date', null,
      'next_due_date', null,
      'warning_date', null,
      'days_to_due', null,
      'status', 'no_cadence'
    );
  end if;

  select r.id, r.review_date
  into v_latest_review_id, v_latest_review_date
  from public.executive_governance_reviews r
  where r.owner_user_id = p_user_id
    and r.status = 'finalized'
  order by r.review_date desc, r.finalized_at desc nulls last, r.created_at desc
  limit 1;

  if not v_cadence.is_enabled then
    return jsonb_build_object(
      'profile', public.projectflow_governance_assurance_cadence_json(v_cadence),
      'latest_finalized_review_id', v_latest_review_id,
      'latest_finalized_review_date', v_latest_review_date,
      'next_due_date', null,
      'warning_date', null,
      'days_to_due', null,
      'status', 'disabled'
    );
  end if;

  v_next_due := case
    when v_latest_review_date is null then v_cadence.first_due_date
    else v_latest_review_date + v_cadence.review_interval_days
  end;

  v_warning_date := case
    when v_cadence.warning_days_before is null then null
    else v_next_due - v_cadence.warning_days_before
  end;

  v_days_to_due := v_next_due - current_date;
  v_status := case
    when current_date > v_next_due then 'overdue'
    when v_warning_date is not null
      and current_date >= v_warning_date
      and current_date <= v_next_due
      then 'due_soon'
    else 'on_schedule'
  end;

  return jsonb_build_object(
    'profile', public.projectflow_governance_assurance_cadence_json(v_cadence),
    'latest_finalized_review_id', v_latest_review_id,
    'latest_finalized_review_date', v_latest_review_date,
    'next_due_date', v_next_due,
    'warning_date', v_warning_date,
    'days_to_due', v_days_to_due,
    'status', v_status
  );
end;
$projectflow$;

revoke all on function public.projectflow_governance_assurance_cadence_state(uuid)
  from public;

create or replace function public.list_executive_governance_assurance_cadence()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return public.projectflow_governance_assurance_cadence_state(auth.uid());
end;
$projectflow$;

revoke all on function public.list_executive_governance_assurance_cadence()
  from public;
grant execute on function public.list_executive_governance_assurance_cadence()
  to authenticated;

create or replace function public.save_executive_governance_assurance_cadence(
  p_expected_version bigint,
  p_review_interval_days integer,
  p_warning_days_before integer,
  p_first_due_date date,
  p_is_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_old public.executive_governance_assurance_cadence%rowtype;
  v_new public.executive_governance_assurance_cadence%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_review_interval_days is null
     or p_review_interval_days not between 1 and 366
     or p_warning_days_before is not null
        and p_warning_days_before not between 0 and 90
     or p_warning_days_before is not null
        and p_warning_days_before > p_review_interval_days
     or p_first_due_date is null
     or p_is_enabled is null
  then
    raise exception 'GOVERNANCE_ASSURANCE_CADENCE_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_old
  from public.executive_governance_assurance_cadence
  where owner_user_id = auth.uid()
  for update;

  if found then
    if p_expected_version is null or v_old.version <> p_expected_version then
      raise exception 'GOVERNANCE_ASSURANCE_CADENCE_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    update public.executive_governance_assurance_cadence
    set
      review_interval_days = p_review_interval_days,
      warning_days_before = p_warning_days_before,
      first_due_date = p_first_due_date,
      is_enabled = p_is_enabled,
      version = version + 1,
      updated_at = now()
    where owner_user_id = auth.uid()
    returning * into v_new;
  else
    if p_expected_version is not null then
      raise exception 'GOVERNANCE_ASSURANCE_CADENCE_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    insert into public.executive_governance_assurance_cadence (
      owner_user_id,
      review_interval_days,
      warning_days_before,
      first_due_date,
      is_enabled
    )
    values (
      auth.uid(),
      p_review_interval_days,
      p_warning_days_before,
      p_first_due_date,
      p_is_enabled
    )
    returning * into v_new;
  end if;

  return public.projectflow_governance_assurance_cadence_state(auth.uid());
end;
$projectflow$;

revoke all on function public.save_executive_governance_assurance_cadence(
  bigint, integer, integer, date, boolean
) from public;
grant execute on function public.save_executive_governance_assurance_cadence(
  bigint, integer, integer, date, boolean
) to authenticated;

create or replace function public.projectflow_governance_assurance_notification_project(
  p_user_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
declare
  v_review public.executive_governance_reviews%rowtype;
  v_project_id text;
  v_latest record;
begin
  select * into v_review
  from public.executive_governance_reviews r
  where r.owner_user_id = p_user_id
    and r.status = 'finalized'
  order by r.review_date desc, r.finalized_at desc nulls last, r.created_at desc
  limit 1;

  if found then
    v_project_id := public.projectflow_governance_notification_project(
      p_user_id,
      v_review.source_window_meeting_ids
    );
    if v_project_id is not null then
      return v_project_id;
    end if;
  end if;

  select * into v_latest
  from public.projectflow_latest_user_executive_meeting(p_user_id);

  if found then
    return v_latest.project_id;
  end if;

  return null;
end;
$projectflow$;

revoke all on function public.projectflow_governance_assurance_notification_project(uuid)
  from public;

create or replace function public.refresh_governance_assurance_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_state jsonb;
  v_profile jsonb;
  v_status text;
  v_event text;
  v_next_due date;
  v_project_id text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_state := public.projectflow_governance_assurance_cadence_state(auth.uid());
  v_profile := v_state->'profile';
  v_status := coalesce(v_state->>'status', '');

  if v_status not in ('due_soon','overdue') then
    return 0;
  end if;

  v_project_id :=
    public.projectflow_governance_assurance_notification_project(auth.uid());

  if v_project_id is null then
    return 0;
  end if;

  v_next_due := nullif(v_state->>'next_due_date', '')::date;
  v_event := case
    when v_status = 'overdue' then 'assurance_review_overdue'
    else 'assurance_review_due_soon'
  end;

  v_id := public.enqueue_user_notification(
    auth.uid(),
    v_project_id,
    'governance_alert',
    null,
    null,
    null,
    null,
    null,
    jsonb_build_object(
      'event', v_event,
      'next_due_date', v_next_due,
      'warning_date', nullif(v_state->>'warning_date', '')::date,
      'days_to_due', nullif(v_state->>'days_to_due', '')::integer,
      'latest_finalized_review_id',
        nullif(v_state->>'latest_finalized_review_id', '')::uuid,
      'latest_finalized_review_date',
        nullif(v_state->>'latest_finalized_review_date', '')::date,
      'review_interval_days',
        nullif(v_profile->>'review_interval_days', '')::integer,
      'warning_days_before',
        nullif(v_profile->>'warning_days_before', '')::integer,
      'cadence_version',
        nullif(v_profile->>'version', '')::bigint
    ),
    'governance-assurance:' || auth.uid()::text || ':' ||
      v_next_due::text || ':' || v_event
  );

  return case when v_id is null then 0 else 1 end;
end;
$projectflow$;

revoke all on function public.refresh_governance_assurance_notifications()
  from public;
grant execute on function public.refresh_governance_assurance_notifications()
  to authenticated;

create or replace function public.refresh_all_governance_assurance_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_cadence public.executive_governance_assurance_cadence%rowtype;
  v_state jsonb;
  v_status text;
  v_event text;
  v_next_due date;
  v_project_id text;
  v_id uuid;
  v_inserted integer := 0;
begin
  for v_cadence in
    select *
    from public.executive_governance_assurance_cadence
    where is_enabled = true
  loop
    v_state :=
      public.projectflow_governance_assurance_cadence_state(v_cadence.owner_user_id);
    v_status := coalesce(v_state->>'status', '');

    if v_status not in ('due_soon','overdue') then
      continue;
    end if;

    v_project_id :=
      public.projectflow_governance_assurance_notification_project(
        v_cadence.owner_user_id
      );

    if v_project_id is null then
      continue;
    end if;

    v_next_due := nullif(v_state->>'next_due_date', '')::date;
    v_event := case
      when v_status = 'overdue' then 'assurance_review_overdue'
      else 'assurance_review_due_soon'
    end;

    v_id := public.enqueue_user_notification(
      v_cadence.owner_user_id,
      v_project_id,
      'governance_alert',
      null,
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'event', v_event,
        'next_due_date', v_next_due,
        'warning_date', nullif(v_state->>'warning_date', '')::date,
        'days_to_due', nullif(v_state->>'days_to_due', '')::integer,
        'latest_finalized_review_id',
          nullif(v_state->>'latest_finalized_review_id', '')::uuid,
        'latest_finalized_review_date',
          nullif(v_state->>'latest_finalized_review_date', '')::date,
        'review_interval_days', v_cadence.review_interval_days,
        'warning_days_before', v_cadence.warning_days_before,
        'cadence_version', v_cadence.version,
        'source', 'server_scheduler'
      ),
      'governance-assurance:' || v_cadence.owner_user_id::text || ':' ||
        v_next_due::text || ':' || v_event
    );

    if v_id is not null then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$projectflow$;

revoke all on function public.refresh_all_governance_assurance_notifications()
  from public;

do $projectflow$
declare
  v_job_id bigint;
  v_installed boolean := false;
begin
  begin
    if exists (
      select 1
      from pg_available_extensions
      where name = 'pg_cron'
    ) and not exists (
      select 1
      from pg_extension
      where extname = 'pg_cron'
    ) then
      execute 'create extension if not exists pg_cron';
    end if;
  exception when others then
    null;
  end;

  select exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) into v_installed;

  if v_installed and to_regnamespace('cron') is not null then
    begin
      for v_job_id in
        execute 'select jobid from cron.job where jobname = ''projectflow-governance-assurance'''
      loop
        execute 'select cron.unschedule($1)' using v_job_id;
      end loop;

      execute 'select cron.schedule($1, $2, $3)'
        into v_job_id
        using
          'projectflow-governance-assurance',
          '50 * * * *',
          'select public.refresh_all_governance_assurance_notifications();';
    exception when others then
      null;
    end;
  end if;
end;
$projectflow$;
