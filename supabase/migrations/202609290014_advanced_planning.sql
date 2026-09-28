-- Phase 22: advanced planning, Gantt, baselines and capacity.

alter table public.canvas_nodes
  add column if not exists effort_hours numeric(10,2);

alter table public.canvas_nodes
  drop constraint if exists canvas_nodes_effort_hours_check;
alter table public.canvas_nodes
  add constraint canvas_nodes_effort_hours_check
  check (effort_hours is null or (effort_hours >= 0 and effort_hours <= 10000));

create table if not exists public.project_member_capacity (
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  weekly_capacity_hours numeric(6,2) not null default 40
    check (weekly_capacity_hours >= 0 and weekly_capacity_hours <= 168),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.project_plan_baselines (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists project_plan_baselines_project_created_idx
  on public.project_plan_baselines(project_id, created_at desc);
create index if not exists project_member_capacity_project_idx
  on public.project_member_capacity(project_id);

alter table public.project_member_capacity enable row level security;
alter table public.project_plan_baselines enable row level security;

drop policy if exists project_member_capacity_select_member
  on public.project_member_capacity;
create policy project_member_capacity_select_member
on public.project_member_capacity
for select to authenticated
using (public.can_access_project(project_id));

drop policy if exists project_plan_baselines_select_member
  on public.project_plan_baselines;
create policy project_plan_baselines_select_member
on public.project_plan_baselines
for select to authenticated
using (public.can_access_project(project_id));

grant select on public.project_member_capacity to authenticated;
grant select on public.project_plan_baselines to authenticated;
revoke insert, update, delete on public.project_member_capacity from authenticated;
revoke insert, update, delete on public.project_plan_baselines from authenticated;


create or replace function public.update_canvas_node_planning(
  p_project_id text,
  p_board_id text,
  p_node_id text,
  p_expected_version bigint,
  p_set_start_date boolean default false,
  p_start_date date default null,
  p_set_due_date boolean default false,
  p_due_date date default null,
  p_set_effort_hours boolean default false,
  p_effort_hours numeric default null,
  p_set_progress boolean default false,
  p_progress integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_current public.canvas_nodes%rowtype;
  v_start date;
  v_due date;
  v_effort numeric;
  v_progress integer;
  v_revision bigint;
  v_new_version bigint;
  v_updated_at timestamptz;
begin
  if not public.can_edit_project(p_project_id) then
    raise exception 'PLANNING_EDIT_DENIED' using errcode = '42501';
  end if;

  select n.* into v_current
  from public.canvas_nodes n
  join public.boards b on b.id = n.board_id
  where n.id = p_node_id
    and n.board_id = p_board_id
    and b.project_id = p_project_id;

  if v_current.id is null then
    raise exception 'PLANNING_NODE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_current.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false,
      'reason', 'version_mismatch',
      'actual_version', v_current.version
    );
  end if;

  v_start := case when p_set_start_date then p_start_date else v_current.start_date end;
  v_due := case when p_set_due_date then p_due_date else v_current.due_date end;
  v_effort := case when p_set_effort_hours then p_effort_hours else v_current.effort_hours end;
  v_progress := case when p_set_progress then p_progress else v_current.progress end;

  if v_start is not null and v_due is not null and v_start > v_due then
    raise exception 'PLANNING_INVALID_DATE_RANGE' using errcode = '22023';
  end if;

  if v_effort is not null and (v_effort < 0 or v_effort > 10000) then
    raise exception 'PLANNING_INVALID_EFFORT' using errcode = '22023';
  end if;

  if v_progress is null or v_progress < 0 or v_progress > 100 then
    raise exception 'PLANNING_INVALID_PROGRESS' using errcode = '22023';
  end if;

  update public.canvas_nodes
  set
    start_date = v_start,
    due_date = v_due,
    effort_hours = v_effort,
    progress = v_progress,
    version = version + 1,
    updated_at = now()
  where id = p_node_id
    and board_id = p_board_id
    and version = p_expected_version
  returning version, updated_at
    into v_new_version, v_updated_at;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'version_mismatch'
    );
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
        'op', 'node_planning',
        'id', p_node_id
      )
    )
  );

  return jsonb_build_object(
    'ok', true,
    'node_id', p_node_id,
    'version', v_new_version,
    'start_date', v_start,
    'due_date', v_due,
    'effort_hours', v_effort,
    'progress', v_progress,
    'updated_at', v_updated_at,
    'revision', v_revision
  );
end;
$projectflow$;

revoke all on function public.update_canvas_node_planning(
  text, text, text, bigint, boolean, date, boolean, date,
  boolean, numeric, boolean, integer
) from public;
grant execute on function public.update_canvas_node_planning(
  text, text, text, bigint, boolean, date, boolean, date,
  boolean, numeric, boolean, integer
) to authenticated;

create or replace function public.list_project_member_capacity(
  p_project_id text
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role text,
  weekly_capacity_hours numeric,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'CAPACITY_LIST_DENIED' using errcode = '42501';
  end if;

  return query
  with participants as (
    select p.created_by as user_id, 'owner'::text as role
    from public.projects p
    where p.id = p_project_id

    union all

    select pm.user_id, pm.role
    from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.project_id = p_project_id
      and pm.user_id <> p.created_by
  )
  select
    participant.user_id,
    coalesce(
      nullif(pr.full_name, ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'مستخدم'
    )::text,
    coalesce(u.email, '')::text,
    participant.role,
    coalesce(c.weekly_capacity_hours, 40)::numeric,
    c.updated_at
  from participants participant
  left join auth.users u on u.id = participant.user_id
  left join public.profiles pr on pr.id = participant.user_id
  left join public.project_member_capacity c
    on c.project_id = p_project_id
    and c.user_id = participant.user_id
  order by
    case participant.role
      when 'owner' then 0
      when 'admin' then 1
      when 'editor' then 2
      else 3
    end,
    coalesce(pr.full_name, u.email, participant.user_id::text);
end;
$projectflow$;

revoke all on function public.list_project_member_capacity(text) from public;
grant execute on function public.list_project_member_capacity(text)
  to authenticated;

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
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'CAPACITY_MANAGE_DENIED' using errcode = '42501';
  end if;

  if p_weekly_capacity_hours < 0 or p_weekly_capacity_hours > 168 then
    raise exception 'INVALID_WEEKLY_CAPACITY' using errcode = '22023';
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
        )
      )
  ) then
    raise exception 'CAPACITY_USER_NOT_IN_PROJECT' using errcode = '22023';
  end if;

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
    null,
    jsonb_build_object(
      'weekly_capacity_hours', p_weekly_capacity_hours
    ),
    '{}'::jsonb
  );
end;
$projectflow$;

revoke all on function public.set_project_member_capacity(
  text, uuid, numeric
) from public;
grant execute on function public.set_project_member_capacity(
  text, uuid, numeric
) to authenticated;

create or replace function public.create_project_plan_baseline(
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
  v_snapshot jsonb;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'BASELINE_MANAGE_DENIED' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'INVALID_BASELINE_NAME' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'captured_at', now(),
    'nodes', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'node_id', n.id,
          'board_id', n.board_id,
          'title', n.title,
          'kind', n.kind,
          'status', n.status,
          'progress', n.progress,
          'start_date', n.start_date,
          'due_date', n.due_date,
          'effort_hours', n.effort_hours,
          'assignee_user_id', a.assignee_user_id
        )
        order by b.name, n.title, n.id
      ) filter (where n.id is not null),
      '[]'::jsonb
    )
  )
  into v_snapshot
  from public.boards b
  left join public.canvas_nodes n
    on n.board_id = b.id
    and n.kind in ('task','milestone','idea')
  left join public.canvas_node_assignments a
    on a.node_id = n.id
    and a.board_id = n.board_id
  where b.project_id = p_project_id;

  insert into public.project_plan_baselines (
    id,
    project_id,
    name,
    snapshot,
    created_by
  )
  values (
    v_id,
    p_project_id,
    trim(p_name),
    coalesce(v_snapshot, '{"nodes":[]}'::jsonb),
    auth.uid()
  );

  perform public.projectflow_append_audit_event(
    p_project_id,
    'execution',
    'planning_baseline_created',
    'project_plan_baseline',
    v_id::text,
    null,
    jsonb_build_object('name', trim(p_name)),
    '{}'::jsonb
  );

  return v_id;
end;
$projectflow$;

revoke all on function public.create_project_plan_baseline(text, text)
  from public;
grant execute on function public.create_project_plan_baseline(text, text)
  to authenticated;

create or replace function public.list_project_plan_baselines(
  p_project_id text,
  p_limit integer default 12
)
returns table (
  id uuid,
  name text,
  snapshot jsonb,
  created_by uuid,
  created_by_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'BASELINE_LIST_DENIED' using errcode = '42501';
  end if;

  return query
  select
    baseline.id,
    baseline.name,
    baseline.snapshot,
    baseline.created_by,
    coalesce(
      nullif(pr.full_name, ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'مستخدم'
    )::text,
    baseline.created_at
  from public.project_plan_baselines baseline
  left join auth.users u on u.id = baseline.created_by
  left join public.profiles pr on pr.id = baseline.created_by
  where baseline.project_id = p_project_id
  order by baseline.created_at desc
  limit least(50, greatest(1, coalesce(p_limit, 12)));
end;
$projectflow$;

revoke all on function public.list_project_plan_baselines(text, integer)
  from public;
grant execute on function public.list_project_plan_baselines(text, integer)
  to authenticated;

create or replace function public.delete_project_plan_baseline(
  p_project_id text,
  p_baseline_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_name text;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'BASELINE_MANAGE_DENIED' using errcode = '42501';
  end if;

  delete from public.project_plan_baselines
  where id = p_baseline_id
    and project_id = p_project_id
  returning name into v_name;

  if v_name is null then
    raise exception 'BASELINE_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.projectflow_append_audit_event(
    p_project_id,
    'execution',
    'planning_baseline_deleted',
    'project_plan_baseline',
    p_baseline_id::text,
    jsonb_build_object('name', v_name),
    null,
    '{}'::jsonb
  );
end;
$projectflow$;

revoke all on function public.delete_project_plan_baseline(text, uuid)
  from public;
grant execute on function public.delete_project_plan_baseline(text, uuid)
  to authenticated;


create or replace function public.projectflow_audit_node_execution_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_changed_fields jsonb := '[]'::jsonb;
begin
  if new.title is not distinct from old.title
    and new.status is not distinct from old.status
    and new.priority is not distinct from old.priority
    and new.progress is not distinct from old.progress
    and new.start_date is not distinct from old.start_date
    and new.due_date is not distinct from old.due_date
    and new.effort_hours is not distinct from old.effort_hours
  then
    return new;
  end if;

  select b.project_id into v_project_id
  from public.boards b
  where b.id = new.board_id;

  if v_project_id is null then
    return new;
  end if;

  if new.title is distinct from old.title then
    v_changed_fields := v_changed_fields || '"title"'::jsonb;
  end if;
  if new.status is distinct from old.status then
    v_changed_fields := v_changed_fields || '"status"'::jsonb;
  end if;
  if new.priority is distinct from old.priority then
    v_changed_fields := v_changed_fields || '"priority"'::jsonb;
  end if;
  if new.progress is distinct from old.progress then
    v_changed_fields := v_changed_fields || '"progress"'::jsonb;
  end if;
  if new.start_date is distinct from old.start_date then
    v_changed_fields := v_changed_fields || '"start_date"'::jsonb;
  end if;
  if new.due_date is distinct from old.due_date then
    v_changed_fields := v_changed_fields || '"due_date"'::jsonb;
  end if;
  if new.effort_hours is distinct from old.effort_hours then
    v_changed_fields := v_changed_fields || '"effort_hours"'::jsonb;
  end if;

  perform public.projectflow_append_audit_event(
    v_project_id,
    'execution',
    'node_execution_changed',
    'node',
    new.id,
    jsonb_build_object(
      'title', old.title,
      'status', old.status,
      'priority', old.priority,
      'progress', old.progress,
      'start_date', old.start_date,
      'due_date', old.due_date,
      'effort_hours', old.effort_hours
    ),
    jsonb_build_object(
      'title', new.title,
      'status', new.status,
      'priority', new.priority,
      'progress', new.progress,
      'start_date', new.start_date,
      'due_date', new.due_date,
      'effort_hours', new.effort_hours
    ),
    jsonb_build_object(
      'board_id', new.board_id,
      'changed_fields', v_changed_fields
    )
  );

  return new;
end;
$projectflow$;


drop trigger if exists canvas_nodes_audit_execution_change
  on public.canvas_nodes;
create trigger canvas_nodes_audit_execution_change
after update on public.canvas_nodes
for each row
execute function public.projectflow_audit_node_execution_change();

create or replace function public.apply_board_canvas_operations(
  p_board_id text,
  p_client_id uuid,
  p_base_revision bigint,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_current_revision bigint;
  v_new_revision bigint;
  v_operation jsonb;
  v_op text;
  v_entity jsonb;
  v_id text;
  v_expected_version bigint;
  v_actual_version bigint;
  v_row_count integer;
  v_applied_count integer := 0;
  v_applied_ops jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
begin
  select project_id, canvas_revision
    into v_project_id, v_current_revision
  from public.boards
  where id = p_board_id
  for update;

  if v_project_id is null or not public.can_edit_project(v_project_id) then
    raise exception 'BOARD_EDIT_DENIED' using errcode = '42501';
  end if;

  if p_client_id is null then
    raise exception 'INVALID_CLIENT_ID' using errcode = '22023';
  end if;

  if p_base_revision is null
    or p_base_revision < 0
    or p_base_revision > coalesce(v_current_revision, 0)
  then
    raise exception 'INVALID_BASE_REVISION' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_operations, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_CANVAS_OPERATIONS' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_operations, '[]'::jsonb)) > 2500 then
    raise exception 'TOO_MANY_CANVAS_OPERATIONS' using errcode = '22023';
  end if;

  for v_operation in
    select value
    from jsonb_array_elements(coalesce(p_operations, '[]'::jsonb))
  loop
    v_op := coalesce(v_operation->>'op', '');
    v_entity := coalesce(v_operation->'entity', '{}'::jsonb);
    v_id := coalesce(v_operation->>'id', v_entity->>'id');
    v_expected_version :=
      case
        when nullif(v_operation->>'expected_version', '') is null then null
        else (v_operation->>'expected_version')::bigint
      end;

    if v_op = 'node_create' then
      insert into public.canvas_nodes (
        id, board_id, kind, x, y, width, height, title, description,
        status, priority, progress, start_date, due_date, effort_hours, owner_label,
        tags, asset_id, style, version, created_at, updated_at
      )
      values (
        v_entity->>'id',
        p_board_id,
        coalesce(nullif(v_entity->>'kind',''), 'idea'),
        coalesce((v_entity->>'x')::double precision, 0),
        coalesce((v_entity->>'y')::double precision, 0),
        greatest(1, coalesce((v_entity->>'width')::double precision, 220)),
        greatest(1, coalesce((v_entity->>'height')::double precision, 140)),
        coalesce(v_entity->>'title', ''),
        nullif(v_entity->>'description',''),
        coalesce(nullif(v_entity->>'status',''), 'idea'),
        nullif(v_entity->>'priority',''),
        least(100, greatest(0, coalesce((v_entity->>'progress')::integer, 0))),
        nullif(v_entity->>'start_date','')::date,
        nullif(v_entity->>'due_date','')::date,
        nullif(v_entity->>'effort_hours','')::numeric,
        nullif(v_entity->>'owner',''),
        coalesce(
          array(
            select jsonb_array_elements_text(
              coalesce(v_entity->'tags','[]'::jsonb)
            )
          ),
          '{}'::text[]
        ),
        nullif(v_entity->>'asset_id',''),
        coalesce(v_entity->'style', '{}'::jsonb),
        1,
        coalesce(nullif(v_entity->>'created_at','')::timestamptz, now()),
        now()
      )
      on conflict (id) do nothing;

      get diagnostics v_row_count = row_count;

      if v_row_count = 0 then
        select version into v_actual_version
        from public.canvas_nodes
        where id = v_entity->>'id';

        v_conflicts := v_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity_type', 'node',
            'id', v_entity->>'id',
            'reason', 'already_exists',
            'actual_version', v_actual_version
          )
        );
      else
        v_applied_count := v_applied_count + 1;
        v_applied_ops := v_applied_ops || jsonb_build_array(
          jsonb_build_object(
            'op', v_op,
            'id', coalesce(v_id, v_entity->>'id')
          )
        );
      end if;

    elsif v_op = 'node_update' then
      update public.canvas_nodes
      set
        kind = coalesce(nullif(v_entity->>'kind',''), kind),
        x = coalesce((v_entity->>'x')::double precision, x),
        y = coalesce((v_entity->>'y')::double precision, y),
        width = greatest(1, coalesce((v_entity->>'width')::double precision, width)),
        height = greatest(1, coalesce((v_entity->>'height')::double precision, height)),
        title = coalesce(v_entity->>'title', title),
        description = nullif(v_entity->>'description',''),
        status = coalesce(nullif(v_entity->>'status',''), status),
        priority = nullif(v_entity->>'priority',''),
        progress = least(100, greatest(0, coalesce((v_entity->>'progress')::integer, progress))),
        start_date = nullif(v_entity->>'start_date','')::date,
        due_date = nullif(v_entity->>'due_date','')::date,
        effort_hours = case
          when v_entity ? 'effort_hours'
            then nullif(v_entity->>'effort_hours','')::numeric
          else effort_hours
        end,
        owner_label = nullif(v_entity->>'owner',''),
        tags = coalesce(
          array(
            select jsonb_array_elements_text(
              coalesce(v_entity->'tags','[]'::jsonb)
            )
          ),
          '{}'::text[]
        ),
        asset_id = nullif(v_entity->>'asset_id',''),
        style = coalesce(v_entity->'style', style),
        version = version + 1,
        updated_at = now()
      where id = v_id
        and board_id = p_board_id
        and version = v_expected_version;

      get diagnostics v_row_count = row_count;

      if v_row_count = 0 then
        select version into v_actual_version
        from public.canvas_nodes
        where id = v_id
          and board_id = p_board_id;

        v_conflicts := v_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity_type', 'node',
            'id', v_id,
            'reason', case
              when v_actual_version is null then 'missing'
              else 'version_mismatch'
            end,
            'expected_version', v_expected_version,
            'actual_version', v_actual_version
          )
        );
      else
        v_applied_count := v_applied_count + 1;
        v_applied_ops := v_applied_ops || jsonb_build_array(
          jsonb_build_object(
            'op', v_op,
            'id', coalesce(v_id, v_entity->>'id')
          )
        );
      end if;

    elsif v_op = 'node_delete' then
      select version into v_actual_version
      from public.canvas_nodes
      where id = v_id
        and board_id = p_board_id;

      if v_actual_version is null then
        null;
      elsif v_actual_version <> v_expected_version then
        v_conflicts := v_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity_type', 'node',
            'id', v_id,
            'reason', 'version_mismatch',
            'expected_version', v_expected_version,
            'actual_version', v_actual_version
          )
        );
      else
        delete from public.canvas_nodes
        where id = v_id
          and board_id = p_board_id
          and version = v_expected_version;

        v_applied_count := v_applied_count + 1;
        v_applied_ops := v_applied_ops || jsonb_build_array(
          jsonb_build_object(
            'op', v_op,
            'id', coalesce(v_id, v_entity->>'id')
          )
        );
      end if;

    elsif v_op = 'edge_create' then
      if not exists (
        select 1
        from public.canvas_nodes n
        where n.id = v_entity->>'source_node_id'
          and n.board_id = p_board_id
      ) or not exists (
        select 1
        from public.canvas_nodes n
        where n.id = v_entity->>'target_node_id'
          and n.board_id = p_board_id
      ) then
        v_conflicts := v_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity_type', 'edge',
            'id', v_entity->>'id',
            'reason', 'missing',
            'expected_version', null,
            'actual_version', null
          )
        );
        continue;
      end if;

      insert into public.canvas_edges (
        id, board_id, source_node_id, target_node_id,
        kind, label, version, created_at, updated_at
      )
      values (
        v_entity->>'id',
        p_board_id,
        v_entity->>'source_node_id',
        v_entity->>'target_node_id',
        coalesce(nullif(v_entity->>'kind',''), 'relationship'),
        nullif(v_entity->>'label',''),
        1,
        coalesce(nullif(v_entity->>'created_at','')::timestamptz, now()),
        now()
      )
      on conflict (id) do nothing;

      get diagnostics v_row_count = row_count;

      if v_row_count = 0 then
        select version into v_actual_version
        from public.canvas_edges
        where id = v_entity->>'id';

        v_conflicts := v_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity_type', 'edge',
            'id', v_entity->>'id',
            'reason', 'already_exists',
            'actual_version', v_actual_version
          )
        );
      else
        v_applied_count := v_applied_count + 1;
        v_applied_ops := v_applied_ops || jsonb_build_array(
          jsonb_build_object(
            'op', v_op,
            'id', coalesce(v_id, v_entity->>'id')
          )
        );
      end if;

    elsif v_op = 'edge_update' then
      if not exists (
        select 1
        from public.canvas_nodes n
        where n.id = v_entity->>'source_node_id'
          and n.board_id = p_board_id
      ) or not exists (
        select 1
        from public.canvas_nodes n
        where n.id = v_entity->>'target_node_id'
          and n.board_id = p_board_id
      ) then
        select version into v_actual_version
        from public.canvas_edges
        where id = v_id
          and board_id = p_board_id;

        v_conflicts := v_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity_type', 'edge',
            'id', v_id,
            'reason', 'missing',
            'expected_version', v_expected_version,
            'actual_version', v_actual_version
          )
        );
        continue;
      end if;

      update public.canvas_edges
      set
        source_node_id = coalesce(v_entity->>'source_node_id', source_node_id),
        target_node_id = coalesce(v_entity->>'target_node_id', target_node_id),
        kind = coalesce(nullif(v_entity->>'kind',''), kind),
        label = nullif(v_entity->>'label',''),
        version = version + 1,
        updated_at = now()
      where id = v_id
        and board_id = p_board_id
        and version = v_expected_version;

      get diagnostics v_row_count = row_count;

      if v_row_count = 0 then
        select version into v_actual_version
        from public.canvas_edges
        where id = v_id
          and board_id = p_board_id;

        v_conflicts := v_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity_type', 'edge',
            'id', v_id,
            'reason', case
              when v_actual_version is null then 'missing'
              else 'version_mismatch'
            end,
            'expected_version', v_expected_version,
            'actual_version', v_actual_version
          )
        );
      else
        v_applied_count := v_applied_count + 1;
        v_applied_ops := v_applied_ops || jsonb_build_array(
          jsonb_build_object(
            'op', v_op,
            'id', coalesce(v_id, v_entity->>'id')
          )
        );
      end if;

    elsif v_op = 'edge_delete' then
      select version into v_actual_version
      from public.canvas_edges
      where id = v_id
        and board_id = p_board_id;

      if v_actual_version is null then
        null;
      elsif v_actual_version <> v_expected_version then
        v_conflicts := v_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity_type', 'edge',
            'id', v_id,
            'reason', 'version_mismatch',
            'expected_version', v_expected_version,
            'actual_version', v_actual_version
          )
        );
      else
        delete from public.canvas_edges
        where id = v_id
          and board_id = p_board_id
          and version = v_expected_version;

        v_applied_count := v_applied_count + 1;
        v_applied_ops := v_applied_ops || jsonb_build_array(
          jsonb_build_object(
            'op', v_op,
            'id', coalesce(v_id, v_entity->>'id')
          )
        );
      end if;

    elsif v_op = 'stroke_create' then
      insert into public.canvas_strokes (
        id, board_id, tool, points, size, color,
        version, created_at, updated_at
      )
      values (
        v_entity->>'id',
        p_board_id,
        coalesce(nullif(v_entity->>'tool',''), 'pen'),
        coalesce(v_entity->'points', '[]'::jsonb),
        least(48, greatest(0.1, coalesce((v_entity->>'size')::double precision, 3))),
        coalesce(nullif(v_entity->>'color',''), 'ink'),
        1,
        coalesce(nullif(v_entity->>'created_at','')::timestamptz, now()),
        now()
      )
      on conflict (id) do nothing;

      get diagnostics v_row_count = row_count;

      if v_row_count = 0 then
        select version into v_actual_version
        from public.canvas_strokes
        where id = v_entity->>'id';

        v_conflicts := v_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity_type', 'stroke',
            'id', v_entity->>'id',
            'reason', 'already_exists',
            'actual_version', v_actual_version
          )
        );
      else
        v_applied_count := v_applied_count + 1;
        v_applied_ops := v_applied_ops || jsonb_build_array(
          jsonb_build_object(
            'op', v_op,
            'id', coalesce(v_id, v_entity->>'id')
          )
        );
      end if;

    elsif v_op = 'stroke_update' then
      update public.canvas_strokes
      set
        tool = coalesce(nullif(v_entity->>'tool',''), tool),
        points = coalesce(v_entity->'points', points),
        size = least(48, greatest(0.1, coalesce((v_entity->>'size')::double precision, size))),
        color = coalesce(nullif(v_entity->>'color',''), color),
        version = version + 1,
        updated_at = now()
      where id = v_id
        and board_id = p_board_id
        and version = v_expected_version;

      get diagnostics v_row_count = row_count;

      if v_row_count = 0 then
        select version into v_actual_version
        from public.canvas_strokes
        where id = v_id
          and board_id = p_board_id;

        v_conflicts := v_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity_type', 'stroke',
            'id', v_id,
            'reason', case
              when v_actual_version is null then 'missing'
              else 'version_mismatch'
            end,
            'expected_version', v_expected_version,
            'actual_version', v_actual_version
          )
        );
      else
        v_applied_count := v_applied_count + 1;
        v_applied_ops := v_applied_ops || jsonb_build_array(
          jsonb_build_object(
            'op', v_op,
            'id', coalesce(v_id, v_entity->>'id')
          )
        );
      end if;

    elsif v_op = 'stroke_delete' then
      select version into v_actual_version
      from public.canvas_strokes
      where id = v_id
        and board_id = p_board_id;

      if v_actual_version is null then
        null;
      elsif v_actual_version <> v_expected_version then
        v_conflicts := v_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity_type', 'stroke',
            'id', v_id,
            'reason', 'version_mismatch',
            'expected_version', v_expected_version,
            'actual_version', v_actual_version
          )
        );
      else
        delete from public.canvas_strokes
        where id = v_id
          and board_id = p_board_id
          and version = v_expected_version;

        v_applied_count := v_applied_count + 1;
        v_applied_ops := v_applied_ops || jsonb_build_array(
          jsonb_build_object(
            'op', v_op,
            'id', coalesce(v_id, v_entity->>'id')
          )
        );
      end if;

    else
      raise exception 'INVALID_CANVAS_OPERATION: %', v_op using errcode = '22023';
    end if;
  end loop;

  if v_applied_count > 0 then
    update public.boards
    set
      canvas_revision = canvas_revision + 1,
      updated_at = now()
    where id = p_board_id
    returning canvas_revision into v_new_revision;

    insert into public.board_collaboration_events (
      board_id,
      revision,
      actor_user_id,
      client_id,
      operations
    )
    values (
      p_board_id,
      v_new_revision,
      auth.uid(),
      p_client_id,
      v_applied_ops
    );

    delete from public.board_collaboration_events
    where board_id = p_board_id
      and revision < greatest(0, v_new_revision - 500);
  else
    v_new_revision := coalesce(v_current_revision, 0);
  end if;

  return jsonb_build_object(
    'revision', v_new_revision,
    'applied_count', v_applied_count,
    'conflicts', v_conflicts,
    'snapshot', public.get_board_canvas(p_board_id)
  );
end;
$projectflow$;


revoke all on function public.apply_board_canvas_operations(
  text, uuid, bigint, jsonb
) from public;
grant execute on function public.apply_board_canvas_operations(
  text, uuid, bigint, jsonb
) to authenticated;

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

  delete from public.canvas_edges where board_id = p_board_id;
  delete from public.canvas_strokes where board_id = p_board_id;
  delete from public.canvas_nodes where board_id = p_board_id;

  for n in
    select value from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb))
  loop
    insert into public.canvas_nodes (
      id, board_id, kind, x, y, width, height, title, description,
      status, priority, progress, start_date, due_date, effort_hours, owner_label,
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
      nullif(n->>'effort_hours','')::numeric,
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
end;
$projectflow$;


revoke all on function public.save_board_canvas(
  text, jsonb, jsonb, jsonb, jsonb
) from public;
grant execute on function public.save_board_canvas(
  text, jsonb, jsonb, jsonb, jsonb
) to authenticated;
