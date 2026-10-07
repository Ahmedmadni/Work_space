-- Phase 41: Executive Governance Targets & Operating Rhythm.

insert into public.projectflow_schema_versions (version, label)
values (27, 'executive-governance-targets-operating-rhythm')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.executive_governance_targets (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  decision_resolution_target_pct numeric,
  max_deferred_rate_pct numeric,
  action_completion_target_pct numeric,
  max_overdue_open_rate_pct numeric,
  max_unowned_open_rate_pct numeric,
  on_time_completion_target_pct numeric,
  max_median_completion_days integer,
  max_repeated_deferrals integer,
  meeting_cadence_days integer,
  cadence_warning_days_before integer,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint executive_governance_targets_decision_resolution_check
    check (
      decision_resolution_target_pct is null
      or decision_resolution_target_pct between 0 and 100
    ),
  constraint executive_governance_targets_deferred_check
    check (
      max_deferred_rate_pct is null
      or max_deferred_rate_pct between 0 and 100
    ),
  constraint executive_governance_targets_action_completion_check
    check (
      action_completion_target_pct is null
      or action_completion_target_pct between 0 and 100
    ),
  constraint executive_governance_targets_overdue_check
    check (
      max_overdue_open_rate_pct is null
      or max_overdue_open_rate_pct between 0 and 100
    ),
  constraint executive_governance_targets_unowned_check
    check (
      max_unowned_open_rate_pct is null
      or max_unowned_open_rate_pct between 0 and 100
    ),
  constraint executive_governance_targets_on_time_check
    check (
      on_time_completion_target_pct is null
      or on_time_completion_target_pct between 0 and 100
    ),
  constraint executive_governance_targets_median_days_check
    check (
      max_median_completion_days is null
      or max_median_completion_days between 1 and 3650
    ),
  constraint executive_governance_targets_repeated_deferrals_check
    check (
      max_repeated_deferrals is null
      or max_repeated_deferrals between 0 and 10000
    ),
  constraint executive_governance_targets_cadence_check
    check (
      meeting_cadence_days is null
      or meeting_cadence_days between 1 and 366
    ),
  constraint executive_governance_targets_warning_check
    check (
      cadence_warning_days_before is null
      or cadence_warning_days_before between 0 and 90
    ),
  constraint executive_governance_targets_warning_with_cadence_check
    check (
      cadence_warning_days_before is null
      or meeting_cadence_days is not null
    ),
  constraint executive_governance_targets_warning_not_above_cadence_check
    check (
      cadence_warning_days_before is null
      or meeting_cadence_days is null
      or cadence_warning_days_before <= meeting_cadence_days
    )
);

create table if not exists public.executive_governance_target_history (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  version bigint not null,
  targets jsonb not null,
  changed_by uuid not null references auth.users(id) on delete cascade,
  changed_at timestamptz not null default now(),
  constraint executive_governance_target_history_targets_object_check
    check (jsonb_typeof(targets) = 'object'),
  unique(owner_user_id, version)
);

create index if not exists executive_governance_target_history_owner_idx
  on public.executive_governance_target_history(owner_user_id, version desc);

alter table public.executive_governance_targets enable row level security;
alter table public.executive_governance_target_history enable row level security;

revoke all on table public.executive_governance_targets
  from anon, authenticated;
revoke all on table public.executive_governance_target_history
  from anon, authenticated;

create or replace function public.projectflow_governance_targets_json(
  p_row public.executive_governance_targets
)
returns jsonb
language sql
stable
as $projectflow$
  select jsonb_build_object(
    'owner_user_id', p_row.owner_user_id,
    'decision_resolution_target_pct', p_row.decision_resolution_target_pct,
    'max_deferred_rate_pct', p_row.max_deferred_rate_pct,
    'action_completion_target_pct', p_row.action_completion_target_pct,
    'max_overdue_open_rate_pct', p_row.max_overdue_open_rate_pct,
    'max_unowned_open_rate_pct', p_row.max_unowned_open_rate_pct,
    'on_time_completion_target_pct', p_row.on_time_completion_target_pct,
    'max_median_completion_days', p_row.max_median_completion_days,
    'max_repeated_deferrals', p_row.max_repeated_deferrals,
    'meeting_cadence_days', p_row.meeting_cadence_days,
    'cadence_warning_days_before', p_row.cadence_warning_days_before,
    'version', p_row.version,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$projectflow$;

revoke all on function public.projectflow_governance_targets_json(
  public.executive_governance_targets
) from public;

create or replace function public.list_executive_governance_targets()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
declare
  v_profile public.executive_governance_targets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile
  from public.executive_governance_targets
  where owner_user_id = auth.uid();

  return jsonb_build_object(
    'profile',
    case
      when v_profile.owner_user_id is null then null
      else public.projectflow_governance_targets_json(v_profile)
    end,
    'history',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'owner_user_id', h.owner_user_id,
          'version', h.version,
          'targets', h.targets,
          'changed_by', h.changed_by,
          'changed_at', h.changed_at
        )
        order by h.version desc
      )
      from (
        select *
        from public.executive_governance_target_history
        where owner_user_id = auth.uid()
        order by version desc
        limit 25
      ) h
    ), '[]'::jsonb)
  );
end;
$projectflow$;

revoke all on function public.list_executive_governance_targets()
  from public;
grant execute on function public.list_executive_governance_targets()
  to authenticated;

create or replace function public.save_executive_governance_targets(
  p_expected_version bigint,
  p_decision_resolution_target_pct numeric,
  p_max_deferred_rate_pct numeric,
  p_action_completion_target_pct numeric,
  p_max_overdue_open_rate_pct numeric,
  p_max_unowned_open_rate_pct numeric,
  p_on_time_completion_target_pct numeric,
  p_max_median_completion_days integer,
  p_max_repeated_deferrals integer,
  p_meeting_cadence_days integer,
  p_cadence_warning_days_before integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_old public.executive_governance_targets%rowtype;
  v_new public.executive_governance_targets%rowtype;
  v_next_version bigint;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if
    (p_decision_resolution_target_pct is not null and
      (p_decision_resolution_target_pct < 0 or p_decision_resolution_target_pct > 100))
    or (p_max_deferred_rate_pct is not null and
      (p_max_deferred_rate_pct < 0 or p_max_deferred_rate_pct > 100))
    or (p_action_completion_target_pct is not null and
      (p_action_completion_target_pct < 0 or p_action_completion_target_pct > 100))
    or (p_max_overdue_open_rate_pct is not null and
      (p_max_overdue_open_rate_pct < 0 or p_max_overdue_open_rate_pct > 100))
    or (p_max_unowned_open_rate_pct is not null and
      (p_max_unowned_open_rate_pct < 0 or p_max_unowned_open_rate_pct > 100))
    or (p_on_time_completion_target_pct is not null and
      (p_on_time_completion_target_pct < 0 or p_on_time_completion_target_pct > 100))
    or (p_max_median_completion_days is not null and
      (p_max_median_completion_days < 1 or p_max_median_completion_days > 3650))
    or (p_max_repeated_deferrals is not null and
      (p_max_repeated_deferrals < 0 or p_max_repeated_deferrals > 10000))
    or (p_meeting_cadence_days is not null and
      (p_meeting_cadence_days < 1 or p_meeting_cadence_days > 366))
    or (p_cadence_warning_days_before is not null and
      (p_cadence_warning_days_before < 0 or p_cadence_warning_days_before > 90))
    or (p_cadence_warning_days_before is not null and
      p_meeting_cadence_days is null)
    or (
      p_cadence_warning_days_before is not null
      and p_meeting_cadence_days is not null
      and p_cadence_warning_days_before > p_meeting_cadence_days
    )
  then
    raise exception 'EXECUTIVE_GOVERNANCE_TARGETS_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_old
  from public.executive_governance_targets
  where owner_user_id = auth.uid()
  for update;

  if found then
    if p_expected_version is null or v_old.version <> p_expected_version then
      raise exception 'EXECUTIVE_GOVERNANCE_TARGETS_VERSION_MISMATCH'
        using errcode = '40001';
    end if;
    v_next_version := v_old.version + 1;

    update public.executive_governance_targets
    set
      decision_resolution_target_pct = p_decision_resolution_target_pct,
      max_deferred_rate_pct = p_max_deferred_rate_pct,
      action_completion_target_pct = p_action_completion_target_pct,
      max_overdue_open_rate_pct = p_max_overdue_open_rate_pct,
      max_unowned_open_rate_pct = p_max_unowned_open_rate_pct,
      on_time_completion_target_pct = p_on_time_completion_target_pct,
      max_median_completion_days = p_max_median_completion_days,
      max_repeated_deferrals = p_max_repeated_deferrals,
      meeting_cadence_days = p_meeting_cadence_days,
      cadence_warning_days_before = p_cadence_warning_days_before,
      version = v_next_version,
      updated_at = now()
    where owner_user_id = auth.uid()
    returning * into v_new;
  else
    if p_expected_version is not null then
      raise exception 'EXECUTIVE_GOVERNANCE_TARGETS_VERSION_MISMATCH'
        using errcode = '40001';
    end if;
    v_next_version := 1;

    insert into public.executive_governance_targets (
      owner_user_id,
      decision_resolution_target_pct,
      max_deferred_rate_pct,
      action_completion_target_pct,
      max_overdue_open_rate_pct,
      max_unowned_open_rate_pct,
      on_time_completion_target_pct,
      max_median_completion_days,
      max_repeated_deferrals,
      meeting_cadence_days,
      cadence_warning_days_before,
      version
    )
    values (
      auth.uid(),
      p_decision_resolution_target_pct,
      p_max_deferred_rate_pct,
      p_action_completion_target_pct,
      p_max_overdue_open_rate_pct,
      p_max_unowned_open_rate_pct,
      p_on_time_completion_target_pct,
      p_max_median_completion_days,
      p_max_repeated_deferrals,
      p_meeting_cadence_days,
      p_cadence_warning_days_before,
      v_next_version
    )
    returning * into v_new;
  end if;

  insert into public.executive_governance_target_history (
    owner_user_id,
    version,
    targets,
    changed_by
  )
  values (
    auth.uid(),
    v_new.version,
    public.projectflow_governance_targets_json(v_new),
    auth.uid()
  );

  return public.projectflow_governance_targets_json(v_new);
end;
$projectflow$;

revoke all on function public.save_executive_governance_targets(
  bigint, numeric, numeric, numeric, numeric, numeric, numeric,
  integer, integer, integer, integer
) from public;
grant execute on function public.save_executive_governance_targets(
  bigint, numeric, numeric, numeric, numeric, numeric, numeric,
  integer, integer, integer, integer
) to authenticated;
