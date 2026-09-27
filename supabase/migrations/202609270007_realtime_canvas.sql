-- Phase 14: conflict-safe realtime canvas collaboration.
-- Adds entity versions, board revisions, per-user viewport, durable collaboration events,
-- and private Realtime authorization for board cursor/selection broadcasts.

alter table public.boards
  add column if not exists canvas_revision bigint not null default 0;

alter table public.canvas_nodes
  add column if not exists version bigint not null default 1;

alter table public.canvas_edges
  add column if not exists version bigint not null default 1;

alter table public.canvas_strokes
  add column if not exists version bigint not null default 1;

create table if not exists public.board_view_states (
  board_id text not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  viewport jsonb not null default '{"x":0,"y":0,"zoom":1}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create table if not exists public.board_collaboration_events (
  id bigint generated always as identity primary key,
  board_id text not null references public.boards(id) on delete cascade,
  revision bigint not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  client_id uuid not null,
  operations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (board_id, revision)
);

create index if not exists board_collaboration_events_board_revision_idx
  on public.board_collaboration_events(board_id, revision desc);

alter table public.board_view_states enable row level security;
alter table public.board_collaboration_events enable row level security;

drop policy if exists board_view_states_select_self on public.board_view_states;
create policy board_view_states_select_self on public.board_view_states
for select to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.boards b
    where b.id = board_id
      and public.can_access_project(b.project_id)
  )
);

drop policy if exists board_collaboration_events_select_member on public.board_collaboration_events;
create policy board_collaboration_events_select_member on public.board_collaboration_events
for select to authenticated
using (
  exists (
    select 1
    from public.boards b
    where b.id = board_id
      and public.can_access_project(b.project_id)
  )
);

revoke insert, update, delete on public.board_view_states from authenticated;
revoke insert, update, delete on public.board_collaboration_events from authenticated;
grant select on public.board_view_states to authenticated;
grant select on public.board_collaboration_events to authenticated;

-- Canvas row writes must go through revision-aware RPCs.
revoke insert, update, delete on public.canvas_nodes from authenticated;
revoke insert, update, delete on public.canvas_edges from authenticated;
revoke insert, update, delete on public.canvas_strokes from authenticated;
grant select on public.canvas_nodes to authenticated;
grant select on public.canvas_edges to authenticated;
grant select on public.canvas_strokes to authenticated;

create or replace function public.save_board_viewport(
  p_board_id text,
  p_viewport jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_viewport jsonb;
begin
  select project_id into v_project_id
  from public.boards
  where id = p_board_id;

  if v_project_id is null or not public.can_access_project(v_project_id) then
    raise exception 'BOARD_ACCESS_DENIED' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_viewport, '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_VIEWPORT' using errcode = '22023';
  end if;

  v_viewport := jsonb_build_object(
    'x', coalesce((p_viewport->>'x')::double precision, 0),
    'y', coalesce((p_viewport->>'y')::double precision, 0),
    'zoom', least(
      2.5,
      greatest(
        0.25,
        coalesce((p_viewport->>'zoom')::double precision, 1)
      )
    )
  );

  insert into public.board_view_states (
    board_id,
    user_id,
    viewport,
    updated_at
  )
  values (
    p_board_id,
    auth.uid(),
    v_viewport,
    now()
  )
  on conflict (board_id, user_id) do update
  set
    viewport = excluded.viewport,
    updated_at = now();
end;
$projectflow$;

revoke all on function public.save_board_viewport(text, jsonb) from public;
grant execute on function public.save_board_viewport(text, jsonb) to authenticated;

create or replace function public.get_board_canvas(p_board_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_viewport jsonb;
  v_board_viewport jsonb;
  v_updated_at timestamptz;
  v_revision bigint;
begin
  select
    project_id,
    viewport,
    updated_at,
    canvas_revision
  into
    v_project_id,
    v_board_viewport,
    v_updated_at,
    v_revision
  from public.boards
  where id = p_board_id;

  if v_project_id is null or not public.can_access_project(v_project_id) then
    raise exception 'BOARD_ACCESS_DENIED' using errcode = '42501';
  end if;

  select viewport into v_viewport
  from public.board_view_states
  where board_id = p_board_id
    and user_id = auth.uid();

  return jsonb_build_object(
    'board_id', p_board_id,
    'revision', coalesce(v_revision, 0),
    'nodes', coalesce((
      select jsonb_agg(
        (to_jsonb(n) - 'owner_label') ||
        jsonb_build_object('owner', n.owner_label)
        order by n.created_at, n.id
      )
      from public.canvas_nodes n
      where n.board_id = p_board_id
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
      from public.canvas_edges e
      where e.board_id = p_board_id
    ), '[]'::jsonb),
    'strokes', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at, s.id)
      from public.canvas_strokes s
      where s.board_id = p_board_id
    ), '[]'::jsonb),
    'viewport', coalesce(
      v_viewport,
      v_board_viewport,
      '{"x":0,"y":0,"zoom":1}'::jsonb
    ),
    'updated_at', v_updated_at
  );
end;
$projectflow$;

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

  if jsonb_array_length(coalesce(p_operations, '[]'::jsonb)) > 500 then
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
        status, priority, progress, start_date, due_date, owner_label,
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
        v_applied_ops := v_applied_ops || jsonb_build_array(v_operation);
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
        v_applied_ops := v_applied_ops || jsonb_build_array(v_operation);
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
        v_applied_ops := v_applied_ops || jsonb_build_array(v_operation);
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
        v_applied_ops := v_applied_ops || jsonb_build_array(v_operation);
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
        v_applied_ops := v_applied_ops || jsonb_build_array(v_operation);
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
        v_applied_ops := v_applied_ops || jsonb_build_array(v_operation);
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
        v_applied_ops := v_applied_ops || jsonb_build_array(v_operation);
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
        v_applied_ops := v_applied_ops || jsonb_build_array(v_operation);
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
        v_applied_ops := v_applied_ops || jsonb_build_array(v_operation);
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

-- Keep full snapshot replacement only for explicit restore/import paths.
-- It is revisioned and emits an event so open collaborators refresh immediately.
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
      greatest(1, coalesce((n->>'version')::bigint, 1)),
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
      greatest(1, coalesce((e->>'version')::bigint, 1)),
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
      greatest(1, coalesce((s->>'version')::bigint, 1)),
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

-- Expose collaboration-event inserts through Supabase Realtime Postgres Changes.
do $projectflow$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'board_collaboration_events'
  ) then
    alter publication supabase_realtime
      add table public.board_collaboration_events;
  end if;
end;
$projectflow$;

-- Private board Broadcast authorization. Topic format: board:<board_id>.
drop policy if exists projectflow_board_realtime_read on realtime.messages;
create policy projectflow_board_realtime_read
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) like 'board:%'
  and exists (
    select 1
    from public.boards b
    where b.id = substring((select realtime.topic()) from 7)
      and public.can_access_project(b.project_id)
  )
);

drop policy if exists projectflow_board_realtime_write on realtime.messages;
create policy projectflow_board_realtime_write
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) like 'board:%'
  and exists (
    select 1
    from public.boards b
    where b.id = substring((select realtime.topic()) from 7)
      and public.can_access_project(b.project_id)
  )
);
