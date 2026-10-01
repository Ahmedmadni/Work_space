-- Phase 24: AI project copilot acceptance audit.
-- Stores only accepted-action metadata; user prompts and AI conversations are not persisted.

insert into public.projectflow_schema_versions (version, label)
values (17, 'ai-project-copilot')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create or replace function public.record_ai_copilot_task_accepted(
  p_project_id text,
  p_board_id text,
  p_node_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_title text;
  v_priority text;
begin
  if not public.can_edit_project(p_project_id) then
    raise exception 'AI_COPILOT_EDIT_DENIED' using errcode = '42501';
  end if;

  select n.title, n.priority
    into v_title, v_priority
  from public.canvas_nodes n
  join public.boards b on b.id = n.board_id
  where n.id = p_node_id
    and n.board_id = p_board_id
    and b.project_id = p_project_id;

  if v_title is null then
    raise exception 'AI_COPILOT_NODE_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.projectflow_append_audit_event(
    p_project_id,
    'execution',
    'ai_copilot_task_accepted',
    'node',
    p_node_id,
    null,
    jsonb_build_object(
      'title', v_title,
      'priority', v_priority,
      'board_id', p_board_id
    ),
    jsonb_build_object(
      'board_id', p_board_id,
      'source', 'project_copilot',
      'prompt_persisted', false
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
    'ai_copilot_task_accepted',
    'node',
    p_node_id,
    jsonb_build_object(
      'board_id', p_board_id,
      'title', v_title,
      'priority', v_priority
    )
  );
end;
$projectflow$;

revoke all on function public.record_ai_copilot_task_accepted(
  text, text, text
) from public;
grant execute on function public.record_ai_copilot_task_accepted(
  text, text, text
) to authenticated;
