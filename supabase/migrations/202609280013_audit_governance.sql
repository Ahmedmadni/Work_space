-- Phase 20: audit, governance and project controls.
-- Append-only audit ledger sourced from sensitive database changes.

create table if not exists public.project_audit_heads (
  project_id text primary key references public.projects(id) on delete cascade,
  last_sequence bigint not null default 0,
  last_hash text,
  updated_at timestamptz not null default now()
);

create table if not exists public.project_audit_events (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately no FK: audit evidence survives project deletion. RLS/RPCs
  -- still require access to a live project, so orphaned history is not exposed.
  project_id text not null,
  sequence bigint not null check (sequence > 0),
  previous_hash text,
  event_hash text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_kind text not null
    check (actor_kind in ('human','automation','system')),
  source text not null
    check (source in ('app','automation','system','auth')),
  category text not null
    check (category in ('access','automation','execution','content','project')),
  action text not null check (char_length(action) between 1 and 100),
  entity_type text not null check (char_length(entity_type) between 1 and 50),
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  transaction_id bigint not null default txid_current(),
  occurred_at timestamptz not null default now(),
  unique (project_id, sequence)
);

create index if not exists project_audit_events_project_time_idx
  on public.project_audit_events(project_id, occurred_at desc);
create index if not exists project_audit_events_project_category_idx
  on public.project_audit_events(project_id, category, occurred_at desc);
create index if not exists project_audit_events_project_actor_idx
  on public.project_audit_events(project_id, actor_user_id, occurred_at desc)
  where actor_user_id is not null;
create index if not exists project_audit_events_project_source_idx
  on public.project_audit_events(project_id, source, occurred_at desc);

alter table public.project_audit_heads enable row level security;
alter table public.project_audit_events enable row level security;

revoke all on public.project_audit_heads from authenticated;
revoke insert, update, delete on public.project_audit_events from authenticated;

drop policy if exists project_audit_events_select_manager
  on public.project_audit_events;
create policy project_audit_events_select_manager
on public.project_audit_events
for select to authenticated
using (public.can_manage_project(project_id));

grant select on public.project_audit_events to authenticated;

create or replace function public.projectflow_audit_source(
  p_source_override text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
declare
  v_override text;
begin
  v_override := lower(trim(coalesce(p_source_override, '')));

  if v_override in ('app','automation','system','auth') then
    return v_override;
  end if;

  if nullif(current_setting('projectflow.automation_rule_id', true), '') is not null then
    return 'automation';
  end if;

  if auth.uid() is not null then
    return 'app';
  end if;

  return 'system';
end;
$projectflow$;

revoke all on function public.projectflow_audit_source(text) from public;

create or replace function public.projectflow_append_audit_event(
  p_project_id text,
  p_category text,
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_before_state jsonb default null,
  p_after_state jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null,
  p_source text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_id uuid := gen_random_uuid();
  v_sequence bigint;
  v_previous_hash text;
  v_event_hash text;
  v_actor uuid;
  v_source text;
  v_actor_kind text;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.projects p where p.id = p_project_id
  ) then
    return null;
  end if;

  if p_category not in ('access','automation','execution','content','project')
    or char_length(trim(coalesce(p_action, ''))) not between 1 and 100
    or char_length(trim(coalesce(p_entity_type, ''))) not between 1 and 50
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
  then
    raise exception 'INVALID_AUDIT_EVENT' using errcode = '22023';
  end if;

  v_source := public.projectflow_audit_source(p_source);
  v_actor := case
    when v_source in ('automation','system','auth') then p_actor_user_id
    else coalesce(p_actor_user_id, auth.uid())
  end;
  v_actor_kind := case
    when v_source = 'automation' then 'automation'
    when v_actor is not null then 'human'
    else 'system'
  end;

  insert into public.project_audit_heads (
    project_id,
    last_sequence,
    last_hash,
    updated_at
  )
  values (p_project_id, 0, null, now())
  on conflict (project_id) do nothing;

  select last_sequence, last_hash
    into v_sequence, v_previous_hash
  from public.project_audit_heads
  where project_id = p_project_id
  for update;

  v_sequence := coalesce(v_sequence, 0) + 1;

  v_event_hash := md5(
    coalesce(v_previous_hash, '') || '|' ||
    v_id::text || '|' ||
    p_project_id || '|' ||
    v_sequence::text || '|' ||
    coalesce(v_actor::text, '') || '|' ||
    v_actor_kind || '|' ||
    v_source || '|' ||
    p_category || '|' ||
    trim(p_action) || '|' ||
    trim(p_entity_type) || '|' ||
    coalesce(p_entity_id, '') || '|' ||
    coalesce(p_before_state::text, '') || '|' ||
    coalesce(p_after_state::text, '') || '|' ||
    coalesce(p_metadata::text, '{}') || '|' ||
    to_char(
      v_now at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US'
    )
  );

  insert into public.project_audit_events (
    id,
    project_id,
    sequence,
    previous_hash,
    event_hash,
    actor_user_id,
    actor_kind,
    source,
    category,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state,
    metadata,
    occurred_at
  )
  values (
    v_id,
    p_project_id,
    v_sequence,
    v_previous_hash,
    v_event_hash,
    v_actor,
    v_actor_kind,
    v_source,
    p_category,
    trim(p_action),
    trim(p_entity_type),
    p_entity_id,
    p_before_state,
    p_after_state,
    coalesce(p_metadata, '{}'::jsonb),
    v_now
  );

  update public.project_audit_heads
  set
    last_sequence = v_sequence,
    last_hash = v_event_hash,
    updated_at = now()
  where project_id = p_project_id;

  return v_id;
end;
$projectflow$;

revoke all on function public.projectflow_append_audit_event(
  text, text, text, text, text, jsonb, jsonb, jsonb, uuid, text
) from public;

create or replace function public.projectflow_reject_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  raise exception 'AUDIT_LEDGER_APPEND_ONLY' using errcode = '42501';
end;
$projectflow$;

drop trigger if exists project_audit_events_append_only
  on public.project_audit_events;
create trigger project_audit_events_append_only
before update or delete on public.project_audit_events
for each row
execute function public.projectflow_reject_audit_mutation();

revoke all on function public.projectflow_reject_audit_mutation() from public;

create or replace function public.projectflow_audit_project_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_user_id uuid;
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  v_project_id := coalesce(new.project_id, old.project_id);
  v_user_id := coalesce(new.user_id, old.user_id);

  if tg_op = 'INSERT' then
    v_action := 'member_added';
    v_after := jsonb_build_object(
      'user_id', new.user_id,
      'role', new.role
    );
  elsif tg_op = 'DELETE' then
    v_action := 'member_removed';
    v_before := jsonb_build_object(
      'user_id', old.user_id,
      'role', old.role
    );
  elsif new.role is distinct from old.role then
    v_action := 'member_role_changed';
    v_before := jsonb_build_object(
      'user_id', old.user_id,
      'role', old.role
    );
    v_after := jsonb_build_object(
      'user_id', new.user_id,
      'role', new.role
    );
  else
    return new;
  end if;

  perform public.projectflow_append_audit_event(
    v_project_id,
    'access',
    v_action,
    'project_member',
    v_user_id::text,
    v_before,
    v_after,
    '{}'::jsonb
  );

  return coalesce(new, old);
end;
$projectflow$;

drop trigger if exists project_members_audit_change on public.project_members;
create trigger project_members_audit_change
after insert or update or delete on public.project_members
for each row
execute function public.projectflow_audit_project_member_change();

revoke all on function public.projectflow_audit_project_member_change()
  from public;

create or replace function public.projectflow_audit_invitation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  v_project_id := coalesce(new.project_id, old.project_id);

  if tg_op = 'INSERT' then
    v_action := 'invitation_created';
    v_after := jsonb_build_object(
      'email', new.email_normalized,
      'role', new.role,
      'accepted_at', new.accepted_at,
      'revoked_at', new.revoked_at
    );
  elsif tg_op = 'DELETE' then
    v_action := 'invitation_deleted';
    v_before := jsonb_build_object(
      'email', old.email_normalized,
      'role', old.role,
      'accepted_at', old.accepted_at,
      'revoked_at', old.revoked_at
    );
  elsif new.accepted_at is distinct from old.accepted_at
    and new.accepted_at is not null
  then
    v_action := 'invitation_accepted';
    v_before := jsonb_build_object(
      'email', old.email_normalized,
      'role', old.role,
      'accepted_at', old.accepted_at
    );
    v_after := jsonb_build_object(
      'email', new.email_normalized,
      'role', new.role,
      'accepted_at', new.accepted_at
    );
  elsif new.revoked_at is distinct from old.revoked_at
    and new.revoked_at is not null
  then
    v_action := 'invitation_revoked';
    v_before := jsonb_build_object(
      'email', old.email_normalized,
      'role', old.role,
      'revoked_at', old.revoked_at
    );
    v_after := jsonb_build_object(
      'email', new.email_normalized,
      'role', new.role,
      'revoked_at', new.revoked_at
    );
  elsif new.role is distinct from old.role
    or new.email_normalized is distinct from old.email_normalized
  then
    v_action := 'invitation_updated';
    v_before := jsonb_build_object(
      'email', old.email_normalized,
      'role', old.role
    );
    v_after := jsonb_build_object(
      'email', new.email_normalized,
      'role', new.role
    );
  else
    return new;
  end if;

  perform public.projectflow_append_audit_event(
    v_project_id,
    'access',
    v_action,
    'project_invitation',
    coalesce(new.id, old.id)::text,
    v_before,
    v_after,
    jsonb_build_object(
      'invited_by', coalesce(new.invited_by, old.invited_by)
    ),
    case
      when tg_op = 'INSERT' then new.invited_by
      else null
    end,
    case
      when auth.uid() is null and v_action = 'invitation_accepted'
        then 'auth'
      else null
    end
  );

  return coalesce(new, old);
end;
$projectflow$;

drop trigger if exists project_invitations_audit_change
  on public.project_invitations;
create trigger project_invitations_audit_change
after insert or update or delete on public.project_invitations
for each row
execute function public.projectflow_audit_invitation_change();

revoke all on function public.projectflow_audit_invitation_change()
  from public;

create or replace function public.projectflow_audit_project_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_before jsonb;
  v_after jsonb;
  v_action text := 'project_updated';
begin
  if new.name is not distinct from old.name
    and new.description is not distinct from old.description
    and new.status is not distinct from old.status
    and new.archived_at is not distinct from old.archived_at
  then
    return new;
  end if;

  if new.archived_at is distinct from old.archived_at then
    v_action := case
      when new.archived_at is null then 'project_restored'
      else 'project_archived'
    end;
  elsif new.status is distinct from old.status then
    v_action := 'project_status_changed';
  elsif new.name is distinct from old.name then
    v_action := 'project_renamed';
  end if;

  v_before := jsonb_build_object(
    'name', old.name,
    'description', old.description,
    'status', old.status,
    'archived_at', old.archived_at
  );
  v_after := jsonb_build_object(
    'name', new.name,
    'description', new.description,
    'status', new.status,
    'archived_at', new.archived_at
  );

  perform public.projectflow_append_audit_event(
    new.id,
    'project',
    v_action,
    'project',
    new.id,
    v_before,
    v_after,
    '{}'::jsonb
  );

  return new;
end;
$projectflow$;

drop trigger if exists projects_audit_change on public.projects;
create trigger projects_audit_change
after update on public.projects
for each row
execute function public.projectflow_audit_project_change();

revoke all on function public.projectflow_audit_project_change()
  from public;

create or replace function public.projectflow_audit_project_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  perform public.projectflow_append_audit_event(
    old.id,
    'project',
    'project_deleted',
    'project',
    old.id,
    jsonb_build_object(
      'name', old.name,
      'description', old.description,
      'status', old.status,
      'archived_at', old.archived_at
    ),
    null,
    '{}'::jsonb
  );
  return old;
end;
$projectflow$;

drop trigger if exists projects_audit_delete on public.projects;
create trigger projects_audit_delete
before delete on public.projects
for each row
execute function public.projectflow_audit_project_delete();

revoke all on function public.projectflow_audit_project_delete()
  from public;

create or replace function public.projectflow_audit_board_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'board_created';
    v_after := jsonb_build_object(
      'name', new.name,
      'board_type', new.board_type,
      'archived_at', new.archived_at
    );
  elsif tg_op = 'DELETE' then
    v_action := 'board_deleted';
    v_before := jsonb_build_object(
      'name', old.name,
      'board_type', old.board_type,
      'archived_at', old.archived_at
    );
  elsif new.name is not distinct from old.name
    and new.description is not distinct from old.description
    and new.board_type is not distinct from old.board_type
    and new.archived_at is not distinct from old.archived_at
  then
    return new;
  else
    if new.archived_at is distinct from old.archived_at then
      v_action := case
        when new.archived_at is null then 'board_restored'
        else 'board_archived'
      end;
    elsif new.name is distinct from old.name then
      v_action := 'board_renamed';
    else
      v_action := 'board_updated';
    end if;

    v_before := jsonb_build_object(
      'name', old.name,
      'description', old.description,
      'board_type', old.board_type,
      'archived_at', old.archived_at
    );
    v_after := jsonb_build_object(
      'name', new.name,
      'description', new.description,
      'board_type', new.board_type,
      'archived_at', new.archived_at
    );
  end if;

  perform public.projectflow_append_audit_event(
    coalesce(new.project_id, old.project_id),
    'content',
    v_action,
    'board',
    coalesce(new.id, old.id),
    v_before,
    v_after,
    '{}'::jsonb
  );

  return coalesce(new, old);
end;
$projectflow$;

drop trigger if exists boards_audit_change on public.boards;
create trigger boards_audit_change
after insert or update or delete on public.boards
for each row
execute function public.projectflow_audit_board_change();

revoke all on function public.projectflow_audit_board_change()
  from public;

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
      'due_date', old.due_date
    ),
    jsonb_build_object(
      'title', new.title,
      'status', new.status,
      'priority', new.priority,
      'progress', new.progress,
      'start_date', new.start_date,
      'due_date', new.due_date
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

revoke all on function public.projectflow_audit_node_execution_change()
  from public;

create or replace function public.projectflow_audit_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
begin
  select b.project_id into v_project_id
  from public.boards b
  where b.id = coalesce(new.board_id, old.board_id);

  if v_project_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.assignee_user_id is null then
      return new;
    end if;

    perform public.projectflow_append_audit_event(
      v_project_id,
      'execution',
      'task_assignee_changed',
      'node',
      new.node_id,
      null,
      jsonb_build_object('assignee_user_id', new.assignee_user_id),
      jsonb_build_object('board_id', new.board_id),
      coalesce(new.updated_by, auth.uid())
    );
  elsif tg_op = 'DELETE' then
    if old.assignee_user_id is null then
      return old;
    end if;

    perform public.projectflow_append_audit_event(
      v_project_id,
      'execution',
      'task_assignee_changed',
      'node',
      old.node_id,
      jsonb_build_object('assignee_user_id', old.assignee_user_id),
      null,
      jsonb_build_object('board_id', old.board_id),
      auth.uid()
    );
  elsif new.assignee_user_id is distinct from old.assignee_user_id then
    perform public.projectflow_append_audit_event(
      v_project_id,
      'execution',
      'task_assignee_changed',
      'node',
      new.node_id,
      jsonb_build_object('assignee_user_id', old.assignee_user_id),
      jsonb_build_object('assignee_user_id', new.assignee_user_id),
      jsonb_build_object('board_id', new.board_id),
      coalesce(new.updated_by, auth.uid())
    );
  end if;

  return coalesce(new, old);
end;
$projectflow$;

drop trigger if exists canvas_node_assignments_audit_change
  on public.canvas_node_assignments;
create trigger canvas_node_assignments_audit_change
after insert or update or delete on public.canvas_node_assignments
for each row
execute function public.projectflow_audit_assignment_change();

revoke all on function public.projectflow_audit_assignment_change()
  from public;

create or replace function public.projectflow_audit_automation_rule_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'automation_rule_created';
    v_after := jsonb_build_object(
      'kind', new.kind,
      'name', new.name,
      'config', new.config,
      'enabled', new.enabled
    );
  elsif tg_op = 'DELETE' then
    v_action := 'automation_rule_deleted';
    v_before := jsonb_build_object(
      'kind', old.kind,
      'name', old.name,
      'config', old.config,
      'enabled', old.enabled
    );
  elsif new.enabled is distinct from old.enabled then
    v_action := case
      when new.enabled then 'automation_rule_enabled'
      else 'automation_rule_disabled'
    end;
    v_before := jsonb_build_object(
      'kind', old.kind,
      'name', old.name,
      'config', old.config,
      'enabled', old.enabled
    );
    v_after := jsonb_build_object(
      'kind', new.kind,
      'name', new.name,
      'config', new.config,
      'enabled', new.enabled
    );
  elsif new.config is distinct from old.config then
    v_action := 'automation_rule_config_changed';
    v_before := jsonb_build_object(
      'kind', old.kind,
      'config', old.config
    );
    v_after := jsonb_build_object(
      'kind', new.kind,
      'config', new.config
    );
  elsif new.last_tested_at is distinct from old.last_tested_at then
    v_action := 'automation_rule_tested';
    v_before := jsonb_build_object(
      'last_tested_at', old.last_tested_at
    );
    v_after := jsonb_build_object(
      'last_tested_at', new.last_tested_at,
      'summary', new.last_test_summary
    );
  else
    return new;
  end if;

  perform public.projectflow_append_audit_event(
    coalesce(new.project_id, old.project_id),
    'automation',
    v_action,
    'automation_rule',
    coalesce(new.id, old.id)::text,
    v_before,
    v_after,
    jsonb_build_object(
      'kind', coalesce(new.kind, old.kind)
    )
  );

  return coalesce(new, old);
end;
$projectflow$;

drop trigger if exists project_automation_rules_audit_change
  on public.project_automation_rules;
create trigger project_automation_rules_audit_change
after insert or update or delete on public.project_automation_rules
for each row
execute function public.projectflow_audit_automation_rule_change();

revoke all on function public.projectflow_audit_automation_rule_change()
  from public;

create or replace function public.projectflow_audit_automation_run_failure()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  if new.status <> 'failed'
    or (
      tg_op = 'UPDATE'
      and old.status = 'failed'
      and new.attempt_count = old.attempt_count
      and new.error is not distinct from old.error
    )
  then
    return new;
  end if;

  perform public.projectflow_append_audit_event(
    new.project_id,
    'automation',
    'automation_run_failed',
    'automation_run',
    new.id::text,
    case when tg_op = 'UPDATE' then
      jsonb_build_object(
        'status', old.status,
        'attempt_count', old.attempt_count
      )
    else null end,
    jsonb_build_object(
      'status', new.status,
      'attempt_count', new.attempt_count,
      'max_attempts', new.max_attempts,
      'next_retry_at', new.next_retry_at,
      'error', new.error
    ),
    jsonb_build_object(
      'rule_id', new.rule_id,
      'board_id', new.board_id,
      'node_id', new.node_id,
      'event_key', new.event_key
    ),
    null,
    'automation'
  );

  return new;
end;
$projectflow$;

drop trigger if exists project_automation_runs_audit_failure
  on public.project_automation_runs;
create trigger project_automation_runs_audit_failure
after insert or update on public.project_automation_runs
for each row
execute function public.projectflow_audit_automation_run_failure();

revoke all on function public.projectflow_audit_automation_run_failure()
  from public;

create or replace function public.projectflow_audit_version_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
begin
  if new.reason = 'auto' then
    return new;
  end if;

  select b.project_id into v_project_id
  from public.boards b
  where b.id = new.board_id;

  if v_project_id is null then
    return new;
  end if;

  perform public.projectflow_append_audit_event(
    v_project_id,
    'content',
    case
      when new.reason = 'before_restore' then 'restore_checkpoint_created'
      when new.reason = 'import' then 'import_snapshot_created'
      else 'manual_snapshot_created'
    end,
    'board_version',
    new.id,
    null,
    jsonb_build_object(
      'reason', new.reason,
      'label', new.label,
      'node_count', new.node_count,
      'edge_count', new.edge_count,
      'stroke_count', new.stroke_count
    ),
    jsonb_build_object('board_id', new.board_id),
    new.created_by,
    'app'
  );

  return new;
end;
$projectflow$;

drop trigger if exists board_versions_audit_event on public.board_versions;
create trigger board_versions_audit_event
after insert on public.board_versions
for each row
execute function public.projectflow_audit_version_event();

revoke all on function public.projectflow_audit_version_event()
  from public;

create or replace function public.list_project_audit_events(
  p_project_id text,
  p_source text default null,
  p_category text default null,
  p_actor_user_id uuid default null,
  p_entity_type text default null,
  p_search text default null,
  p_since timestamptz default null,
  p_before timestamptz default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  project_id text,
  sequence bigint,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  actor_kind text,
  source text,
  category text,
  action text,
  entity_type text,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  transaction_id bigint,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'AUDIT_LIST_DENIED' using errcode = '42501';
  end if;

  if p_source is not null
    and p_source not in ('app','automation','system','auth')
  then
    raise exception 'INVALID_AUDIT_SOURCE' using errcode = '22023';
  end if;

  if p_category is not null
    and p_category not in ('access','automation','execution','content','project')
  then
    raise exception 'INVALID_AUDIT_CATEGORY' using errcode = '22023';
  end if;

  return query
  select
    a.id,
    a.project_id,
    a.sequence,
    a.actor_user_id,
    coalesce(
      nullif(pr.full_name, ''),
      split_part(coalesce(u.email, ''), '@', 1),
      case when a.actor_kind = 'automation' then 'الأتمتة' else 'النظام' end
    )::text,
    coalesce(u.email, '')::text,
    a.actor_kind,
    a.source,
    a.category,
    a.action,
    a.entity_type,
    a.entity_id,
    a.before_state,
    a.after_state,
    a.metadata,
    a.transaction_id,
    a.occurred_at
  from public.project_audit_events a
  left join auth.users u on u.id = a.actor_user_id
  left join public.profiles pr on pr.id = a.actor_user_id
  where a.project_id = p_project_id
    and (p_source is null or a.source = p_source)
    and (p_category is null or a.category = p_category)
    and (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
    and (p_entity_type is null or a.entity_type = p_entity_type)
    and (p_since is null or a.occurred_at >= p_since)
    and (p_before is null or a.occurred_at < p_before)
    and (
      nullif(trim(coalesce(p_search, '')), '') is null
      or a.action ilike '%' || trim(p_search) || '%'
      or a.entity_type ilike '%' || trim(p_search) || '%'
      or coalesce(a.entity_id, '') ilike '%' || trim(p_search) || '%'
      or coalesce(a.before_state::text, '') ilike '%' || trim(p_search) || '%'
      or coalesce(a.after_state::text, '') ilike '%' || trim(p_search) || '%'
      or coalesce(a.metadata::text, '') ilike '%' || trim(p_search) || '%'
      or coalesce(pr.full_name, '') ilike '%' || trim(p_search) || '%'
      or coalesce(u.email, '') ilike '%' || trim(p_search) || '%'
    )
  order by a.occurred_at desc, a.sequence desc
  limit least(250, greatest(1, coalesce(p_limit, 100)));
end;
$projectflow$;

revoke all on function public.list_project_audit_events(
  text, text, text, uuid, text, text, timestamptz, timestamptz, integer
) from public;
grant execute on function public.list_project_audit_events(
  text, text, text, uuid, text, text, timestamptz, timestamptz, integer
) to authenticated;

create or replace function public.get_project_audit_summary(
  p_project_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
declare
  v_total_7d integer;
  v_today integer;
  v_human_7d integer;
  v_automation_7d integer;
  v_access_7d integer;
  v_execution_7d integer;
  v_failed_7d integer;
  v_last_event_at timestamptz;
  v_last_sequence bigint;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'AUDIT_SUMMARY_DENIED' using errcode = '42501';
  end if;

  select
    count(*) filter (where occurred_at >= now() - interval '7 days'),
    count(*) filter (where occurred_at >= current_date),
    count(*) filter (
      where occurred_at >= now() - interval '7 days'
        and actor_kind = 'human'
    ),
    count(*) filter (
      where occurred_at >= now() - interval '7 days'
        and actor_kind = 'automation'
    ),
    count(*) filter (
      where occurred_at >= now() - interval '7 days'
        and category = 'access'
    ),
    count(*) filter (
      where occurred_at >= now() - interval '7 days'
        and category = 'execution'
    ),
    count(*) filter (
      where occurred_at >= now() - interval '7 days'
        and action = 'automation_run_failed'
    ),
    max(occurred_at),
    max(sequence)
  into
    v_total_7d,
    v_today,
    v_human_7d,
    v_automation_7d,
    v_access_7d,
    v_execution_7d,
    v_failed_7d,
    v_last_event_at,
    v_last_sequence
  from public.project_audit_events
  where project_id = p_project_id;

  return jsonb_build_object(
    'events_7d', coalesce(v_total_7d, 0),
    'events_today', coalesce(v_today, 0),
    'human_7d', coalesce(v_human_7d, 0),
    'automation_7d', coalesce(v_automation_7d, 0),
    'access_7d', coalesce(v_access_7d, 0),
    'execution_7d', coalesce(v_execution_7d, 0),
    'automation_failures_7d', coalesce(v_failed_7d, 0),
    'last_event_at', v_last_event_at,
    'last_sequence', coalesce(v_last_sequence, 0)
  );
end;
$projectflow$;

revoke all on function public.get_project_audit_summary(text) from public;
grant execute on function public.get_project_audit_summary(text)
  to authenticated;

create or replace function public.verify_project_audit_chain(
  p_project_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
declare
  v_event record;
  v_previous_hash text := null;
  v_expected_hash text;
  v_checked integer := 0;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'AUDIT_VERIFY_DENIED' using errcode = '42501';
  end if;

  for v_event in
    select *
    from public.project_audit_events
    where project_id = p_project_id
    order by sequence
  loop
    if v_event.previous_hash is distinct from v_previous_hash then
      return jsonb_build_object(
        'ok', false,
        'checked', v_checked,
        'failed_sequence', v_event.sequence,
        'reason', 'previous_hash_mismatch'
      );
    end if;

    v_expected_hash := md5(
      coalesce(v_event.previous_hash, '') || '|' ||
      v_event.id::text || '|' ||
      v_event.project_id || '|' ||
      v_event.sequence::text || '|' ||
      coalesce(v_event.actor_user_id::text, '') || '|' ||
      v_event.actor_kind || '|' ||
      v_event.source || '|' ||
      v_event.category || '|' ||
      v_event.action || '|' ||
      v_event.entity_type || '|' ||
      coalesce(v_event.entity_id, '') || '|' ||
      coalesce(v_event.before_state::text, '') || '|' ||
      coalesce(v_event.after_state::text, '') || '|' ||
      coalesce(v_event.metadata::text, '{}') || '|' ||
      to_char(
        v_event.occurred_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US'
      )
    );

    if v_event.event_hash <> v_expected_hash then
      return jsonb_build_object(
        'ok', false,
        'checked', v_checked,
        'failed_sequence', v_event.sequence,
        'reason', 'event_hash_mismatch'
      );
    end if;

    v_previous_hash := v_event.event_hash;
    v_checked := v_checked + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'checked', v_checked,
    'last_hash', v_previous_hash
  );
end;
$projectflow$;

revoke all on function public.verify_project_audit_chain(text) from public;
grant execute on function public.verify_project_audit_chain(text)
  to authenticated;
