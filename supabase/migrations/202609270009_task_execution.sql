-- Phase 16: collaborative task execution.
-- Real assignees, watchers, task notifications and due reminders.

create table if not exists public.canvas_node_assignments (
  node_id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  assignee_user_id uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.canvas_node_watchers (
  node_id text not null,
  board_id text not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (node_id, user_id)
);

create index if not exists canvas_node_assignments_board_idx
  on public.canvas_node_assignments(board_id);
create index if not exists canvas_node_assignments_user_idx
  on public.canvas_node_assignments(assignee_user_id, board_id)
  where assignee_user_id is not null;
create index if not exists canvas_node_watchers_board_idx
  on public.canvas_node_watchers(board_id);
create index if not exists canvas_node_watchers_user_idx
  on public.canvas_node_watchers(user_id, board_id);

alter table public.canvas_node_assignments enable row level security;
alter table public.canvas_node_watchers enable row level security;

drop policy if exists canvas_node_assignments_select_member
  on public.canvas_node_assignments;
create policy canvas_node_assignments_select_member
on public.canvas_node_assignments
for select to authenticated
using (
  exists (
    select 1
    from public.boards b
    where b.id = board_id
      and public.can_access_project(b.project_id)
  )
);

drop policy if exists canvas_node_watchers_select_member
  on public.canvas_node_watchers;
create policy canvas_node_watchers_select_member
on public.canvas_node_watchers
for select to authenticated
using (
  exists (
    select 1
    from public.boards b
    where b.id = board_id
      and public.can_access_project(b.project_id)
  )
);

revoke insert, update, delete on public.canvas_node_assignments from authenticated;
revoke insert, update, delete on public.canvas_node_watchers from authenticated;
grant select on public.canvas_node_assignments to authenticated;
grant select on public.canvas_node_watchers to authenticated;

-- Extend notification kinds without changing the existing notification payload shape.
alter table public.user_notifications
  drop constraint if exists user_notifications_kind_check;
alter table public.user_notifications
  add constraint user_notifications_kind_check
  check (
    kind in (
      'mention',
      'reply',
      'project_added',
      'role_changed',
      'project_removed',
      'task_assigned',
      'task_status',
      'task_due'
    )
  );

create or replace function public.enqueue_user_notification(
  p_recipient_user_id uuid,
  p_project_id text,
  p_kind text,
  p_actor_user_id uuid default null,
  p_comment_id uuid default null,
  p_board_id text default null,
  p_document_id text default null,
  p_page_number integer default null,
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_id uuid;
begin
  if p_recipient_user_id is null
    or p_project_id is null
    or p_kind not in (
      'mention',
      'reply',
      'project_added',
      'role_changed',
      'project_removed',
      'task_assigned',
      'task_status',
      'task_due'
    )
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
  then
    raise exception 'INVALID_NOTIFICATION_PAYLOAD' using errcode = '22023';
  end if;

  if p_page_number is not null and p_page_number < 1 then
    raise exception 'INVALID_NOTIFICATION_PAGE' using errcode = '22023';
  end if;

  insert into public.user_notifications (
    recipient_user_id,
    project_id,
    kind,
    actor_user_id,
    comment_id,
    board_id,
    document_id,
    page_number,
    metadata,
    dedupe_key
  )
  values (
    p_recipient_user_id,
    p_project_id,
    p_kind,
    p_actor_user_id,
    p_comment_id,
    p_board_id,
    p_document_id,
    p_page_number,
    coalesce(p_metadata, '{}'::jsonb),
    p_dedupe_key
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$projectflow$;

revoke all on function public.enqueue_user_notification(
  uuid, text, text, uuid, uuid, text, text, integer, jsonb, text
) from public;

create or replace function public.get_board_canvas(p_board_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
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
        jsonb_build_object(
          'owner',
          coalesce(
            nullif(ap.full_name, ''),
            nullif(split_part(coalesce(au.email, ''), '@', 1), ''),
            n.owner_label
          ),
          'assignee_user_id',
          a.assignee_user_id,
          'assignee_name',
          coalesce(
            nullif(ap.full_name, ''),
            nullif(split_part(coalesce(au.email, ''), '@', 1), '')
          )
        )
        order by n.created_at, n.id
      )
      from public.canvas_nodes n
      left join public.canvas_node_assignments a
        on a.node_id = n.id
        and a.board_id = n.board_id
      left join auth.users au on au.id = a.assignee_user_id
      left join public.profiles ap on ap.id = a.assignee_user_id
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

create or replace function public.set_canvas_node_assignee(
  p_project_id text,
  p_board_id text,
  p_node_id text,
  p_assignee_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $projectflow$
declare
  v_old_assignee uuid;
  v_node_title text;
  v_assignee_name text;
  v_revision bigint;
begin
  if not public.can_edit_project(p_project_id) then
    raise exception 'TASK_ASSIGN_DENIED' using errcode = '42501';
  end if;

  select n.title into v_node_title
  from public.canvas_nodes n
  join public.boards b on b.id = n.board_id
  where n.id = p_node_id
    and n.board_id = p_board_id
    and b.project_id = p_project_id;

  if v_node_title is null then
    raise exception 'TASK_NODE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_assignee_user_id is not null and not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        p.created_by = p_assignee_user_id
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p_project_id
            and pm.user_id = p_assignee_user_id
            and pm.role in ('owner','admin','editor')
        )
      )
  ) then
    raise exception 'TASK_ASSIGNEE_NOT_IN_PROJECT' using errcode = '22023';
  end if;

  select assignee_user_id into v_old_assignee
  from public.canvas_node_assignments
  where node_id = p_node_id
    and board_id = p_board_id;

  if p_assignee_user_id is not null then
    update public.canvas_nodes
    set owner_label = null
    where id = p_node_id
      and board_id = p_board_id;
  end if;

  if p_assignee_user_id is null then
    delete from public.canvas_node_assignments
    where node_id = p_node_id
      and board_id = p_board_id;
  else
    insert into public.canvas_node_assignments (
      node_id,
      board_id,
      assignee_user_id,
      updated_by,
      updated_at
    )
    values (
      p_node_id,
      p_board_id,
      p_assignee_user_id,
      auth.uid(),
      now()
    )
    on conflict (node_id) do update
    set
      board_id = excluded.board_id,
      assignee_user_id = excluded.assignee_user_id,
      updated_by = auth.uid(),
      updated_at = now();
  end if;

  if p_assignee_user_id is distinct from v_old_assignee then
    if p_assignee_user_id is not null and p_assignee_user_id <> auth.uid() then
      perform public.enqueue_user_notification(
        p_assignee_user_id,
        p_project_id,
        'task_assigned',
        auth.uid(),
        null,
        p_board_id,
        null,
        null,
        jsonb_build_object(
          'target_type', 'node',
          'target_id', p_node_id,
          'title', v_node_title
        ),
        'task_assigned:' || p_node_id || ':' ||
          p_assignee_user_id::text || ':' ||
          extract(epoch from now())::bigint::text
      );
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
      case
        when p_assignee_user_id is null then 'task_unassigned'
        else 'task_assigned'
      end,
      'node',
      p_node_id,
      jsonb_build_object(
        'board_id', p_board_id,
        'old_assignee_user_id', v_old_assignee,
        'assignee_user_id', p_assignee_user_id,
        'title', v_node_title
      )
    );

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
          'op', 'node_assignment',
          'id', p_node_id
        )
      )
    );
  end if;

  if p_assignee_user_id is not null then
    select coalesce(
      nullif(pr.full_name, ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'مستخدم'
    )
    into v_assignee_name
    from auth.users u
    left join public.profiles pr on pr.id = u.id
    where u.id = p_assignee_user_id;
  end if;

  return jsonb_build_object(
    'assignee_user_id', p_assignee_user_id,
    'assignee_name', v_assignee_name
  );
end;
$projectflow$;

revoke all on function public.set_canvas_node_assignee(
  text, text, text, uuid
) from public;
grant execute on function public.set_canvas_node_assignee(
  text, text, text, uuid
) to authenticated;

create or replace function public.list_canvas_node_watchers(
  p_project_id text,
  p_board_id text,
  p_node_id text
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'TASK_WATCHERS_DENIED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.canvas_nodes n
    join public.boards b on b.id = n.board_id
    where n.id = p_node_id
      and n.board_id = p_board_id
      and b.project_id = p_project_id
  ) then
    raise exception 'TASK_NODE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  select
    w.user_id,
    coalesce(
      nullif(pr.full_name, ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'مستخدم'
    )::text,
    coalesce(u.email, '')::text,
    w.created_at
  from public.canvas_node_watchers w
  join auth.users u on u.id = w.user_id
  left join public.profiles pr on pr.id = w.user_id
  where w.node_id = p_node_id
    and w.board_id = p_board_id
  order by w.created_at;
end;
$projectflow$;

revoke all on function public.list_canvas_node_watchers(
  text, text, text
) from public;
grant execute on function public.list_canvas_node_watchers(
  text, text, text
) to authenticated;

create or replace function public.set_canvas_node_watching(
  p_project_id text,
  p_board_id text,
  p_node_id text,
  p_watching boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'TASK_WATCH_DENIED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.canvas_nodes n
    join public.boards b on b.id = n.board_id
    where n.id = p_node_id
      and n.board_id = p_board_id
      and b.project_id = p_project_id
  ) then
    raise exception 'TASK_NODE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_watching then
    insert into public.canvas_node_watchers (
      node_id,
      board_id,
      user_id
    )
    values (
      p_node_id,
      p_board_id,
      auth.uid()
    )
    on conflict do nothing;
  else
    delete from public.canvas_node_watchers
    where node_id = p_node_id
      and board_id = p_board_id
      and user_id = auth.uid();
  end if;
end;
$projectflow$;

revoke all on function public.set_canvas_node_watching(
  text, text, text, boolean
) from public;
grant execute on function public.set_canvas_node_watching(
  text, text, text, boolean
) to authenticated;

create or replace function public.notify_canvas_node_execution_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_recipient uuid;
begin
  select b.project_id into v_project_id
  from public.boards b
  where b.id = new.board_id;

  if v_project_id is null then
    return new;
  end if;

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
        and recipient <> auth.uid()
    loop
      perform public.enqueue_user_notification(
        v_recipient,
        v_project_id,
        'task_status',
        auth.uid(),
        null,
        new.board_id,
        null,
        null,
        jsonb_build_object(
          'target_type', 'node',
          'target_id', new.id,
          'title', new.title,
          'old_status', old.status,
          'status', new.status
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
      auth.uid(),
      'task_status_changed',
      'node',
      new.id,
      jsonb_build_object(
        'board_id', new.board_id,
        'title', new.title,
        'old_status', old.status,
        'status', new.status
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
        and recipient <> auth.uid()
    loop
      perform public.enqueue_user_notification(
        v_recipient,
        v_project_id,
        'task_due',
        auth.uid(),
        null,
        new.board_id,
        null,
        null,
        jsonb_build_object(
          'target_type', 'node',
          'target_id', new.id,
          'title', new.title,
          'event', 'due_changed',
          'due_date', new.due_date
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
      auth.uid(),
      'task_due_changed',
      'node',
      new.id,
      jsonb_build_object(
        'board_id', new.board_id,
        'title', new.title,
        'due_date', new.due_date
      )
    );
  end if;

  return new;
end;
$projectflow$;

drop trigger if exists canvas_nodes_notify_execution_change
  on public.canvas_nodes;
create trigger canvas_nodes_notify_execution_change
after update of status, due_date on public.canvas_nodes
for each row
when (
  old.status is distinct from new.status
  or old.due_date is distinct from new.due_date
)
execute function public.notify_canvas_node_execution_change();

revoke all on function public.notify_canvas_node_execution_change() from public;

create or replace function public.refresh_task_due_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_row record;
  v_bucket text;
  v_inserted integer := 0;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  for v_row in
    select distinct
      n.id as node_id,
      n.title,
      n.due_date,
      n.status,
      n.board_id,
      b.project_id
    from public.canvas_nodes n
    join public.boards b on b.id = n.board_id
    left join public.canvas_node_assignments a
      on a.node_id = n.id
      and a.board_id = n.board_id
    left join public.canvas_node_watchers w
      on w.node_id = n.id
      and w.board_id = n.board_id
      and w.user_id = auth.uid()
    where n.kind in ('task','milestone')
      and n.status <> 'done'
      and n.due_date is not null
      and n.due_date <= current_date + 2
      and public.can_access_project(b.project_id)
      and (
        a.assignee_user_id = auth.uid()
        or w.user_id = auth.uid()
      )
  loop
    v_bucket :=
      case
        when v_row.due_date < current_date then 'overdue'
        else 'due_soon'
      end;

    v_id := public.enqueue_user_notification(
      auth.uid(),
      v_row.project_id,
      'task_due',
      null,
      null,
      v_row.board_id,
      null,
      null,
      jsonb_build_object(
        'target_type', 'node',
        'target_id', v_row.node_id,
        'title', v_row.title,
        'event', v_bucket,
        'due_date', v_row.due_date
      ),
      'task_due:' || v_row.node_id || ':' ||
        v_row.due_date::text || ':' || v_bucket || ':' || auth.uid()::text
    );

    if v_id is not null then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$projectflow$;

revoke all on function public.refresh_task_due_notifications() from public;
grant execute on function public.refresh_task_due_notifications() to authenticated;

create or replace function public.list_user_notifications(
  p_filter text default 'all',
  p_limit integer default 60
)
returns table (
  id uuid,
  project_id text,
  project_name text,
  kind text,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  comment_id uuid,
  board_id text,
  board_name text,
  document_id text,
  document_name text,
  page_number integer,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_filter not in ('all','unread','mentions','tasks') then
    raise exception 'INVALID_NOTIFICATION_FILTER' using errcode = '22023';
  end if;

  return query
  select
    n.id,
    n.project_id,
    coalesce(p.name, 'المشروع')::text,
    n.kind,
    n.actor_user_id,
    coalesce(
      nullif(pr.full_name, ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'النظام'
    )::text,
    coalesce(u.email, '')::text,
    n.comment_id,
    n.board_id,
    b.name,
    n.document_id,
    d.file_name,
    n.page_number,
    n.metadata,
    n.read_at,
    n.created_at
  from public.user_notifications n
  left join public.projects p on p.id = n.project_id
  left join auth.users u on u.id = n.actor_user_id
  left join public.profiles pr on pr.id = n.actor_user_id
  left join public.boards b on b.id = n.board_id
  left join public.project_documents d on d.id = n.document_id
  where n.recipient_user_id = auth.uid()
    and (p_filter <> 'unread' or n.read_at is null)
    and (
      p_filter <> 'mentions'
      or n.kind in ('mention','reply')
    )
    and (
      p_filter <> 'tasks'
      or n.kind in ('task_assigned','task_status','task_due')
    )
  order by n.created_at desc
  limit least(150, greatest(1, coalesce(p_limit, 60)));
end;
$projectflow$;

revoke all on function public.list_user_notifications(text, integer) from public;
grant execute on function public.list_user_notifications(text, integer) to authenticated;

-- True node deletion removes execution metadata. Snapshot replace/restore intentionally
-- preserves it because those paths emit snapshot_replaced instead of node_delete.
create or replace function public.cleanup_deleted_node_execution()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_operation jsonb;
  v_node_id text;
begin
  for v_operation in
    select value
    from jsonb_array_elements(coalesce(new.operations, '[]'::jsonb))
  loop
    if v_operation->>'op' <> 'node_delete' then
      continue;
    end if;

    v_node_id := nullif(v_operation->>'id', '');
    if v_node_id is null then
      continue;
    end if;

    delete from public.canvas_node_assignments
    where board_id = new.board_id
      and node_id = v_node_id;

    delete from public.canvas_node_watchers
    where board_id = new.board_id
      and node_id = v_node_id;
  end loop;

  return new;
end;
$projectflow$;

drop trigger if exists board_collaboration_events_cleanup_node_execution
  on public.board_collaboration_events;
create trigger board_collaboration_events_cleanup_node_execution
after insert on public.board_collaboration_events
for each row
execute function public.cleanup_deleted_node_execution();

revoke all on function public.cleanup_deleted_node_execution() from public;


create or replace function public.cleanup_removed_project_member_execution()
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
  delete from public.canvas_node_watchers w
  using public.boards b
  where w.board_id = b.id
    and b.project_id = old.project_id
    and w.user_id = old.user_id;

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
      and a.assignee_user_id = old.user_id
    where b.project_id = old.project_id
    group by b.id
  loop
    v_node_ids := v_board.node_ids;
    if jsonb_array_length(v_node_ids) = 0 then
      continue;
    end if;

    delete from public.canvas_node_assignments
    where board_id = v_board.board_id
      and assignee_user_id = old.user_id;

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
          'op', 'task_member_removed',
          'user_id', old.user_id,
          'node_ids', v_node_ids
        )
      )
    );
  end loop;

  return old;
end;
$projectflow$;

drop trigger if exists project_members_cleanup_execution
  on public.project_members;
create trigger project_members_cleanup_execution
after delete on public.project_members
for each row
execute function public.cleanup_removed_project_member_execution();

revoke all on function public.cleanup_removed_project_member_execution()
  from public;
