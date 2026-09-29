-- Phase 24: complete local-to-cloud cutover metadata migration.
-- Bulk-imports local-only execution/planning metadata without generating
-- artificial task notifications or collaboration events.

insert into public.projectflow_schema_versions (version, label)
values (16, 'complete-cloud-cutover')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create or replace function public.migrate_project_cutover_metadata(
  p_project_id text,
  p_assignments jsonb default '[]'::jsonb,
  p_effort jsonb default '[]'::jsonb,
  p_capacity jsonb default '[]'::jsonb,
  p_baselines jsonb default '[]'::jsonb,
  p_local_user_id text default 'user-local'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_row jsonb;
  v_item jsonb;
  v_node_id text;
  v_board_id text;
  v_effort numeric;
  v_capacity numeric;
  v_baseline_id uuid;
  v_baseline_name text;
  v_baseline_created timestamptz;
  v_assignments integer := 0;
  v_effort_count integer := 0;
  v_capacity_count integer := 0;
  v_baseline_count integer := 0;
  v_baseline_item_count integer := 0;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'CUTOVER_MANAGE_DENIED' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_assignments, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_effort, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_capacity, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_baselines, '[]'::jsonb)) <> 'array'
  then
    raise exception 'CUTOVER_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  -- Local mode only has one real actor. Map that actor to the authenticated
  -- cloud account without emitting task-assignment notifications.
  for v_row in
    select value
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb))
  loop
    v_node_id := nullif(v_row->>'node_id', '');
    v_board_id := nullif(v_row->>'board_id', '');

    if v_node_id is null or v_board_id is null then
      continue;
    end if;

    if not exists (
      select 1
      from public.canvas_nodes n
      join public.boards b on b.id = n.board_id
      where n.id = v_node_id
        and n.board_id = v_board_id
        and b.project_id = p_project_id
    ) then
      continue;
    end if;

    if coalesce(v_row->>'assignee_user_id', '') = p_local_user_id then
      insert into public.canvas_node_assignments (
        node_id,
        board_id,
        assignee_user_id,
        updated_by,
        updated_at
      )
      values (
        v_node_id,
        v_board_id,
        auth.uid(),
        auth.uid(),
        now()
      )
      on conflict (node_id) do update
      set
        board_id = excluded.board_id,
        assignee_user_id = excluded.assignee_user_id,
        updated_by = auth.uid(),
        updated_at = now();

      update public.canvas_nodes
      set owner_label = null
      where id = v_node_id
        and board_id = v_board_id;

      v_assignments := v_assignments + 1;
    end if;
  end loop;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(p_effort, '[]'::jsonb))
  loop
    v_node_id := nullif(v_row->>'node_id', '');
    v_board_id := nullif(v_row->>'board_id', '');

    begin
      v_effort := nullif(v_row->>'effort_hours', '')::numeric;
    exception when others then
      v_effort := null;
    end;

    if v_node_id is null
      or v_board_id is null
      or v_effort is null
      or v_effort < 0.25
      or v_effort > 10000
    then
      continue;
    end if;

    if not exists (
      select 1
      from public.canvas_nodes n
      join public.boards b on b.id = n.board_id
      where n.id = v_node_id
        and n.board_id = v_board_id
        and b.project_id = p_project_id
    ) then
      continue;
    end if;

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
      v_board_id,
      v_node_id,
      v_effort,
      auth.uid(),
      now()
    )
    on conflict (project_id, node_id) do update
    set
      board_id = excluded.board_id,
      effort_hours = excluded.effort_hours,
      updated_by = auth.uid(),
      updated_at = now();

    v_effort_count := v_effort_count + 1;
  end loop;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(p_capacity, '[]'::jsonb))
  loop
    if coalesce(v_row->>'user_id', '') <> p_local_user_id then
      continue;
    end if;

    begin
      v_capacity := nullif(v_row->>'weekly_capacity_hours', '')::numeric;
    exception when others then
      v_capacity := null;
    end;

    if v_capacity is null or v_capacity < 1 or v_capacity > 168 then
      continue;
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
      auth.uid(),
      v_capacity,
      auth.uid(),
      now()
    )
    on conflict (project_id, user_id) do update
    set
      weekly_capacity_hours = excluded.weekly_capacity_hours,
      updated_by = auth.uid(),
      updated_at = now();

    v_capacity_count := v_capacity_count + 1;
  end loop;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(p_baselines, '[]'::jsonb))
  loop
    begin
      v_baseline_id := nullif(v_row->>'id', '')::uuid;
    exception when others then
      v_baseline_id := null;
    end;

    v_baseline_name := trim(coalesce(v_row->>'name', ''));
    begin
      v_baseline_created :=
        coalesce(nullif(v_row->>'created_at', '')::timestamptz, now());
    exception when others then
      v_baseline_created := now();
    end;

    if v_baseline_id is null
      or char_length(v_baseline_name) < 1
      or char_length(v_baseline_name) > 120
      or jsonb_typeof(coalesce(v_row->'items', '[]'::jsonb)) <> 'array'
    then
      continue;
    end if;

    insert into public.project_schedule_baselines (
      id,
      project_id,
      name,
      created_by,
      created_at
    )
    values (
      v_baseline_id,
      p_project_id,
      v_baseline_name,
      auth.uid(),
      v_baseline_created
    )
    on conflict (id) do update
    set
      name = excluded.name
    where public.project_schedule_baselines.project_id = p_project_id;

    if not exists (
      select 1
      from public.project_schedule_baselines bl
      where bl.id = v_baseline_id
        and bl.project_id = p_project_id
    ) then
      continue;
    end if;

    delete from public.project_schedule_baseline_items
    where baseline_id = v_baseline_id
      and project_id = p_project_id;

    for v_item in
      select value
      from jsonb_array_elements(coalesce(v_row->'items', '[]'::jsonb))
    loop
      v_node_id := nullif(v_item->>'node_id', '');
      v_board_id := nullif(v_item->>'board_id', '');

      if v_node_id is null
        or v_board_id is null
        or not exists (
          select 1
          from public.boards b
          where b.id = v_board_id
            and b.project_id = p_project_id
        )
      then
        continue;
      end if;

      begin
        v_effort := nullif(v_item->>'effort_hours', '')::numeric;
      exception when others then
        v_effort := null;
      end;

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
      values (
        v_baseline_id,
        p_project_id,
        v_board_id,
        v_node_id,
        coalesce(v_item->>'title', ''),
        coalesce(nullif(v_item->>'kind', ''), 'task'),
        nullif(v_item->>'start_date', '')::date,
        nullif(v_item->>'due_date', '')::date,
        case
          when v_item->>'status' in (
            'idea','planned','in_progress','done','blocked'
          ) then v_item->>'status'
          else 'planned'
        end,
        least(
          100,
          greatest(0, coalesce((v_item->>'progress')::integer, 0))
        ),
        case
          when coalesce(v_item->>'assignee_user_id', '') = p_local_user_id
            then auth.uid()
          else null
        end,
        case
          when v_effort is not null
            and v_effort >= 0.25
            and v_effort <= 10000
          then v_effort
          else null
        end
      )
      on conflict (baseline_id, node_id) do update
      set
        board_id = excluded.board_id,
        title = excluded.title,
        kind = excluded.kind,
        start_date = excluded.start_date,
        due_date = excluded.due_date,
        status = excluded.status,
        progress = excluded.progress,
        assignee_user_id = excluded.assignee_user_id,
        effort_hours = excluded.effort_hours;

      v_baseline_item_count := v_baseline_item_count + 1;
    end loop;

    v_baseline_count := v_baseline_count + 1;
  end loop;

  perform public.projectflow_append_audit_event(
    p_project_id,
    'project',
    'cloud_cutover_metadata_migrated',
    'project',
    p_project_id,
    null,
    jsonb_build_object(
      'assignments', v_assignments,
      'effort', v_effort_count,
      'capacity', v_capacity_count,
      'baselines', v_baseline_count,
      'baseline_items', v_baseline_item_count
    ),
    jsonb_build_object('source', 'local_browser_cutover')
  );

  return jsonb_build_object(
    'assignments', v_assignments,
    'effort', v_effort_count,
    'capacity', v_capacity_count,
    'baselines', v_baseline_count,
    'baseline_items', v_baseline_item_count
  );
end;
$projectflow$;

revoke all on function public.migrate_project_cutover_metadata(
  text, jsonb, jsonb, jsonb, jsonb, text
) from public;
grant execute on function public.migrate_project_cutover_metadata(
  text, jsonb, jsonb, jsonb, jsonb, text
) to authenticated;

-- Upgrade the readiness contract for the complete cutover feature set.
create or replace function public.get_projectflow_backend_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $projectflow$
declare
  v_version integer := 0;
  v_missing jsonb := '[]'::jsonb;
  v_present integer := 0;
  v_required integer := 0;
  v_item record;
begin
  select coalesce(max(version), 0)
  into v_version
  from public.projectflow_schema_versions;

  for v_item in
    select *
    from (
      values
        ('table:projects', to_regclass('public.projects') is not null),
        ('table:boards', to_regclass('public.boards') is not null),
        ('table:canvas_nodes', to_regclass('public.canvas_nodes') is not null),
        ('table:canvas_edges', to_regclass('public.canvas_edges') is not null),
        ('table:project_documents', to_regclass('public.project_documents') is not null),
        ('table:document_annotations', to_regclass('public.document_annotations') is not null),
        ('table:project_members', to_regclass('public.project_members') is not null),
        ('table:canvas_node_assignments', to_regclass('public.canvas_node_assignments') is not null),
        ('table:project_automation_rules', to_regclass('public.project_automation_rules') is not null),
        ('table:project_automation_runs', to_regclass('public.project_automation_runs') is not null),
        ('table:project_audit_events', to_regclass('public.project_audit_events') is not null),
        ('table:project_node_planning', to_regclass('public.project_node_planning') is not null),
        ('table:project_member_capacity', to_regclass('public.project_member_capacity') is not null),
        ('table:project_schedule_baselines', to_regclass('public.project_schedule_baselines') is not null),
        ('function:get_board_canvas', exists (
          select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='get_board_canvas'
        )),
        ('function:save_board_canvas', exists (
          select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='save_board_canvas'
        )),
        ('function:update_canvas_node_execution', exists (
          select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='update_canvas_node_execution'
        )),
        ('function:save_document_annotations', exists (
          select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='save_document_annotations'
        )),
        ('function:list_project_automation_rules', exists (
          select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='list_project_automation_rules'
        )),
        ('function:get_project_automation_health', exists (
          select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='get_project_automation_health'
        )),
        ('function:list_project_audit_events', exists (
          select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='list_project_audit_events'
        )),
        ('function:list_project_planning_data', exists (
          select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='list_project_planning_data'
        )),
        ('function:migrate_project_cutover_metadata', exists (
          select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='migrate_project_cutover_metadata'
        )),
        ('column:canvas_nodes.version', exists (
          select 1 from information_schema.columns
          where table_schema='public' and table_name='canvas_nodes'
            and column_name='version'
        )),
        ('column:boards.canvas_revision', exists (
          select 1 from information_schema.columns
          where table_schema='public' and table_name='boards'
            and column_name='canvas_revision'
        ))
    ) as checks(name, present)
  loop
    v_required := v_required + 1;
    if v_item.present then
      v_present := v_present + 1;
    else
      v_missing := v_missing || jsonb_build_array(v_item.name);
    end if;
  end loop;

  return jsonb_build_object(
    'ready',
      v_version >= 16
      and jsonb_array_length(v_missing) = 0,
    'schema_version', v_version,
    'expected_schema_version', 16,
    'checks_passed', v_present,
    'checks_total', v_required,
    'missing', v_missing,
    'checked_at', now(),
    'backend_contract', 'projectflow.cloud.v2'
  );
end;
$projectflow$;

revoke all on function public.get_projectflow_backend_readiness() from public;
grant execute on function public.get_projectflow_backend_readiness()
  to anon, authenticated;
