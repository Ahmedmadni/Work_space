-- Phase 42: Governance Exceptions & Corrective Actions.

insert into public.projectflow_schema_versions (version, label)
values (28, 'governance-exceptions-corrective-actions')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.executive_governance_exceptions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  metric_key text not null
    check (
      metric_key in (
        'decision_resolution',
        'deferred_rate',
        'action_completion',
        'overdue_open',
        'unowned_open',
        'on_time_completion',
        'median_completion_days',
        'repeated_deferrals'
      )
    ),
  title text not null,
  rationale text not null,
  corrective_action text,
  responsible_name text,
  due_date date,
  status text not null default 'open'
    check (status in ('open','mitigating','accepted','resolved','cancelled')),
  actual_value numeric not null,
  target_value numeric not null,
  target_operator text not null
    check (target_operator in ('gte','lte')),
  target_unit text not null
    check (target_unit in ('%','days','count')),
  target_version bigint not null,
  source_window_meeting_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_window_meeting_ids) = 'array'),
  resolved_at timestamptz,
  version bigint not null default 1,
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists executive_governance_exception_active_metric_idx
  on public.executive_governance_exceptions(owner_user_id, metric_key)
  where status in ('open','mitigating','accepted');

create index if not exists executive_governance_exception_owner_status_idx
  on public.executive_governance_exceptions(owner_user_id, status, due_date);

create table if not exists public.executive_governance_exception_history (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null
    references public.executive_governance_exceptions(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  version bigint not null,
  snapshot jsonb not null
    check (jsonb_typeof(snapshot) = 'object'),
  changed_by uuid not null references auth.users(id) on delete cascade,
  changed_at timestamptz not null default now(),
  unique(exception_id, version)
);

create index if not exists executive_governance_exception_history_idx
  on public.executive_governance_exception_history(
    owner_user_id,
    exception_id,
    version desc
  );

alter table public.executive_governance_exceptions enable row level security;
alter table public.executive_governance_exception_history enable row level security;

revoke all on table public.executive_governance_exceptions
  from anon, authenticated;
revoke all on table public.executive_governance_exception_history
  from anon, authenticated;

create or replace function public.projectflow_governance_exception_json(
  p_row public.executive_governance_exceptions
)
returns jsonb
language sql
stable
as $projectflow$
  select jsonb_build_object(
    'id', p_row.id,
    'owner_user_id', p_row.owner_user_id,
    'metric_key', p_row.metric_key,
    'title', p_row.title,
    'rationale', p_row.rationale,
    'corrective_action', p_row.corrective_action,
    'responsible_name', p_row.responsible_name,
    'due_date', p_row.due_date,
    'status', p_row.status,
    'actual_value', p_row.actual_value,
    'target_value', p_row.target_value,
    'target_operator', p_row.target_operator,
    'target_unit', p_row.target_unit,
    'target_version', p_row.target_version,
    'source_window_meeting_ids', p_row.source_window_meeting_ids,
    'resolved_at', p_row.resolved_at,
    'version', p_row.version,
    'created_by', p_row.created_by,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$projectflow$;

revoke all on function public.projectflow_governance_exception_json(
  public.executive_governance_exceptions
) from public;

create or replace function public.list_executive_governance_exceptions()
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

  return jsonb_build_object(
    'exceptions',
    coalesce((
      select jsonb_agg(
        public.projectflow_governance_exception_json(e)
        order by
          case e.status
            when 'open' then 0
            when 'mitigating' then 1
            when 'accepted' then 2
            when 'resolved' then 3
            else 4
          end,
          e.due_date nulls last,
          e.updated_at desc
      )
      from public.executive_governance_exceptions e
      where e.owner_user_id = auth.uid()
    ), '[]'::jsonb),
    'history',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'exception_id', h.exception_id,
          'owner_user_id', h.owner_user_id,
          'version', h.version,
          'snapshot', h.snapshot,
          'changed_by', h.changed_by,
          'changed_at', h.changed_at
        )
        order by h.changed_at desc
      )
      from (
        select *
        from public.executive_governance_exception_history
        where owner_user_id = auth.uid()
        order by changed_at desc
        limit 50
      ) h
    ), '[]'::jsonb)
  );
end;
$projectflow$;

revoke all on function public.list_executive_governance_exceptions()
  from public;
grant execute on function public.list_executive_governance_exceptions()
  to authenticated;

create or replace function public.create_executive_governance_exception(
  p_expected_target_version bigint,
  p_metric_key text,
  p_title text,
  p_rationale text,
  p_corrective_action text,
  p_responsible_name text,
  p_due_date date,
  p_actual_value numeric,
  p_source_window_meeting_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_targets public.executive_governance_targets%rowtype;
  v_exception public.executive_governance_exceptions%rowtype;
  v_target numeric;
  v_operator text;
  v_unit text;
  v_meeting_id_text text;
  v_meeting_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_metric_key not in (
    'decision_resolution',
    'deferred_rate',
    'action_completion',
    'overdue_open',
    'unowned_open',
    'on_time_completion',
    'median_completion_days',
    'repeated_deferrals'
  )
  then
    raise exception 'GOVERNANCE_EXCEPTION_INVALID_METRIC'
      using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_title, ''))) not between 1 and 240
     or char_length(trim(coalesce(p_rationale, ''))) not between 1 and 6000
     or char_length(coalesce(p_corrective_action, '')) > 6000
     or char_length(coalesce(p_responsible_name, '')) > 180
     or p_actual_value is null
     or jsonb_typeof(coalesce(p_source_window_meeting_ids, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_source_window_meeting_ids, '[]'::jsonb))
        not between 1 and 3
  then
    raise exception 'GOVERNANCE_EXCEPTION_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_targets
  from public.executive_governance_targets
  where owner_user_id = auth.uid();

  if not found then
    raise exception 'GOVERNANCE_TARGETS_NOT_CONFIGURED'
      using errcode = '22023';
  end if;

  if p_expected_target_version is null
     or v_targets.version <> p_expected_target_version
  then
    raise exception 'EXECUTIVE_GOVERNANCE_TARGETS_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  case p_metric_key
    when 'decision_resolution' then
      v_target := v_targets.decision_resolution_target_pct;
      v_operator := 'gte';
      v_unit := '%';
    when 'deferred_rate' then
      v_target := v_targets.max_deferred_rate_pct;
      v_operator := 'lte';
      v_unit := '%';
    when 'action_completion' then
      v_target := v_targets.action_completion_target_pct;
      v_operator := 'gte';
      v_unit := '%';
    when 'overdue_open' then
      v_target := v_targets.max_overdue_open_rate_pct;
      v_operator := 'lte';
      v_unit := '%';
    when 'unowned_open' then
      v_target := v_targets.max_unowned_open_rate_pct;
      v_operator := 'lte';
      v_unit := '%';
    when 'on_time_completion' then
      v_target := v_targets.on_time_completion_target_pct;
      v_operator := 'gte';
      v_unit := '%';
    when 'median_completion_days' then
      v_target := v_targets.max_median_completion_days;
      v_operator := 'lte';
      v_unit := 'days';
    when 'repeated_deferrals' then
      v_target := v_targets.max_repeated_deferrals;
      v_operator := 'lte';
      v_unit := 'count';
  end case;

  if v_target is null then
    raise exception 'GOVERNANCE_EXCEPTION_TARGET_NOT_CONFIGURED'
      using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_array_elements_text(p_source_window_meeting_ids)
  ) <> (
    select count(distinct value)
    from jsonb_array_elements_text(p_source_window_meeting_ids)
  )
  then
    raise exception 'GOVERNANCE_EXCEPTION_DUPLICATE_MEETING_IDS'
      using errcode = '22023';
  end if;

  if (v_operator = 'gte' and p_actual_value >= v_target)
     or (v_operator = 'lte' and p_actual_value <= v_target)
  then
    raise exception 'GOVERNANCE_EXCEPTION_TARGET_NOT_BREACHED'
      using errcode = '22023';
  end if;

  for v_meeting_id_text in
    select value
    from jsonb_array_elements_text(p_source_window_meeting_ids)
  loop
    begin
      v_meeting_id := v_meeting_id_text::uuid;
    exception when invalid_text_representation then
      raise exception 'GOVERNANCE_EXCEPTION_INVALID_MEETING_ID'
        using errcode = '22023';
    end;

    if not exists (
      select 1
      from public.executive_strategy_meetings m
      where m.id = v_meeting_id
        and m.status = 'completed'
        and public.projectflow_can_view_executive_meeting(m.id)
    )
    then
      raise exception 'GOVERNANCE_EXCEPTION_MEETING_DENIED'
        using errcode = '42501';
    end if;
  end loop;

  insert into public.executive_governance_exceptions (
    owner_user_id,
    metric_key,
    title,
    rationale,
    corrective_action,
    responsible_name,
    due_date,
    status,
    actual_value,
    target_value,
    target_operator,
    target_unit,
    target_version,
    source_window_meeting_ids,
    created_by
  )
  values (
    auth.uid(),
    p_metric_key,
    trim(p_title),
    trim(p_rationale),
    nullif(trim(coalesce(p_corrective_action, '')), ''),
    nullif(trim(coalesce(p_responsible_name, '')), ''),
    p_due_date,
    'open',
    p_actual_value,
    v_target,
    v_operator,
    v_unit,
    v_targets.version,
    p_source_window_meeting_ids,
    auth.uid()
  )
  returning * into v_exception;

  insert into public.executive_governance_exception_history (
    exception_id,
    owner_user_id,
    version,
    snapshot,
    changed_by
  )
  values (
    v_exception.id,
    auth.uid(),
    v_exception.version,
    public.projectflow_governance_exception_json(v_exception),
    auth.uid()
  );

  return public.projectflow_governance_exception_json(v_exception);
end;
$projectflow$;

revoke all on function public.create_executive_governance_exception(
  bigint, text, text, text, text, text, date, numeric, jsonb
) from public;
grant execute on function public.create_executive_governance_exception(
  bigint, text, text, text, text, text, date, numeric, jsonb
) to authenticated;

create or replace function public.update_executive_governance_exception(
  p_exception_id uuid,
  p_expected_version bigint,
  p_title text,
  p_rationale text,
  p_corrective_action text,
  p_responsible_name text,
  p_due_date date,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_old public.executive_governance_exceptions%rowtype;
  v_new public.executive_governance_exceptions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_status not in ('open','mitigating','accepted','resolved','cancelled')
     or char_length(trim(coalesce(p_title, ''))) not between 1 and 240
     or char_length(trim(coalesce(p_rationale, ''))) not between 1 and 6000
     or char_length(coalesce(p_corrective_action, '')) > 6000
     or char_length(coalesce(p_responsible_name, '')) > 180
  then
    raise exception 'GOVERNANCE_EXCEPTION_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_old
  from public.executive_governance_exceptions
  where id = p_exception_id
    and owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'GOVERNANCE_EXCEPTION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if p_expected_version is null or v_old.version <> p_expected_version then
    raise exception 'GOVERNANCE_EXCEPTION_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  update public.executive_governance_exceptions
  set
    title = trim(p_title),
    rationale = trim(p_rationale),
    corrective_action = nullif(trim(coalesce(p_corrective_action, '')), ''),
    responsible_name = nullif(trim(coalesce(p_responsible_name, '')), ''),
    due_date = p_due_date,
    status = p_status,
    resolved_at = case
      when p_status = 'resolved' and v_old.status <> 'resolved' then now()
      when p_status = 'resolved' then v_old.resolved_at
      else null
    end,
    version = version + 1,
    updated_at = now()
  where id = p_exception_id
  returning * into v_new;

  insert into public.executive_governance_exception_history (
    exception_id,
    owner_user_id,
    version,
    snapshot,
    changed_by
  )
  values (
    v_new.id,
    auth.uid(),
    v_new.version,
    public.projectflow_governance_exception_json(v_new),
    auth.uid()
  );

  return public.projectflow_governance_exception_json(v_new);
end;
$projectflow$;

revoke all on function public.update_executive_governance_exception(
  uuid, bigint, text, text, text, text, date, text
) from public;
grant execute on function public.update_executive_governance_exception(
  uuid, bigint, text, text, text, text, date, text
) to authenticated;
