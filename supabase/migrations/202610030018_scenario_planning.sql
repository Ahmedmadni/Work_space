-- Phase 27: transactional scenario planning and resource rebalancing.

insert into public.projectflow_schema_versions (version, label)
values (18, 'scenario-planning-resource-rebalancing')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create or replace function public.apply_project_planning_scenario(
  p_project_id text,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_change jsonb;
  v_current public.canvas_nodes%rowtype;
  v_start date;
  v_due date;
  v_effort numeric;
  v_current_effort numeric;
  v_assignee uuid;
  v_result jsonb;
  v_applied integer := 0;
begin
  if not public.can_edit_project(p_project_id) then
    raise exception 'SCENARIO_APPLY_DENIED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_changes) <> 'array'
     or jsonb_array_length(p_changes) < 1
     or jsonb_array_length(p_changes) > 50 then
    raise exception 'SCENARIO_INVALID_CHANGESET' using errcode = '22023';
  end if;

  -- Validation pass. Nothing is mutated until every row is valid.
  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    if nullif(v_change->>'board_id', '') is null
       or nullif(v_change->>'node_id', '') is null
       or nullif(v_change->>'expected_version', '') is null then
      raise exception 'SCENARIO_INVALID_CHANGE' using errcode = '22023';
    end if;

    select n.* into v_current
    from public.canvas_nodes n
    join public.boards b on b.id = n.board_id
    where n.id = v_change->>'node_id'
      and n.board_id = v_change->>'board_id'
      and b.project_id = p_project_id;

    if v_current.id is null then
      raise exception 'SCENARIO_NODE_NOT_FOUND:%', v_change->>'node_id'
        using errcode = 'P0002';
    end if;

    if v_current.version <> (v_change->>'expected_version')::bigint then
      raise exception 'SCENARIO_VERSION_MISMATCH:%', v_change->>'node_id'
        using errcode = '40001';
    end if;

    select effort_hours into v_current_effort
    from public.project_node_planning
    where project_id = p_project_id
      and node_id = v_current.id;

    v_start := case
      when v_change ? 'start_date' and nullif(v_change->>'start_date', '') is not null
        then (v_change->>'start_date')::date
      when v_change ? 'start_date' then null
      else v_current.start_date
    end;
    v_due := case
      when v_change ? 'due_date' and nullif(v_change->>'due_date', '') is not null
        then (v_change->>'due_date')::date
      when v_change ? 'due_date' then null
      else v_current.due_date
    end;
    v_effort := case
      when v_change ? 'effort_hours'
        and jsonb_typeof(v_change->'effort_hours') <> 'null'
        then (v_change->>'effort_hours')::numeric
      when v_change ? 'effort_hours' then null
      else v_current_effort
    end;

    if v_start is not null and v_due is not null and v_start > v_due then
      raise exception 'SCENARIO_INVALID_DATE_RANGE:%', v_current.id
        using errcode = '22023';
    end if;

    if v_effort is not null and (v_effort < 0 or v_effort > 10000) then
      raise exception 'SCENARIO_INVALID_EFFORT:%', v_current.id
        using errcode = '22023';
    end if;

    if v_change ? 'assignee_user_id'
       and jsonb_typeof(v_change->'assignee_user_id') <> 'null' then
      v_assignee := (v_change->>'assignee_user_id')::uuid;
      if not exists (
        select 1
        from public.projects p
        where p.id = p_project_id
          and (
            p.created_by = v_assignee
            or exists (
              select 1
              from public.project_members pm
              where pm.project_id = p_project_id
                and pm.user_id = v_assignee
                and pm.role in ('owner','admin','editor')
            )
          )
      ) then
        raise exception 'SCENARIO_ASSIGNEE_NOT_IN_PROJECT:%', v_current.id
          using errcode = '22023';
      end if;
    end if;
  end loop;

  -- Apply pass. Any exception rolls the whole function back.
  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    select n.* into v_current
    from public.canvas_nodes n
    where n.id = v_change->>'node_id'
      and n.board_id = v_change->>'board_id';

    if v_change ? 'start_date'
       or v_change ? 'due_date'
       or v_change ? 'effort_hours' then
      v_result := public.update_canvas_node_schedule(
        p_project_id,
        v_change->>'board_id',
        v_change->>'node_id',
        (v_change->>'expected_version')::bigint,
        v_change ? 'start_date',
        case
          when v_change ? 'start_date'
            and nullif(v_change->>'start_date', '') is not null
            then (v_change->>'start_date')::date
          else null
        end,
        v_change ? 'due_date',
        case
          when v_change ? 'due_date'
            and nullif(v_change->>'due_date', '') is not null
            then (v_change->>'due_date')::date
          else null
        end,
        v_change ? 'effort_hours',
        case
          when v_change ? 'effort_hours'
            and jsonb_typeof(v_change->'effort_hours') <> 'null'
            then (v_change->>'effort_hours')::numeric
          else null
        end
      );

      if coalesce((v_result->>'ok')::boolean, false) is not true then
        raise exception 'SCENARIO_VERSION_MISMATCH:%', v_change->>'node_id'
          using errcode = '40001';
      end if;
    end if;

    if v_change ? 'assignee_user_id' then
      perform public.set_canvas_node_assignee(
        p_project_id,
        v_change->>'board_id',
        v_change->>'node_id',
        case
          when jsonb_typeof(v_change->'assignee_user_id') = 'null'
            then null
          else (v_change->>'assignee_user_id')::uuid
        end
      );
    end if;

    v_applied := v_applied + 1;
  end loop;

  perform public.projectflow_append_audit_event(
    p_project_id,
    'execution',
    'planning_scenario_applied',
    'project',
    p_project_id,
    null,
    jsonb_build_object(
      'change_count', v_applied
    ),
    jsonb_build_object(
      'source', 'scenario_planning'
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
    'planning_scenario_applied',
    'project',
    p_project_id,
    jsonb_build_object('change_count', v_applied)
  );

  return jsonb_build_object(
    'ok', true,
    'applied_count', v_applied
  );
end;
$projectflow$;

revoke all on function public.apply_project_planning_scenario(text, jsonb)
  from public;
grant execute on function public.apply_project_planning_scenario(text, jsonb)
  to authenticated;
