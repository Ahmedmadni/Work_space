-- Phase 18: safe project workflow automations.
-- Preset-based rules, idempotent execution, run history and scheduled refresh hooks.

create table if not exists public.project_automation_rules (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  kind text not null check (
    kind in (
      'blocked_notify_managers',
      'dependency_ready_notify_assignee',
      'due_soon_notify_assignee',
      'overdue_escalate_managers',
      'dependency_ready_set_planned'
    )
  ),
  name text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_run_at timestamptz,
  unique (project_id, kind)
);

create table if not exists public.project_automation_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.project_automation_rules(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  board_id text references public.boards(id) on delete set null,
  node_id text,
  event_key text not null,
  status text not null check (status in ('running','success','skipped','failed')),
  trigger_payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (rule_id, event_key)
);

create index if not exists project_automation_rules_project_idx
  on public.project_automation_rules(project_id, enabled, kind);
create index if not exists project_automation_runs_project_idx
  on public.project_automation_runs(project_id, created_at desc);
create index if not exists project_automation_runs_rule_idx
  on public.project_automation_runs(rule_id, created_at desc);
create index if not exists canvas_nodes_automation_due_idx
  on public.canvas_nodes(due_date, board_id)
  where due_date is not null
    and status <> 'done'
    and kind in ('task','milestone');

alter table public.project_automation_rules enable row level security;
alter table public.project_automation_runs enable row level security;

drop policy if exists project_automation_rules_select_member
  on public.project_automation_rules;
create policy project_automation_rules_select_member
on public.project_automation_rules
for select to authenticated
using (public.can_access_project(project_id));

drop policy if exists project_automation_runs_select_member
  on public.project_automation_runs;
create policy project_automation_runs_select_member
on public.project_automation_runs
for select to authenticated
using (public.can_access_project(project_id));

revoke insert, update, delete on public.project_automation_rules from authenticated;
revoke insert, update, delete on public.project_automation_runs from authenticated;
grant select on public.project_automation_rules to authenticated;
grant select on public.project_automation_runs to authenticated;

create or replace function public.projectflow_seed_automation_rules(
  p_project_id text,
  p_created_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  insert into public.project_automation_rules (
    project_id, kind, name, config, enabled, created_by
  )
  values
    (
      p_project_id,
      'blocked_notify_managers',
      'تنبيه الإدارة عند تعطل مهمة',
      '{}'::jsonb,
      false,
      p_created_by
    ),
    (
      p_project_id,
      'dependency_ready_notify_assignee',
      'تنبيه المسؤول عند اكتمال المتطلبات',
      '{}'::jsonb,
      false,
      p_created_by
    ),
    (
      p_project_id,
      'due_soon_notify_assignee',
      'تنبيه قبل الاستحقاق',
      '{"days_before":2}'::jsonb,
      false,
      p_created_by
    ),
    (
      p_project_id,
      'overdue_escalate_managers',
      'تصعيد المهام المتأخرة للإدارة',
      '{"days_overdue":1}'::jsonb,
      false,
      p_created_by
    ),
    (
      p_project_id,
      'dependency_ready_set_planned',
      'تحويل المهمة إلى مخطط عند اكتمال المتطلبات',
      '{}'::jsonb,
      false,
      p_created_by
    )
  on conflict (project_id, kind) do nothing;
end;
$projectflow$;

revoke all on function public.projectflow_seed_automation_rules(text, uuid)
  from public;

-- Seed current projects.
insert into public.project_automation_rules (
  project_id, kind, name, config, enabled, created_by
)
select p.id, seed.kind, seed.name, seed.config, false, p.created_by
from public.projects p
cross join (
  values
    ('blocked_notify_managers', 'تنبيه الإدارة عند تعطل مهمة', '{}'::jsonb),
    ('dependency_ready_notify_assignee', 'تنبيه المسؤول عند اكتمال المتطلبات', '{}'::jsonb),
    ('due_soon_notify_assignee', 'تنبيه قبل الاستحقاق', '{"days_before":2}'::jsonb),
    ('overdue_escalate_managers', 'تصعيد المهام المتأخرة للإدارة', '{"days_overdue":1}'::jsonb),
    ('dependency_ready_set_planned', 'تحويل المهمة إلى مخطط عند اكتمال المتطلبات', '{}'::jsonb)
) as seed(kind, name, config)
on conflict (project_id, kind) do nothing;

create or replace function public.projectflow_seed_automation_rules_on_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  perform public.projectflow_seed_automation_rules(new.id, new.created_by);
  return new;
end;
$projectflow$;

drop trigger if exists projects_seed_automation_rules on public.projects;
create trigger projects_seed_automation_rules
after insert on public.projects
for each row
execute function public.projectflow_seed_automation_rules_on_project();

revoke all on function public.projectflow_seed_automation_rules_on_project()
  from public;

create or replace function public.list_project_automation_rules(
  p_project_id text
)
returns table (
  id uuid,
  kind text,
  name text,
  config jsonb,
  enabled boolean,
  last_run_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'AUTOMATION_LIST_DENIED' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.kind,
    r.name,
    r.config,
    r.enabled,
    r.last_run_at,
    r.created_at,
    r.updated_at
  from public.project_automation_rules r
  where r.project_id = p_project_id
  order by r.created_at, r.kind;
end;
$projectflow$;

revoke all on function public.list_project_automation_rules(text) from public;
grant execute on function public.list_project_automation_rules(text)
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

create or replace function public.set_project_automation_enabled(
  p_project_id text,
  p_rule_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'AUTOMATION_MANAGE_DENIED' using errcode = '42501';
  end if;

  update public.project_automation_rules
  set
    enabled = p_enabled,
    updated_at = now()
  where id = p_rule_id
    and project_id = p_project_id;

  if not found then
    raise exception 'AUTOMATION_RULE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.project_activity (
    project_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_project_id,
    auth.uid(),
    case when p_enabled then 'automation_enabled' else 'automation_disabled' end,
    'automation_rule',
    p_rule_id::text,
    jsonb_build_object('enabled', p_enabled)
  );
end;
$projectflow$;

revoke all on function public.set_project_automation_enabled(text, uuid, boolean)
  from public;
grant execute on function public.set_project_automation_enabled(text, uuid, boolean)
  to authenticated;

create or replace function public.update_project_automation_config(
  p_project_id text,
  p_rule_id uuid,
  p_config jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_kind text;
  v_days integer;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'AUTOMATION_MANAGE_DENIED' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_config, '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_AUTOMATION_CONFIG' using errcode = '22023';
  end if;

  select kind into v_kind
  from public.project_automation_rules
  where id = p_rule_id
    and project_id = p_project_id;

  if v_kind is null then
    raise exception 'AUTOMATION_RULE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_kind = 'due_soon_notify_assignee' then
    v_days := coalesce((p_config->>'days_before')::integer, 2);
    if v_days < 0 or v_days > 30 then
      raise exception 'INVALID_AUTOMATION_DAYS' using errcode = '22023';
    end if;
    p_config := jsonb_build_object('days_before', v_days);
  elsif v_kind = 'overdue_escalate_managers' then
    v_days := coalesce((p_config->>'days_overdue')::integer, 1);
    if v_days < 0 or v_days > 90 then
      raise exception 'INVALID_AUTOMATION_DAYS' using errcode = '22023';
    end if;
    p_config := jsonb_build_object('days_overdue', v_days);
  else
    p_config := '{}'::jsonb;
  end if;

  update public.project_automation_rules
  set
    config = p_config,
    updated_at = now()
  where id = p_rule_id
    and project_id = p_project_id;
end;
$projectflow$;

revoke all on function public.update_project_automation_config(text, uuid, jsonb)
  from public;
grant execute on function public.update_project_automation_config(text, uuid, jsonb)
  to authenticated;

create or replace function public.projectflow_dependencies_ready(
  p_board_id text,
  p_node_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $projectflow$
  select
    exists (
      select 1
      from public.canvas_edges e
      where e.board_id = p_board_id
        and e.source_node_id = p_node_id
        and e.kind = 'dependency'
    )
    and not exists (
      select 1
      from public.canvas_edges e
      left join public.canvas_nodes dependency
        on dependency.id = e.target_node_id
        and dependency.board_id = e.board_id
      where e.board_id = p_board_id
        and e.source_node_id = p_node_id
        and e.kind = 'dependency'
        and (
          dependency.id is null
          or dependency.status <> 'done'
        )
    );
$projectflow$;

revoke all on function public.projectflow_dependencies_ready(text, text)
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
    trigger_payload
  )
  values (
    v_rule.id,
    v_rule.project_id,
    p_board_id,
    p_node_id,
    p_event_key,
    'running',
    coalesce(p_trigger_payload, '{}'::jsonb)
  )
  on conflict (rule_id, event_key) do nothing
  returning id into v_run_id;

  if v_run_id is null then
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
    where n.id = p_node_id
      and n.board_id = p_board_id;

    if v_project_id is null or v_project_id <> v_rule.project_id then
      update public.project_automation_runs
      set
        status = 'skipped',
        result = '{"reason":"node_missing"}'::jsonb,
        finished_at = now()
      where id = v_run_id;
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
          p_board_id,
          null,
          null,
          jsonb_build_object(
            'target_type', 'node',
            'target_id', p_node_id,
            'title', v_title,
            'status', v_status,
            'event', 'automation_blocked',
            'automation_rule_id', v_rule.id,
            'automation_kind', v_rule.kind
          ),
          'automation:' || v_rule.id::text || ':' ||
            p_event_key || ':' || v_recipient::text
        );
        v_recipient_count := v_recipient_count + 1;
      end loop;

    elsif v_rule.kind = 'dependency_ready_notify_assignee' then
      for v_recipient in
        select distinct recipient
        from (
          select a.assignee_user_id as recipient
          from public.canvas_node_assignments a
          where a.node_id = p_node_id
            and a.board_id = p_board_id

          union

          select w.user_id as recipient
          from public.canvas_node_watchers w
          where w.node_id = p_node_id
            and w.board_id = p_board_id
        ) recipients
        where recipient is not null
      loop
        perform public.enqueue_user_notification(
          v_recipient,
          v_project_id,
          'task_status',
          null,
          null,
          p_board_id,
          null,
          null,
          jsonb_build_object(
            'target_type', 'node',
            'target_id', p_node_id,
            'title', v_title,
            'status', v_status,
            'event', 'automation_dependencies_ready',
            'automation_rule_id', v_rule.id,
            'automation_kind', v_rule.kind
          ),
          'automation:' || v_rule.id::text || ':' ||
            p_event_key || ':' || v_recipient::text
        );
        v_recipient_count := v_recipient_count + 1;
      end loop;

    elsif v_rule.kind = 'due_soon_notify_assignee' then
      for v_recipient in
        select distinct recipient
        from (
          select a.assignee_user_id as recipient
          from public.canvas_node_assignments a
          where a.node_id = p_node_id
            and a.board_id = p_board_id

          union

          select w.user_id as recipient
          from public.canvas_node_watchers w
          where w.node_id = p_node_id
            and w.board_id = p_board_id
        ) recipients
        where recipient is not null
      loop
        perform public.enqueue_user_notification(
          v_recipient,
          v_project_id,
          'task_due',
          null,
          null,
          p_board_id,
          null,
          null,
          jsonb_build_object(
            'target_type', 'node',
            'target_id', p_node_id,
            'title', v_title,
            'due_date', v_due_date,
            'event', 'due_soon',
            'automation_rule_id', v_rule.id,
            'automation_kind', v_rule.kind
          ),
          'automation:' || v_rule.id::text || ':' ||
            p_event_key || ':' || v_recipient::text
        );
        v_recipient_count := v_recipient_count + 1;
      end loop;

    elsif v_rule.kind = 'overdue_escalate_managers' then
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
          p_board_id,
          null,
          null,
          jsonb_build_object(
            'target_type', 'node',
            'target_id', p_node_id,
            'title', v_title,
            'due_date', v_due_date,
            'event', 'overdue',
            'automation_rule_id', v_rule.id,
            'automation_kind', v_rule.kind
          ),
          'automation:' || v_rule.id::text || ':' ||
            p_event_key || ':' || v_recipient::text
        );
        v_recipient_count := v_recipient_count + 1;
      end loop;

    elsif v_rule.kind = 'dependency_ready_set_planned' then
      if public.projectflow_dependencies_ready(p_board_id, p_node_id)
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
        where id = p_node_id
          and board_id = p_board_id
          and status = 'idea';

        get diagnostics v_recipient_count = row_count;
        v_changed := v_recipient_count > 0;

        perform set_config('projectflow.automation_rule_id', '', true);

        if v_changed then
          update public.boards
          set
            canvas_revision = canvas_revision + 1,
            updated_at = now()
          where id = p_board_id
          returning canvas_revision into v_revision;

          insert into public.board_collaboration_events (
            board_id,
            revision,
            actor_user_id,
            client_id,
            operations
          )
          values (
            p_board_id,
            v_revision,
            null,
            gen_random_uuid(),
            jsonb_build_array(
              jsonb_build_object(
                'op', 'automation_node_status',
                'id', p_node_id,
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
      finished_at = now()
    where id = v_run_id;

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
      finished_at = now()
    where id = v_run_id;

    return false;
  end;
end;
$projectflow$;

revoke all on function public.projectflow_execute_automation_rule(
  uuid, text, text, text, jsonb
) from public;

create or replace function public.projectflow_evaluate_dependency_ready(
  p_board_id text,
  p_node_id text,
  p_event_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_rule record;
begin
  select project_id into v_project_id
  from public.boards
  where id = p_board_id;

  if v_project_id is null
    or not public.projectflow_dependencies_ready(p_board_id, p_node_id)
  then
    return;
  end if;

  for v_rule in
    select id
    from public.project_automation_rules
    where project_id = v_project_id
      and enabled
      and kind in (
        'dependency_ready_notify_assignee',
        'dependency_ready_set_planned'
      )
  loop
    perform public.projectflow_execute_automation_rule(
      v_rule.id,
      p_board_id,
      p_node_id,
      'dependency-ready:' || p_node_id || ':' || p_event_token,
      jsonb_build_object('trigger', 'dependencies_ready')
    );
  end loop;
end;
$projectflow$;

revoke all on function public.projectflow_evaluate_dependency_ready(
  text, text, text
) from public;

create or replace function public.projectflow_node_automation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_rule record;
  v_source_id text;
begin
  if current_setting('projectflow.suppress_automations', true) = '1' then
    return new;
  end if;

  select project_id into v_project_id
  from public.boards
  where id = new.board_id;

  if v_project_id is null then
    return new;
  end if;

  if new.status is distinct from old.status and new.status = 'blocked' then
    for v_rule in
      select id
      from public.project_automation_rules
      where project_id = v_project_id
        and enabled
        and kind = 'blocked_notify_managers'
    loop
      perform public.projectflow_execute_automation_rule(
        v_rule.id,
        new.board_id,
        new.id,
        'status-blocked:' || new.id || ':' || new.version::text,
        jsonb_build_object(
          'trigger', 'status_changed',
          'old_status', old.status,
          'status', new.status
        )
      );
    end loop;
  end if;

  if new.status is distinct from old.status and new.status = 'done' then
    for v_source_id in
      select distinct e.source_node_id
      from public.canvas_edges e
      where e.board_id = new.board_id
        and e.target_node_id = new.id
        and e.kind = 'dependency'
    loop
      perform public.projectflow_evaluate_dependency_ready(
        new.board_id,
        v_source_id,
        'node:' || new.id || ':v' || new.version::text
      );
    end loop;
  end if;

  return new;
end;
$projectflow$;

drop trigger if exists canvas_nodes_run_automations on public.canvas_nodes;
create trigger canvas_nodes_run_automations
after update of status on public.canvas_nodes
for each row
when (old.status is distinct from new.status)
execute function public.projectflow_node_automation_trigger();

revoke all on function public.projectflow_node_automation_trigger()
  from public;

create or replace function public.projectflow_dependency_edge_automation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  if current_setting('projectflow.suppress_automations', true) = '1' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.kind = 'dependency' then
      perform public.projectflow_evaluate_dependency_ready(
        old.board_id,
        old.source_node_id,
        'edge:' || old.id || ':v' || coalesce(old.version, 1)::text || ':DELETE'
      );
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
    and old.kind = 'dependency'
    and (
      new.kind is distinct from old.kind
      or new.source_node_id is distinct from old.source_node_id
      or new.target_node_id is distinct from old.target_node_id
    )
  then
    perform public.projectflow_evaluate_dependency_ready(
      old.board_id,
      old.source_node_id,
      'edge:' || old.id || ':v' || coalesce(old.version, 1)::text || ':UPDATE_OLD'
    );
  end if;

  if new.kind = 'dependency' then
    perform public.projectflow_evaluate_dependency_ready(
      new.board_id,
      new.source_node_id,
      'edge:' || new.id || ':v' || coalesce(new.version, 1)::text || ':' || tg_op
    );
  end if;

  return new;
end;
$projectflow$;

drop trigger if exists canvas_edges_run_dependency_automations
  on public.canvas_edges;
create trigger canvas_edges_run_dependency_automations
after insert or update or delete on public.canvas_edges
for each row
execute function public.projectflow_dependency_edge_automation_trigger();

revoke all on function public.projectflow_dependency_edge_automation_trigger()
  from public;

create or replace function public.refresh_project_automations(
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
  if not public.can_access_project(p_project_id) then
    raise exception 'AUTOMATION_REFRESH_DENIED' using errcode = '42501';
  end if;

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
    v_total := v_total + public.refresh_project_automations(v_project_id);
  end loop;

  return v_total;
end;
$projectflow$;

revoke all on function public.refresh_my_project_automations() from public;
grant execute on function public.refresh_my_project_automations()
  to authenticated;

-- Make built-in task status/due notifications automation-aware so system
-- actions do not masquerade as a human collaborator.
create or replace function public.notify_canvas_node_execution_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_recipient uuid;
  v_automation_rule_id text;
  v_actor uuid;
begin
  select b.project_id into v_project_id
  from public.boards b
  where b.id = new.board_id;

  if v_project_id is null then
    return new;
  end if;

  v_automation_rule_id :=
    nullif(current_setting('projectflow.automation_rule_id', true), '');
  v_actor :=
    case when v_automation_rule_id is null then auth.uid() else null end;

  if new.status is distinct from old.status then
    for v_recipient in
      select distinct recipient
      from (
        select a.assignee_user_id as recipient
        from public.canvas_node_assignments a
        where a.node_id = new.id
          and a.board_id = new.board_id

        union

        select w.user_id as recipient
        from public.canvas_node_watchers w
        where w.node_id = new.id
          and w.board_id = new.board_id
      ) recipients
      where recipient is not null
        and (v_actor is null or recipient <> v_actor)
    loop
      perform public.enqueue_user_notification(
        v_recipient,
        v_project_id,
        'task_status',
        v_actor,
        null,
        new.board_id,
        null,
        null,
        jsonb_build_object(
          'target_type', 'node',
          'target_id', new.id,
          'title', new.title,
          'old_status', old.status,
          'status', new.status,
          'automation_rule_id', v_automation_rule_id
        ),
        null
      );
    end loop;

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
      v_actor,
      case
        when v_automation_rule_id is null then 'task_status_changed'
        else 'automation_task_status_changed'
      end,
      'node',
      new.id,
      jsonb_build_object(
        'board_id', new.board_id,
        'title', new.title,
        'old_status', old.status,
        'status', new.status,
        'automation_rule_id', v_automation_rule_id
      )
    );
  end if;

  if new.due_date is distinct from old.due_date then
    for v_recipient in
      select distinct recipient
      from (
        select a.assignee_user_id as recipient
        from public.canvas_node_assignments a
        where a.node_id = new.id
          and a.board_id = new.board_id

        union

        select w.user_id as recipient
        from public.canvas_node_watchers w
        where w.node_id = new.id
          and w.board_id = new.board_id
      ) recipients
      where recipient is not null
        and (v_actor is null or recipient <> v_actor)
    loop
      perform public.enqueue_user_notification(
        v_recipient,
        v_project_id,
        'task_due',
        v_actor,
        null,
        new.board_id,
        null,
        null,
        jsonb_build_object(
          'target_type', 'node',
          'target_id', new.id,
          'title', new.title,
          'event', 'due_changed',
          'due_date', new.due_date,
          'automation_rule_id', v_automation_rule_id
        ),
        null
      );
    end loop;

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
      v_actor,
      case
        when v_automation_rule_id is null then 'task_due_changed'
        else 'automation_task_due_changed'
      end,
      'node',
      new.id,
      jsonb_build_object(
        'board_id', new.board_id,
        'title', new.title,
        'due_date', new.due_date,
        'automation_rule_id', v_automation_rule_id
      )
    );
  end if;

  return new;
end;
$projectflow$;

revoke all on function public.notify_canvas_node_execution_change()
  from public;


-- Restore/import replaces a full snapshot. Suppress dependency automation while
-- rows are temporarily rebuilt, then emit the normal snapshot-replaced event.
create or replace function public.save_board_canvas(
  p_board_id text,
  p_nodes jsonb,
  p_edges jsonb,
  p_strokes jsonb,
  p_viewport jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_revision bigint;
  n jsonb;
  e jsonb;
  s jsonb;
begin
  select project_id, canvas_revision
    into v_project_id, v_revision
  from public.boards
  where id = p_board_id
  for update;

  if v_project_id is null or not public.can_edit_project(v_project_id) then
    raise exception 'BOARD_EDIT_DENIED' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_nodes, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_edges, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_strokes, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_viewport, '{}'::jsonb)) <> 'object'
  then
    raise exception 'INVALID_CANVAS_PAYLOAD' using errcode = '22023';
  end if;

  perform set_config('projectflow.suppress_automations', '1', true);

  delete from public.canvas_edges where board_id = p_board_id;
  delete from public.canvas_strokes where board_id = p_board_id;
  delete from public.canvas_nodes where board_id = p_board_id;

  for n in
    select value from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb))
  loop
    insert into public.canvas_nodes (
      id, board_id, kind, x, y, width, height, title, description,
      status, priority, progress, start_date, due_date, owner_label,
      tags, asset_id, style, version, created_at, updated_at
    )
    values (
      n->>'id',
      p_board_id,
      coalesce(nullif(n->>'kind',''), 'idea'),
      coalesce((n->>'x')::double precision, 0),
      coalesce((n->>'y')::double precision, 0),
      greatest(1, coalesce((n->>'width')::double precision, 220)),
      greatest(1, coalesce((n->>'height')::double precision, 140)),
      coalesce(n->>'title', ''),
      nullif(n->>'description',''),
      coalesce(nullif(n->>'status',''), 'idea'),
      nullif(n->>'priority',''),
      least(100, greatest(0, coalesce((n->>'progress')::integer, 0))),
      nullif(n->>'start_date','')::date,
      nullif(n->>'due_date','')::date,
      nullif(n->>'owner',''),
      coalesce(
        array(
          select jsonb_array_elements_text(
            coalesce(n->'tags','[]'::jsonb)
          )
        ),
        '{}'::text[]
      ),
      nullif(n->>'asset_id',''),
      coalesce(n->'style', '{}'::jsonb),
      v_revision + 1,
      coalesce(nullif(n->>'created_at','')::timestamptz, now()),
      now()
    );
  end loop;

  for e in
    select value from jsonb_array_elements(coalesce(p_edges, '[]'::jsonb))
  loop
    insert into public.canvas_edges (
      id, board_id, source_node_id, target_node_id,
      kind, label, version, created_at, updated_at
    )
    values (
      e->>'id',
      p_board_id,
      e->>'source_node_id',
      e->>'target_node_id',
      coalesce(nullif(e->>'kind',''), 'relationship'),
      nullif(e->>'label',''),
      v_revision + 1,
      coalesce(nullif(e->>'created_at','')::timestamptz, now()),
      now()
    );
  end loop;

  for s in
    select value from jsonb_array_elements(coalesce(p_strokes, '[]'::jsonb))
  loop
    insert into public.canvas_strokes (
      id, board_id, tool, points, size, color,
      version, created_at, updated_at
    )
    values (
      s->>'id',
      p_board_id,
      coalesce(nullif(s->>'tool',''), 'pen'),
      coalesce(s->'points', '[]'::jsonb),
      least(48, greatest(0.1, coalesce((s->>'size')::double precision, 3))),
      coalesce(nullif(s->>'color',''), 'ink'),
      v_revision + 1,
      coalesce(nullif(s->>'created_at','')::timestamptz, now()),
      now()
    );
  end loop;

  perform public.save_board_viewport(p_board_id, p_viewport);

  update public.boards
  set
    canvas_revision = canvas_revision + 1,
    updated_at = now()
  where id = p_board_id
  returning canvas_revision into v_revision;

  insert into public.board_collaboration_events (
    board_id,
    revision,
    actor_user_id,
    client_id,
    operations
  )
  values (
    p_board_id,
    v_revision,
    auth.uid(),
    gen_random_uuid(),
    jsonb_build_array(
      jsonb_build_object('op', 'snapshot_replaced')
    )
  );

  perform set_config('projectflow.suppress_automations', '', true);
end;
$projectflow$;

