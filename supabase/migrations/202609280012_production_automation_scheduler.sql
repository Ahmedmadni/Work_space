-- Phase 19: production automation scheduler and reliability.
-- Server-side scheduler, retries, health diagnostics, and dry-run previews.

alter table public.project_automation_runs
  add column if not exists attempt_count integer not null default 1,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_attempt_at timestamptz not null default now();

alter table public.project_automation_runs
  drop constraint if exists project_automation_runs_attempt_count_check;
alter table public.project_automation_runs
  add constraint project_automation_runs_attempt_count_check
  check (attempt_count >= 1 and max_attempts >= attempt_count);

create index if not exists project_automation_runs_retry_idx
  on public.project_automation_runs(next_retry_at, created_at)
  where status = 'failed'
    and next_retry_at is not null;

create table if not exists public.project_automation_scheduler_state (
  id smallint primary key default 1 check (id = 1),
  scheduler_mode text not null default 'active_app_fallback'
    check (scheduler_mode in ('pg_cron','active_app_fallback')),
  cron_job_name text,
  cron_job_id bigint,
  last_tick_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  last_duration_ms integer,
  running_since timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.project_automation_scheduler_state (id)
values (1)
on conflict (id) do nothing;

alter table public.project_automation_scheduler_state enable row level security;
revoke all on public.project_automation_scheduler_state from authenticated;

create or replace function public.projectflow_automation_retry_delay(
  p_attempt integer
)
returns interval
language sql
immutable
as $projectflow$
  select make_interval(
    mins => least(60, greatest(1, power(2, greatest(0, p_attempt - 1))::integer))
  );
$projectflow$;

revoke all on function public.projectflow_automation_retry_delay(integer)
  from public;

create or replace function public.projectflow_execute_automation_run_action(
  p_run_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_run public.project_automation_runs%rowtype;
  v_rule public.project_automation_rules%rowtype;
  v_project_id text;
  v_title text;
  v_status text;
  v_due_date date;
  v_recipient uuid;
  v_recipient_count integer := 0;
  v_changed boolean := false;
  v_revision bigint;
  v_rule_context text;
begin
  select * into v_run
  from public.project_automation_runs
  where id = p_run_id
  for update;

  if v_run.id is null or v_run.status <> 'running' then
    return false;
  end if;

  select * into v_rule
  from public.project_automation_rules
  where id = v_run.rule_id;

  if v_rule.id is null or not v_rule.enabled then
    update public.project_automation_runs
    set
      status = 'skipped',
      result = '{"reason":"rule_disabled_or_missing"}'::jsonb,
      error = null,
      next_retry_at = null,
      finished_at = now(),
      last_attempt_at = now()
    where id = p_run_id;
    return false;
  end if;

  begin
    select
      b.project_id,
      n.title,
      n.status,
      n.due_date
    into
      v_project_id,
      v_title,
      v_status,
      v_due_date
    from public.canvas_nodes n
    join public.boards b on b.id = n.board_id
    where n.id = v_run.node_id
      and n.board_id = v_run.board_id;

    if v_project_id is null or v_project_id <> v_rule.project_id then
      update public.project_automation_runs
      set
        status = 'skipped',
        result = '{"reason":"node_missing"}'::jsonb,
        error = null,
        next_retry_at = null,
        finished_at = now(),
        last_attempt_at = now()
      where id = p_run_id;
      return false;
    end if;

    if v_rule.kind = 'blocked_notify_managers' then
      for v_recipient in
        select distinct recipient
        from (
          select p.created_by as recipient
          from public.projects p
          where p.id = v_project_id

          union

          select pm.user_id as recipient
          from public.project_members pm
          where pm.project_id = v_project_id
            and pm.role in ('owner','admin')
        ) managers
        where recipient is not null
          and recipient <> auth.uid()
      loop
        perform public.enqueue_user_notification(
          v_recipient,
          v_project_id,
          'task_status',
          null,
          null,
          v_run.board_id,
          null,
          null,
          jsonb_build_object(
            'target_type', 'node',
            'target_id', v_run.node_id,
            'title', v_title,
            'status', v_status,
            'event', 'automation_blocked',
            'automation_rule_id', v_rule.id,
            'automation_kind', v_rule.kind
          ),
          'automation:' || v_rule.id::text || ':' ||
            v_run.event_key || ':' || v_recipient::text
        );
        v_recipient_count := v_recipient_count + 1;
      end loop;

    elsif v_rule.kind = 'dependency_ready_notify_assignee' then
      if not public.projectflow_dependencies_ready(v_run.board_id, v_run.node_id) then
        update public.project_automation_runs
        set
          status = 'skipped',
          result = '{"reason":"dependencies_not_ready"}'::jsonb,
          error = null,
          next_retry_at = null,
          finished_at = now(),
          last_attempt_at = now()
        where id = p_run_id;
        return false;
      end if;

      for v_recipient in
        select distinct recipient
        from (
          select a.assignee_user_id as recipient
          from public.canvas_node_assignments a
          where a.node_id = v_run.node_id
            and a.board_id = v_run.board_id

          union

          select w.user_id as recipient
          from public.canvas_node_watchers w
          where w.node_id = v_run.node_id
            and w.board_id = v_run.board_id
        ) recipients
        where recipient is not null
      loop
        perform public.enqueue_user_notification(
          v_recipient,
          v_project_id,
          'task_status',
          null,
          null,
          v_run.board_id,
          null,
          null,
          jsonb_build_object(
            'target_type', 'node',
            'target_id', v_run.node_id,
            'title', v_title,
            'status', v_status,
            'event', 'automation_dependencies_ready',
            'automation_rule_id', v_rule.id,
            'automation_kind', v_rule.kind
          ),
          'automation:' || v_rule.id::text || ':' ||
            v_run.event_key || ':' || v_recipient::text
        );
        v_recipient_count := v_recipient_count + 1;
      end loop;

    elsif v_rule.kind = 'due_soon_notify_assignee' then
      if v_due_date is null or v_status = 'done' then
        update public.project_automation_runs
        set
          status = 'skipped',
          result = '{"reason":"task_no_longer_due"}'::jsonb,
          error = null,
          next_retry_at = null,
          finished_at = now(),
          last_attempt_at = now()
        where id = p_run_id;
        return false;
      end if;

      for v_recipient in
        select distinct recipient
        from (
          select a.assignee_user_id as recipient
          from public.canvas_node_assignments a
          where a.node_id = v_run.node_id
            and a.board_id = v_run.board_id

          union

          select w.user_id as recipient
          from public.canvas_node_watchers w
          where w.node_id = v_run.node_id
            and w.board_id = v_run.board_id
        ) recipients
        where recipient is not null
      loop
        perform public.enqueue_user_notification(
          v_recipient,
          v_project_id,
          'task_due',
          null,
          null,
          v_run.board_id,
          null,
          null,
          jsonb_build_object(
            'target_type', 'node',
            'target_id', v_run.node_id,
            'title', v_title,
            'due_date', v_due_date,
            'event', 'due_soon',
            'automation_rule_id', v_rule.id,
            'automation_kind', v_rule.kind
          ),
          'automation:' || v_rule.id::text || ':' ||
            v_run.event_key || ':' || v_recipient::text
        );
        v_recipient_count := v_recipient_count + 1;
      end loop;

    elsif v_rule.kind = 'overdue_escalate_managers' then
      if v_due_date is null or v_status = 'done' then
        update public.project_automation_runs
        set
          status = 'skipped',
          result = '{"reason":"task_no_longer_overdue"}'::jsonb,
          error = null,
          next_retry_at = null,
          finished_at = now(),
          last_attempt_at = now()
        where id = p_run_id;
        return false;
      end if;

      for v_recipient in
        select distinct recipient
        from (
          select p.created_by as recipient
          from public.projects p
          where p.id = v_project_id

          union

          select pm.user_id as recipient
          from public.project_members pm
          where pm.project_id = v_project_id
            and pm.role in ('owner','admin')
        ) managers
        where recipient is not null
      loop
        perform public.enqueue_user_notification(
          v_recipient,
          v_project_id,
          'task_due',
          null,
          null,
          v_run.board_id,
          null,
          null,
          jsonb_build_object(
            'target_type', 'node',
            'target_id', v_run.node_id,
            'title', v_title,
            'due_date', v_due_date,
            'event', 'overdue',
            'automation_rule_id', v_rule.id,
            'automation_kind', v_rule.kind
          ),
          'automation:' || v_rule.id::text || ':' ||
            v_run.event_key || ':' || v_recipient::text
        );
        v_recipient_count := v_recipient_count + 1;
      end loop;

    elsif v_rule.kind = 'dependency_ready_set_planned' then
      if public.projectflow_dependencies_ready(v_run.board_id, v_run.node_id)
        and v_status = 'idea'
      then
        v_rule_context := v_rule.id::text;
        perform set_config('projectflow.automation_rule_id', v_rule_context, true);

        update public.canvas_nodes
        set
          status = 'planned',
          progress = case when progress = 100 then 0 else progress end,
          version = version + 1,
          updated_at = now()
        where id = v_run.node_id
          and board_id = v_run.board_id
          and status = 'idea';

        get diagnostics v_recipient_count = row_count;
        v_changed := v_recipient_count > 0;

        perform set_config('projectflow.automation_rule_id', '', true);

        if v_changed then
          update public.boards
          set
            canvas_revision = canvas_revision + 1,
            updated_at = now()
          where id = v_run.board_id
          returning canvas_revision into v_revision;

          insert into public.board_collaboration_events (
            board_id,
            revision,
            actor_user_id,
            client_id,
            operations
          )
          values (
            v_run.board_id,
            v_revision,
            null,
            gen_random_uuid(),
            jsonb_build_array(
              jsonb_build_object(
                'op', 'automation_node_status',
                'id', v_run.node_id,
                'rule_id', v_rule.id
              )
            )
          );
        end if;
      end if;
    end if;

    update public.project_automation_runs
    set
      status = case
        when v_rule.kind = 'dependency_ready_set_planned' and not v_changed
          then 'skipped'
        else 'success'
      end,
      result = jsonb_build_object(
        'recipients', case
          when v_rule.kind = 'dependency_ready_set_planned' then 0
          else v_recipient_count
        end,
        'changed', v_changed
      ),
      error = null,
      next_retry_at = null,
      finished_at = now(),
      last_attempt_at = now()
    where id = p_run_id;

    update public.project_automation_rules
    set last_run_at = now()
    where id = v_rule.id;

    delete from public.project_automation_runs
    where project_id = v_rule.project_id
      and created_at < now() - interval '180 days';

    return true;
  exception when others then
    perform set_config('projectflow.automation_rule_id', '', true);

    update public.project_automation_runs
    set
      status = 'failed',
      error = left(sqlerrm, 1000),
      result = jsonb_build_object(
        'sqlstate', sqlstate,
        'attempt', attempt_count,
        'max_attempts', max_attempts
      ),
      next_retry_at = case
        when attempt_count < max_attempts
          then now() + public.projectflow_automation_retry_delay(attempt_count)
        else null
      end,
      finished_at = now(),
      last_attempt_at = now()
    where id = p_run_id;

    return false;
  end;
end;
$projectflow$;

revoke all on function public.projectflow_execute_automation_run_action(uuid)
  from public;

create or replace function public.projectflow_execute_automation_rule(
  p_rule_id uuid,
  p_board_id text,
  p_node_id text,
  p_event_key text,
  p_trigger_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_rule public.project_automation_rules%rowtype;
  v_run_id uuid;
begin
  select * into v_rule
  from public.project_automation_rules
  where id = p_rule_id;

  if v_rule.id is null or not v_rule.enabled then
    return false;
  end if;

  insert into public.project_automation_runs (
    rule_id,
    project_id,
    board_id,
    node_id,
    event_key,
    status,
    trigger_payload,
    attempt_count,
    max_attempts,
    last_attempt_at
  )
  values (
    v_rule.id,
    v_rule.project_id,
    p_board_id,
    p_node_id,
    p_event_key,
    'running',
    coalesce(p_trigger_payload, '{}'::jsonb),
    1,
    3,
    now()
  )
  on conflict (rule_id, event_key) do nothing
  returning id into v_run_id;

  if v_run_id is null then
    return false;
  end if;

  return public.projectflow_execute_automation_run_action(v_run_id);
end;
$projectflow$;

revoke all on function public.projectflow_execute_automation_rule(
  uuid, text, text, text, jsonb
) from public;

create or replace function public.projectflow_retry_automation_run_internal(
  p_run_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_attempt integer;
  v_max integer;
begin
  select attempt_count, max_attempts
    into v_attempt, v_max
  from public.project_automation_runs
  where id = p_run_id
    and status = 'failed'
  for update;

  if v_attempt is null or v_attempt >= v_max then
    return false;
  end if;

  update public.project_automation_runs
  set
    status = 'running',
    attempt_count = attempt_count + 1,
    error = null,
    next_retry_at = null,
    finished_at = null,
    last_attempt_at = now()
  where id = p_run_id
    and status = 'failed';

  if not found then
    return false;
  end if;

  return public.projectflow_execute_automation_run_action(p_run_id);
end;
$projectflow$;

revoke all on function public.projectflow_retry_automation_run_internal(uuid)
  from public;

create or replace function public.retry_project_automation_run(
  p_project_id text,
  p_run_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_attempt integer;
  v_max integer;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'AUTOMATION_RETRY_DENIED' using errcode = '42501';
  end if;

  select attempt_count, max_attempts
    into v_attempt, v_max
  from public.project_automation_runs
  where id = p_run_id
    and project_id = p_project_id
    and status = 'failed'
  for update;

  if v_attempt is null then
    raise exception 'AUTOMATION_RUN_NOT_RETRYABLE' using errcode = '22023';
  end if;

  if v_attempt >= v_max then
    update public.project_automation_runs
    set max_attempts = attempt_count + 1
    where id = p_run_id;
  end if;

  return public.projectflow_retry_automation_run_internal(p_run_id);
end;
$projectflow$;

revoke all on function public.retry_project_automation_run(text, uuid)
  from public;
grant execute on function public.retry_project_automation_run(text, uuid)
  to authenticated;

create or replace function public.projectflow_refresh_project_automations_core(
  p_project_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_rule record;
  v_node record;
  v_days integer;
  v_count integer := 0;
begin
  for v_rule in
    select *
    from public.project_automation_rules
    where project_id = p_project_id
      and enabled
      and kind in (
        'due_soon_notify_assignee',
        'overdue_escalate_managers'
      )
  loop
    if v_rule.kind = 'due_soon_notify_assignee' then
      v_days := least(
        30,
        greatest(0, coalesce((v_rule.config->>'days_before')::integer, 2))
      );

      for v_node in
        select n.id, n.board_id, n.due_date
        from public.canvas_nodes n
        join public.boards b on b.id = n.board_id
        where b.project_id = p_project_id
          and n.kind in ('task','milestone')
          and n.status <> 'done'
          and n.due_date is not null
          and n.due_date >= current_date
          and n.due_date <= current_date + v_days
      loop
        if public.projectflow_execute_automation_rule(
          v_rule.id,
          v_node.board_id,
          v_node.id,
          'due-soon:' || v_node.id || ':' || v_node.due_date::text,
          jsonb_build_object(
            'trigger', 'due_soon',
            'due_date', v_node.due_date,
            'days_before', v_days
          )
        ) then
          v_count := v_count + 1;
        end if;
      end loop;
    else
      v_days := least(
        90,
        greatest(0, coalesce((v_rule.config->>'days_overdue')::integer, 1))
      );

      for v_node in
        select n.id, n.board_id, n.due_date
        from public.canvas_nodes n
        join public.boards b on b.id = n.board_id
        where b.project_id = p_project_id
          and n.kind in ('task','milestone')
          and n.status <> 'done'
          and n.due_date is not null
          and n.due_date <= current_date - v_days
      loop
        if public.projectflow_execute_automation_rule(
          v_rule.id,
          v_node.board_id,
          v_node.id,
          'overdue:' || v_node.id || ':' ||
            v_node.due_date::text || ':' || current_date::text,
          jsonb_build_object(
            'trigger', 'overdue',
            'due_date', v_node.due_date,
            'days_overdue', v_days
          )
        ) then
          v_count := v_count + 1;
        end if;
      end loop;
    end if;
  end loop;

  return v_count;
end;
$projectflow$;

revoke all on function public.projectflow_refresh_project_automations_core(text)
  from public;

create or replace function public.refresh_project_automations(
  p_project_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'AUTOMATION_REFRESH_DENIED' using errcode = '42501';
  end if;

  return public.projectflow_refresh_project_automations_core(p_project_id);
end;
$projectflow$;

revoke all on function public.refresh_project_automations(text) from public;
grant execute on function public.refresh_project_automations(text)
  to authenticated;

create or replace function public.refresh_my_project_automations()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_total integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  for v_project_id in
    select p.id
    from public.projects p
    where p.created_by = auth.uid()
       or exists (
         select 1
         from public.project_members pm
         where pm.project_id = p.id
           and pm.user_id = auth.uid()
       )
  loop
    v_total := v_total +
      public.projectflow_refresh_project_automations_core(v_project_id);
  end loop;

  return v_total;
end;
$projectflow$;

revoke all on function public.refresh_my_project_automations() from public;
grant execute on function public.refresh_my_project_automations()
  to authenticated;

create or replace function public.projectflow_run_scheduler_tick()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_started timestamptz := clock_timestamp();
  v_total integer := 0;
  v_project_id text;
  v_run_id uuid;
begin
  if not pg_try_advisory_xact_lock(hashtext('projectflow-automation-scheduler')) then
    return 0;
  end if;

  update public.project_automation_scheduler_state
  set
    last_tick_at = now(),
    running_since = now(),
    updated_at = now()
  where id = 1;

  -- Mark abandoned executions as retryable failures.
  update public.project_automation_runs
  set
    status = 'failed',
    error = coalesce(error, 'Execution lease expired before completion.'),
    next_retry_at = case
      when attempt_count < max_attempts then now()
      else null
    end,
    finished_at = now()
  where status = 'running'
    and last_attempt_at < now() - interval '10 minutes';

  -- Retry due failures before discovering new time-based work.
  for v_run_id in
    select id
    from public.project_automation_runs
    where status = 'failed'
      and next_retry_at is not null
      and next_retry_at <= now()
      and attempt_count < max_attempts
    order by next_retry_at, created_at
    limit 100
    for update skip locked
  loop
    if public.projectflow_retry_automation_run_internal(v_run_id) then
      v_total := v_total + 1;
    end if;
  end loop;

  for v_project_id in
    select distinct r.project_id
    from public.project_automation_rules r
    where r.enabled
      and r.kind in (
        'due_soon_notify_assignee',
        'overdue_escalate_managers'
      )
  loop
    v_total := v_total +
      public.projectflow_refresh_project_automations_core(v_project_id);
  end loop;

  update public.project_automation_scheduler_state
  set
    last_success_at = now(),
    last_error = null,
    running_since = null,
    last_duration_ms = greatest(
      0,
      floor(
        extract(epoch from (clock_timestamp() - v_started)) * 1000
      )::integer
    ),
    updated_at = now()
  where id = 1;

  return v_total;
exception when others then
  update public.project_automation_scheduler_state
  set
    last_error_at = now(),
    last_error = left(sqlerrm, 1000),
    running_since = null,
    last_duration_ms = greatest(
      0,
      floor(
        extract(epoch from (clock_timestamp() - v_started)) * 1000
      )::integer
    ),
    updated_at = now()
  where id = 1;

  return 0;
end;
$projectflow$;

revoke all on function public.projectflow_run_scheduler_tick()
  from public;

create or replace function public.test_project_automation_rule(
  p_project_id text,
  p_rule_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
declare
  v_rule public.project_automation_rules%rowtype;
  v_days integer;
  v_candidate_count integer := 0;
  v_sample jsonb := '[]'::jsonb;
  v_manager_count integer := 0;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'AUTOMATION_TEST_DENIED' using errcode = '42501';
  end if;

  select * into v_rule
  from public.project_automation_rules
  where id = p_rule_id
    and project_id = p_project_id;

  if v_rule.id is null then
    raise exception 'AUTOMATION_RULE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(distinct manager_id)
    into v_manager_count
  from (
    select p.created_by as manager_id
    from public.projects p
    where p.id = p_project_id

    union

    select pm.user_id as manager_id
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.role in ('owner','admin')
  ) managers
  where manager_id is not null;

  if v_rule.kind = 'blocked_notify_managers' then
    select
      count(*),
      coalesce(
        jsonb_agg(sample_row order by due_date nulls last, title)
          filter (where sample_rank <= least(50, greatest(1, p_limit))),
        '[]'::jsonb
      )
    into v_candidate_count, v_sample
    from (
      select
        jsonb_build_object(
          'board_id', n.board_id,
          'node_id', n.id,
          'title', n.title,
          'status', n.status,
          'due_date', n.due_date,
          'recipient_count', v_manager_count
        ) as sample_row,
        n.due_date,
        n.title,
        row_number() over (order by n.updated_at desc, n.id) as sample_rank
      from public.canvas_nodes n
      join public.boards b on b.id = n.board_id
      where b.project_id = p_project_id
        and n.status = 'blocked'
        and n.kind in ('task','milestone')
    ) candidates;

  elsif v_rule.kind in (
    'dependency_ready_notify_assignee',
    'dependency_ready_set_planned'
  ) then
    select
      count(*),
      coalesce(
        jsonb_agg(sample_row order by title)
          filter (where sample_rank <= least(50, greatest(1, p_limit))),
        '[]'::jsonb
      )
    into v_candidate_count, v_sample
    from (
      select
        jsonb_build_object(
          'board_id', n.board_id,
          'node_id', n.id,
          'title', n.title,
          'status', n.status,
          'would_change',
            v_rule.kind = 'dependency_ready_set_planned'
            and n.status = 'idea',
          'recipient_count',
            case
              when v_rule.kind = 'dependency_ready_notify_assignee'
              then (
                select count(distinct recipient)
                from (
                  select a.assignee_user_id as recipient
                  from public.canvas_node_assignments a
                  where a.node_id = n.id
                    and a.board_id = n.board_id
                  union
                  select w.user_id
                  from public.canvas_node_watchers w
                  where w.node_id = n.id
                    and w.board_id = n.board_id
                ) recipients
                where recipient is not null
              )
              else 0
            end
        ) as sample_row,
        n.title,
        row_number() over (order by n.updated_at desc, n.id) as sample_rank
      from public.canvas_nodes n
      join public.boards b on b.id = n.board_id
      where b.project_id = p_project_id
        and n.kind in ('task','milestone','idea')
        and public.projectflow_dependencies_ready(n.board_id, n.id)
        and (
          v_rule.kind = 'dependency_ready_notify_assignee'
          or n.status = 'idea'
        )
    ) candidates;

  elsif v_rule.kind = 'due_soon_notify_assignee' then
    v_days := least(
      30,
      greatest(0, coalesce((v_rule.config->>'days_before')::integer, 2))
    );

    select
      count(*),
      coalesce(
        jsonb_agg(sample_row order by due_date, title)
          filter (where sample_rank <= least(50, greatest(1, p_limit))),
        '[]'::jsonb
      )
    into v_candidate_count, v_sample
    from (
      select
        jsonb_build_object(
          'board_id', n.board_id,
          'node_id', n.id,
          'title', n.title,
          'status', n.status,
          'due_date', n.due_date,
          'recipient_count', (
            select count(distinct recipient)
            from (
              select a.assignee_user_id as recipient
              from public.canvas_node_assignments a
              where a.node_id = n.id
                and a.board_id = n.board_id
              union
              select w.user_id
              from public.canvas_node_watchers w
              where w.node_id = n.id
                and w.board_id = n.board_id
            ) recipients
            where recipient is not null
          )
        ) as sample_row,
        n.due_date,
        n.title,
        row_number() over (order by n.due_date, n.id) as sample_rank
      from public.canvas_nodes n
      join public.boards b on b.id = n.board_id
      where b.project_id = p_project_id
        and n.kind in ('task','milestone')
        and n.status <> 'done'
        and n.due_date is not null
        and n.due_date >= current_date
        and n.due_date <= current_date + v_days
    ) candidates;

  else
    v_days := least(
      90,
      greatest(0, coalesce((v_rule.config->>'days_overdue')::integer, 1))
    );

    select
      count(*),
      coalesce(
        jsonb_agg(sample_row order by due_date, title)
          filter (where sample_rank <= least(50, greatest(1, p_limit))),
        '[]'::jsonb
      )
    into v_candidate_count, v_sample
    from (
      select
        jsonb_build_object(
          'board_id', n.board_id,
          'node_id', n.id,
          'title', n.title,
          'status', n.status,
          'due_date', n.due_date,
          'recipient_count', v_manager_count
        ) as sample_row,
        n.due_date,
        n.title,
        row_number() over (order by n.due_date, n.id) as sample_rank
      from public.canvas_nodes n
      join public.boards b on b.id = n.board_id
      where b.project_id = p_project_id
        and n.kind in ('task','milestone')
        and n.status <> 'done'
        and n.due_date is not null
        and n.due_date <= current_date - v_days
    ) candidates;
  end if;

  return jsonb_build_object(
    'rule_id', v_rule.id,
    'kind', v_rule.kind,
    'enabled', v_rule.enabled,
    'candidate_count', v_candidate_count,
    'sample', v_sample,
    'dry_run', true,
    'tested_at', now()
  );
end;
$projectflow$;

revoke all on function public.test_project_automation_rule(
  text, uuid, integer
) from public;
grant execute on function public.test_project_automation_rule(
  text, uuid, integer
) to authenticated;

create or replace function public.get_project_automation_health(
  p_project_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
declare
  v_state public.project_automation_scheduler_state%rowtype;
  v_failed integer;
  v_retrying integer;
  v_exhausted integer;
  v_enabled integer;
  v_scheduled integer;
  v_oldest_failed timestamptz;
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'AUTOMATION_HEALTH_DENIED' using errcode = '42501';
  end if;

  select * into v_state
  from public.project_automation_scheduler_state
  where id = 1;

  select
    count(*) filter (where run.status = 'failed'),
    count(*) filter (
      where run.status = 'failed'
        and run.next_retry_at is not null
        and run.attempt_count < run.max_attempts
    ),
    count(*) filter (
      where run.status = 'failed'
        and (
          run.next_retry_at is null
          or run.attempt_count >= run.max_attempts
        )
    ),
    min(run.created_at) filter (where run.status = 'failed')
  into
    v_failed,
    v_retrying,
    v_exhausted,
    v_oldest_failed
  from public.project_automation_runs run
  where run.project_id = p_project_id;

  select
    count(*) filter (where enabled),
    count(*) filter (
      where enabled
        and kind in ('due_soon_notify_assignee','overdue_escalate_managers')
    )
  into v_enabled, v_scheduled
  from public.project_automation_rules
  where project_id = p_project_id;

  return jsonb_build_object(
    'scheduler_mode', coalesce(v_state.scheduler_mode, 'active_app_fallback'),
    'scheduler_available', coalesce(v_state.scheduler_mode = 'pg_cron', false),
    'cron_job_name', v_state.cron_job_name,
    'cron_job_id', v_state.cron_job_id,
    'last_tick_at', v_state.last_tick_at,
    'last_success_at', v_state.last_success_at,
    'last_error_at', v_state.last_error_at,
    'last_error', v_state.last_error,
    'last_duration_ms', v_state.last_duration_ms,
    'running_since', v_state.running_since,
    'failed_runs', coalesce(v_failed, 0),
    'retrying_runs', coalesce(v_retrying, 0),
    'exhausted_runs', coalesce(v_exhausted, 0),
    'oldest_failed_at', v_oldest_failed,
    'enabled_rules', coalesce(v_enabled, 0),
    'scheduled_rules', coalesce(v_scheduled, 0),
    'checked_at', now()
  );
end;
$projectflow$;

revoke all on function public.get_project_automation_health(text) from public;
grant execute on function public.get_project_automation_health(text)
  to authenticated;

create or replace function public.list_project_automation_runs(
  p_project_id text,
  p_limit integer default 40
)
returns table (
  id uuid,
  rule_id uuid,
  rule_name text,
  rule_kind text,
  board_id text,
  board_name text,
  node_id text,
  node_title text,
  event_key text,
  status text,
  trigger_payload jsonb,
  result jsonb,
  error text,
  attempt_count integer,
  max_attempts integer,
  next_retry_at timestamptz,
  last_attempt_at timestamptz,
  created_at timestamptz,
  finished_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'AUTOMATION_RUNS_DENIED' using errcode = '42501';
  end if;

  return query
  select
    run.id,
    run.rule_id,
    rule.name,
    rule.kind,
    run.board_id,
    b.name,
    run.node_id,
    n.title,
    run.event_key,
    run.status,
    run.trigger_payload,
    run.result,
    run.error,
    run.attempt_count,
    run.max_attempts,
    run.next_retry_at,
    run.last_attempt_at,
    run.created_at,
    run.finished_at
  from public.project_automation_runs run
  join public.project_automation_rules rule on rule.id = run.rule_id
  left join public.boards b on b.id = run.board_id
  left join public.canvas_nodes n
    on n.id = run.node_id
    and n.board_id = run.board_id
  where run.project_id = p_project_id
  order by run.created_at desc
  limit least(100, greatest(1, coalesce(p_limit, 40)));
end;
$projectflow$;

revoke all on function public.list_project_automation_runs(text, integer)
  from public;
grant execute on function public.list_project_automation_runs(text, integer)
  to authenticated;

-- Best-effort server-side scheduling. The migration must not fail when pg_cron
-- is unavailable in the current Supabase environment.
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
    update public.project_automation_scheduler_state
    set
      scheduler_mode = 'active_app_fallback',
      last_error_at = now(),
      last_error = left('pg_cron activation: ' || sqlerrm, 1000),
      updated_at = now()
    where id = 1;
  end;

  select exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) into v_installed;

  if v_installed and to_regnamespace('cron') is not null then
    begin
      -- Remove an older ProjectFlow scheduler job if this migration is replayed.
      for v_job_id in
        execute 'select jobid from cron.job where jobname = ''projectflow-automation-scheduler'''
      loop
        execute 'select cron.unschedule($1)' using v_job_id;
      end loop;

      execute
        'select cron.schedule($1, $2, $3)'
        into v_job_id
        using
          'projectflow-automation-scheduler',
          '* * * * *',
          'select public.projectflow_run_scheduler_tick();';

      update public.project_automation_scheduler_state
      set
        scheduler_mode = 'pg_cron',
        cron_job_name = 'projectflow-automation-scheduler',
        cron_job_id = v_job_id,
        last_error = null,
        updated_at = now()
      where id = 1;
    exception when others then
      update public.project_automation_scheduler_state
      set
        scheduler_mode = 'active_app_fallback',
        cron_job_name = null,
        cron_job_id = null,
        last_error_at = now(),
        last_error = left('pg_cron scheduling: ' || sqlerrm, 1000),
        updated_at = now()
      where id = 1;
    end;
  else
    update public.project_automation_scheduler_state
    set
      scheduler_mode = 'active_app_fallback',
      cron_job_name = null,
      cron_job_id = null,
      updated_at = now()
    where id = 1;
  end if;
end;
$projectflow$;
