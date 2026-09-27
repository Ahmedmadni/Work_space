-- Phase 17: project execution center quick edits.
-- Version-aware task status/priority updates that share the same realtime stream as the canvas.

create or replace function public.update_canvas_node_execution(
  p_project_id text,
  p_board_id text,
  p_node_id text,
  p_expected_version bigint,
  p_set_status boolean default false,
  p_status text default null,
  p_set_priority boolean default false,
  p_priority text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_old_status text;
  v_old_priority text;
  v_current_version bigint;
  v_new_status text;
  v_new_priority text;
  v_new_progress integer;
  v_new_version bigint;
  v_updated_at timestamptz;
  v_revision bigint;
begin
  if not public.can_edit_project(p_project_id) then
    raise exception 'TASK_EXECUTION_UPDATE_DENIED' using errcode = '42501';
  end if;

  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'INVALID_TASK_EXPECTED_VERSION' using errcode = '22023';
  end if;

  if p_set_status and p_status not in (
    'idea',
    'planned',
    'in_progress',
    'done',
    'blocked'
  ) then
    raise exception 'INVALID_TASK_STATUS' using errcode = '22023';
  end if;

  if p_set_priority
    and p_priority is not null
    and p_priority not in ('critical','high','medium','low')
  then
    raise exception 'INVALID_TASK_PRIORITY' using errcode = '22023';
  end if;

  select
    n.status,
    n.priority,
    n.version
  into
    v_old_status,
    v_old_priority,
    v_current_version
  from public.canvas_nodes n
  join public.boards b on b.id = n.board_id
  where n.id = p_node_id
    and n.board_id = p_board_id
    and b.project_id = p_project_id
  for update of n;

  if v_current_version is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'missing'
    );
  end if;

  if v_current_version <> p_expected_version then
    return jsonb_build_object(
      'ok', false,
      'reason', 'version_mismatch',
      'actual_version', v_current_version
    );
  end if;

  v_new_status :=
    case when p_set_status then p_status else v_old_status end;
  v_new_priority :=
    case when p_set_priority then p_priority else v_old_priority end;

  if v_new_status is not distinct from v_old_status
    and v_new_priority is not distinct from v_old_priority
  then
    select progress, updated_at
      into v_new_progress, v_updated_at
    from public.canvas_nodes
    where id = p_node_id
      and board_id = p_board_id;

    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'node_id', p_node_id,
      'version', v_current_version,
      'status', v_old_status,
      'priority', v_old_priority,
      'progress', v_new_progress,
      'updated_at', v_updated_at
    );
  end if;

  update public.canvas_nodes
  set
    status = v_new_status,
    priority = v_new_priority,
    progress = case
      when p_set_status and v_new_status = 'done' then 100
      when p_set_status
        and v_old_status = 'done'
        and v_new_status <> 'done'
        and progress = 100
      then 0
      else progress
    end,
    version = version + 1,
    updated_at = now()
  where id = p_node_id
    and board_id = p_board_id
    and version = p_expected_version
  returning
    version,
    progress,
    updated_at
  into
    v_new_version,
    v_new_progress,
    v_updated_at;

  if v_new_version is null then
    select version into v_current_version
    from public.canvas_nodes
    where id = p_node_id
      and board_id = p_board_id;

    return jsonb_build_object(
      'ok', false,
      'reason', case
        when v_current_version is null then 'missing'
        else 'version_mismatch'
      end,
      'actual_version', v_current_version
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
        'op', 'node_execution',
        'id', p_node_id
      )
    )
  );

  if v_new_priority is distinct from v_old_priority then
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
      'task_priority_changed',
      'node',
      p_node_id,
      jsonb_build_object(
        'board_id', p_board_id,
        'old_priority', v_old_priority,
        'priority', v_new_priority
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'node_id', p_node_id,
    'version', v_new_version,
    'status', v_new_status,
    'priority', v_new_priority,
    'progress', v_new_progress,
    'updated_at', v_updated_at,
    'revision', v_revision
  );
end;
$projectflow$;

revoke all on function public.update_canvas_node_execution(
  text, text, text, bigint, boolean, text, boolean, text
) from public;
grant execute on function public.update_canvas_node_execution(
  text, text, text, bigint, boolean, text, boolean, text
) to authenticated;


create or replace function public.cleanup_downgraded_project_member_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_board record;
  v_revision bigint;
  v_node_ids jsonb;
begin
  if old.role not in ('owner','admin','editor')
    or new.role <> 'viewer'
  then
    return new;
  end if;

  for v_board in
    select
      b.id as board_id,
      coalesce(
        jsonb_agg(a.node_id order by a.node_id)
          filter (where a.node_id is not null),
        '[]'::jsonb
      ) as node_ids
    from public.boards b
    left join public.canvas_node_assignments a
      on a.board_id = b.id
      and a.assignee_user_id = new.user_id
    where b.project_id = new.project_id
    group by b.id
  loop
    v_node_ids := v_board.node_ids;
    if jsonb_array_length(v_node_ids) = 0 then
      continue;
    end if;

    delete from public.canvas_node_assignments
    where board_id = v_board.board_id
      and assignee_user_id = new.user_id;

    update public.boards
    set
      canvas_revision = canvas_revision + 1,
      updated_at = now()
    where id = v_board.board_id
    returning canvas_revision into v_revision;

    insert into public.board_collaboration_events (
      board_id,
      revision,
      actor_user_id,
      client_id,
      operations
    )
    values (
      v_board.board_id,
      v_revision,
      auth.uid(),
      gen_random_uuid(),
      jsonb_build_array(
        jsonb_build_object(
          'op', 'task_assignee_role_downgraded',
          'user_id', new.user_id,
          'node_ids', v_node_ids
        )
      )
    );
  end loop;

  return new;
end;
$projectflow$;

drop trigger if exists project_members_cleanup_tasks_on_viewer
  on public.project_members;
create trigger project_members_cleanup_tasks_on_viewer
after update of role on public.project_members
for each row
when (
  old.role is distinct from new.role
  and new.role = 'viewer'
)
execute function public.cleanup_downgraded_project_member_tasks();

revoke all on function public.cleanup_downgraded_project_member_tasks()
  from public;
