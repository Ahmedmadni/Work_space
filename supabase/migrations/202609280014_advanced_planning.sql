-- Phase 22: advanced planning, baselines, Gantt and capacity metadata.

create table if not exists public.project_node_planning (
  project_id text not null references public.projects(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  node_id text not null,
  effort_hours numeric(8,2)
    check (effort_hours is null or (effort_hours >= 0.25 and effort_hours <= 10000)),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, node_id)
);

create table if not exists public.project_member_capacity (
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  weekly_capacity_hours numeric(6,2) not null default 40
    check (weekly_capacity_hours >= 1 and weekly_capacity_hours <= 168),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.project_schedule_baselines (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_schedule_baseline_items (
  baseline_id uuid not null references public.project_schedule_baselines(id) on delete cascade,
  project_id text not null,
  board_id text not null,
  node_id text not null,
  title text not null,
  kind text not null,
  start_date date,
  due_date date,
  status text not null,
  progress integer not null,
  assignee_user_id uuid,
  effort_hours numeric(8,2),
  primary key (baseline_id, node_id)
);

create index if not exists project_node_planning_project_idx
  on public.project_node_planning(project_id, board_id);
create index if not exists project_member_capacity_project_idx
  on public.project_member_capacity(project_id);
create index if not exists project_schedule_baselines_project_idx
  on public.project_schedule_baselines(project_id, created_at desc);

alter table public.project_node_planning enable row level security;
alter table public.project_member_capacity enable row level security;
alter table public.project_schedule_baselines enable row level security;
alter table public.project_schedule_baseline_items enable row level security;

drop policy if exists project_node_planning_select_member
  on public.project_node_planning;
create policy project_node_planning_select_member
on public.project_node_planning
for select to authenticated
using (public.can_access_project(project_id));

drop policy if exists project_member_capacity_select_member
  on public.project_member_capacity;
create policy project_member_capacity_select_member
on public.project_member_capacity
for select to authenticated
using (public.can_access_project(project_id));

drop policy if exists project_schedule_baselines_select_member
  on public.project_schedule_baselines;
create policy project_schedule_baselines_select_member
on public.project_schedule_baselines
for select to authenticated
using (public.can_access_project(project_id));

drop policy if exists project_schedule_baseline_items_select_member
  on public.project_schedule_baseline_items;
create policy project_schedule_baseline_items_select_member
on public.project_schedule_baseline_items
for select to authenticated
using (public.can_access_project(project_id));

revoke insert, update, delete on public.project_node_planning from authenticated;
revoke insert, update, delete on public.project_member_capacity from authenticated;
revoke insert, update, delete on public.project_schedule_baselines from authenticated;
revoke insert, update, delete on public.project_schedule_baseline_items from authenticated;

grant select on public.project_node_planning to authenticated;
grant select on public.project_member_capacity to authenticated;
grant select on public.project_schedule_baselines to authenticated;
grant select on public.project_schedule_baseline_items to authenticated;

create or replace function public.update_canvas_node_schedule(
  p_project_id text,
  p_board_id text,
  p_node_id text,
  p_expected_version bigint,
  p_set_start_date boolean default false,
  p_start_date date default null,
  p_set_due_date boolean default false,
  p_due_date date default null,
  p_set_effort_hours boolean default false,
  p_effort_hours numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_old_start date;
  v_old_due date;
  v_old_effort numeric;
  v_new_start date;
  v_new_due date;
  v_new_effort numeric;
  v_new_version bigint;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if not public.can_edit_project(p_project_id) then
    raise exception 'PLANNING_EDIT_DENIED' using errcode = '42501';
  end if;

  select n.start_date, n.due_date
    into v_old_start, v_old_due
  from public.canvas_nodes n
  join public.boards b on b.id = n.board_id
  where n.id = p_node_id
    and n.board_id = p_board_id
    and b.project_id = p_project_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select effort_hours into v_old_effort
  from public.project_node_planning
  where project_id = p_project_id
    and node_id = p_node_id;

  v_new_start := case when p_set_start_date then p_start_date else v_old_start end;
  v_new_due := case when p_set_due_date then p_due_date else v_old_due end;
  v_new_effort := case
    when p_set_effort_hours then p_effort_hours
    else v_old_effort
  end;

  if v_new_start is not null
    and v_new_due is not null
    and v_new_start > v_new_due
  then
    raise exception 'PLANNING_INVALID_DATE_RANGE' using errcode = '22023';
  end if;

  if v_new_effort is not null
    and (v_new_effort < 0.25 or v_new_effort > 10000)
  then
    raise exception 'PLANNING_INVALID_EFFORT' using errcode = '22023';
  end if;

  update public.canvas_nodes
  set
    start_date = v_new_start,
    due_date = v_new_due,
    version = version + 1,
    updated_at = now()
  where id = p_node_id
    and board_id = p_board_id
    and version = p_expected_version
  returning version, updated_at
    into v_new_version, v_updated_at;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'version_mismatch');
  end if;

  if p_set_effort_hours then
    if p_effort_hours is null then
      delete from public.project_node_planning
      where project_id = p_project_id
        and node_id = p_node_id;
    else
      insert into public.project_node_planning (
        project_id,
        board_id,
        node_id,
        effort_hours,
        updated_by,
        updated_at
      )
      values (
        p_project_id,
        p_board_id,
        p_node_id,
        p_effort_hours,
        auth.uid(),
        now()
      )
      on conflict (project_id, node_id) do update
      set
        board_id = excluded.board_id,
        effort_hours = excluded.effort_hours,
        updated_by = auth.uid(),
        updated_at = now();
    end if;
  end if;

  update public.boards
  set
    canvas_revision = canvas_revision + 1,
    updated_at = now()
  where id = p_board_id
    and project_id = p_project_id
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
      jsonb_build_object(
        'op', 'node_schedule',
        'id', p_node_id
      )
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
    p_project_id,
    auth.uid(),
    'task_schedule_changed',
    'node',
    p_node_id,
    jsonb_build_object(
      'board_id', p_board_id,
      'old_start_date', v_old_start,
      'start_date', v_new_start,
      'old_due_date', v_old_due,
      'due_date', v_new_due,
      'old_effort_hours', v_old_effort,
      'effort_hours', v_new_effort
    )
  );

  perform public.projectflow_append_audit_event(
    p_project_id,
    'execution',
    'task_schedule_changed',
    'node',
    p_node_id,
    jsonb_build_object(
      'start_date', v_old_start,
      'due_date', v_old_due,
      'effort_hours', v_old_effort
    ),
    jsonb_build_object(
      'start_date', v_new_start,
      'due_date', v_new_due,
      'effort_hours', v_new_effort
    ),
    jsonb_build_object('board_id', p_board_id)
  );

  return jsonb_build_object(
    'ok', true,
    'node_id', p_node_id,
    'version', v_new_version,
    'start_date', v_new_start,
    'due_date', v_new_due,
    'effort_hours', v_new_effort,
    'updated_at', v_updated_at,
    'revision', v_revision
  );
end;
$projectflow$;

revoke all on function public.update_canvas_node_schedule(
  text, text, text, bigint, boolean, date, boolean, date, boolean, numeric
) from public;
grant execute on function public.update_canvas_node_schedule(
  text, text, text, bigint, boolean, date, boolean, date, boolean, numeric
) to authenticated;

create or replace function public.set_project_member_capacity(
  p_project_id text,
  p_user_id uuid,
  p_weekly_capacity_hours numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_old numeric;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'CAPACITY_MANAGE_DENIED' using errcode = '42501';
  end if;

  if p_weekly_capacity_hours < 1 or p_weekly_capacity_hours > 168 then
    raise exception 'CAPACITY_INVALID_HOURS' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        p.created_by = p_user_id
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p_project_id
            and pm.user_id = p_user_id
            and pm.role in ('owner','admin','editor')
        )
      )
  ) then
    raise exception 'CAPACITY_USER_NOT_EXECUTOR' using errcode = '22023';
  end if;

  select weekly_capacity_hours into v_old
  from public.project_member_capacity
  where project_id = p_project_id
    and user_id = p_user_id;

  insert into public.project_member_capacity (
    project_id,
    user_id,
    weekly_capacity_hours,
    updated_by,
    updated_at
  )
  values (
    p_project_id,
    p_user_id,
    p_weekly_capacity_hours,
    auth.uid(),
    now()
  )
  on conflict (project_id, user_id) do update
  set
    weekly_capacity_hours = excluded.weekly_capacity_hours,
    updated_by = auth.uid(),
    updated_at = now();

  perform public.projectflow_append_audit_event(
    p_project_id,
    'execution',
    'member_capacity_changed',
    'project_member',
    p_user_id::text,
    jsonb_build_object('weekly_capacity_hours', v_old),
    jsonb_build_object('weekly_capacity_hours', p_weekly_capacity_hours),
    '{}'::jsonb
  );
end;
$projectflow$;

revoke all on function public.set_project_member_capacity(text, uuid, numeric)
  from public;
grant execute on function public.set_project_member_capacity(text, uuid, numeric)
  to authenticated;

create or replace function public.create_project_schedule_baseline(
  p_project_id text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_id uuid := gen_random_uuid();
  v_name text := trim(coalesce(p_name, ''));
  v_count integer;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'BASELINE_MANAGE_DENIED' using errcode = '42501';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'BASELINE_INVALID_NAME' using errcode = '22023';
  end if;

  insert into public.project_schedule_baselines (
    id,
    project_id,
    name,
    created_by
  )
  values (
    v_id,
    p_project_id,
    v_name,
    auth.uid()
  );

  insert into public.project_schedule_baseline_items (
    baseline_id,
    project_id,
    board_id,
    node_id,
    title,
    kind,
    start_date,
    due_date,
    status,
    progress,
    assignee_user_id,
    effort_hours
  )
  select
    v_id,
    p_project_id,
    n.board_id,
    n.id,
    n.title,
    n.kind,
    n.start_date,
    n.due_date,
    n.status,
    n.progress,
    a.assignee_user_id,
    plan.effort_hours
  from public.canvas_nodes n
  join public.boards b on b.id = n.board_id
  left join public.canvas_node_assignments a
    on a.node_id = n.id
    and a.board_id = n.board_id
  left join public.project_node_planning plan
    on plan.project_id = p_project_id
    and plan.node_id = n.id
  where b.project_id = p_project_id
    and n.kind in ('task','milestone');

  get diagnostics v_count = row_count;

  perform public.projectflow_append_audit_event(
    p_project_id,
    'project',
    'schedule_baseline_created',
    'schedule_baseline',
    v_id::text,
    null,
    jsonb_build_object(
      'name', v_name,
      'item_count', v_count
    ),
    '{}'::jsonb
  );

  return v_id;
end;
$projectflow$;

revoke all on function public.create_project_schedule_baseline(text, text)
  from public;
grant execute on function public.create_project_schedule_baseline(text, text)
  to authenticated;

create or replace function public.list_project_planning_data(
  p_project_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
declare
  v_baseline_id uuid;
  v_baseline_name text;
  v_baseline_created timestamptz;
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'PLANNING_LIST_DENIED' using errcode = '42501';
  end if;

  select id, name, created_at
    into v_baseline_id, v_baseline_name, v_baseline_created
  from public.project_schedule_baselines
  where project_id = p_project_id
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'effort',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'board_id', p.board_id,
          'node_id', p.node_id,
          'effort_hours', p.effort_hours
        )
        order by p.node_id
      )
      from public.project_node_planning p
      join public.canvas_nodes n
        on n.id = p.node_id
        and n.board_id = p.board_id
      where p.project_id = p_project_id
    ), '[]'::jsonb),
    'capacity',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', c.user_id,
          'weekly_capacity_hours', c.weekly_capacity_hours
        )
        order by c.user_id
      )
      from public.project_member_capacity c
      where c.project_id = p_project_id
    ), '[]'::jsonb),
    'dependencies',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'board_id', e.board_id,
          'source_node_id', e.source_node_id,
          'target_node_id', e.target_node_id,
          'target_title', target.title,
          'target_due_date', target.due_date,
          'target_status', target.status
        )
        order by e.board_id, e.id
      )
      from public.canvas_edges e
      join public.boards b on b.id = e.board_id
      join public.canvas_nodes target
        on target.id = e.target_node_id
        and target.board_id = e.board_id
      where b.project_id = p_project_id
        and e.kind = 'dependency'
    ), '[]'::jsonb),
    'baselines',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', bl.id,
          'name', bl.name,
          'created_at', bl.created_at,
          'created_by', bl.created_by,
          'created_by_name', coalesce(
            nullif(pr.full_name, ''),
            nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
            'مستخدم'
          ),
          'item_count', (
            select count(*)
            from public.project_schedule_baseline_items bi
            where bi.baseline_id = bl.id
          )
        )
        order by bl.created_at desc
      )
      from public.project_schedule_baselines bl
      left join public.profiles pr on pr.id = bl.created_by
      left join auth.users u on u.id = bl.created_by
      where bl.project_id = p_project_id
    ), '[]'::jsonb),
    'latest_baseline',
    case
      when v_baseline_id is null then null
      else jsonb_build_object(
        'id', v_baseline_id,
        'name', v_baseline_name,
        'created_at', v_baseline_created,
        'items', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'board_id', bi.board_id,
              'node_id', bi.node_id,
              'title', bi.title,
              'kind', bi.kind,
              'start_date', bi.start_date,
              'due_date', bi.due_date,
              'status', bi.status,
              'progress', bi.progress,
              'assignee_user_id', bi.assignee_user_id,
              'effort_hours', bi.effort_hours
            )
            order by bi.board_id, bi.node_id
          )
          from public.project_schedule_baseline_items bi
          where bi.baseline_id = v_baseline_id
        ), '[]'::jsonb)
      end
    )
  );
end;
$projectflow$;

revoke all on function public.list_project_planning_data(text) from public;
grant execute on function public.list_project_planning_data(text)
  to authenticated;
