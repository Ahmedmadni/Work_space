-- Phase 12: live collaboration foundation.
-- Durable comments/mentions/activity + lightweight live presence.

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  board_id text references public.boards(id) on delete cascade,
  target_type text not null default 'project'
    check (target_type in ('project','board','node','document')),
  target_id text,
  page_number integer check (page_number is null or page_number > 0),
  parent_comment_id uuid references public.project_comments(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create table if not exists public.project_comment_mentions (
  comment_id uuid not null references public.project_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  entity_type text not null check (char_length(entity_type) between 1 and 40),
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_presence (
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  context_type text not null default 'project'
    check (context_type in ('project','board','document')),
  context_id text,
  last_seen_at timestamptz not null default now(),
  primary key (project_id, user_id, session_id)
);

create index if not exists project_comments_project_created_idx
  on public.project_comments(project_id, created_at desc);
create index if not exists project_comments_board_created_idx
  on public.project_comments(board_id, created_at desc)
  where board_id is not null;
create index if not exists project_comments_target_idx
  on public.project_comments(project_id, target_type, target_id, created_at desc);
create index if not exists project_comment_mentions_user_idx
  on public.project_comment_mentions(user_id, created_at desc);
create index if not exists project_activity_project_created_idx
  on public.project_activity(project_id, created_at desc);
create index if not exists project_presence_project_seen_idx
  on public.project_presence(project_id, last_seen_at desc);

drop trigger if exists project_comments_set_updated_at on public.project_comments;
create trigger project_comments_set_updated_at
before update on public.project_comments
for each row execute function public.set_updated_at();

alter table public.project_comments enable row level security;
alter table public.project_comment_mentions enable row level security;
alter table public.project_activity enable row level security;
alter table public.project_presence enable row level security;

drop policy if exists project_comments_select_member on public.project_comments;
create policy project_comments_select_member on public.project_comments
for select to authenticated
using (public.can_access_project(project_id));

drop policy if exists project_comment_mentions_select_member on public.project_comment_mentions;
create policy project_comment_mentions_select_member on public.project_comment_mentions
for select to authenticated
using (
  exists (
    select 1
    from public.project_comments c
    where c.id = comment_id
      and public.can_access_project(c.project_id)
  )
);

drop policy if exists project_activity_select_member on public.project_activity;
create policy project_activity_select_member on public.project_activity
for select to authenticated
using (public.can_access_project(project_id));

drop policy if exists project_presence_select_member on public.project_presence;
create policy project_presence_select_member on public.project_presence
for select to authenticated
using (public.can_access_project(project_id));

revoke insert, update, delete on public.project_comments from authenticated;
revoke insert, update, delete on public.project_comment_mentions from authenticated;
revoke insert, update, delete on public.project_activity from authenticated;
revoke insert, update, delete on public.project_presence from authenticated;

grant select on public.project_comments to authenticated;
grant select on public.project_comment_mentions to authenticated;
grant select on public.project_activity to authenticated;
grant select on public.project_presence to authenticated;

create or replace function public.assert_project_comment_target(
  p_project_id text,
  p_board_id text,
  p_target_type text,
  p_target_id text,
  p_page_number integer
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
begin
  if p_target_type not in ('project','board','node','document') then
    raise exception 'INVALID_COMMENT_TARGET_TYPE' using errcode = '22023';
  end if;

  if p_page_number is not null and p_page_number < 1 then
    raise exception 'INVALID_COMMENT_PAGE' using errcode = '22023';
  end if;

  if p_board_id is not null and not exists (
    select 1
    from public.boards b
    where b.id = p_board_id
      and b.project_id = p_project_id
  ) then
    raise exception 'COMMENT_BOARD_MISMATCH' using errcode = '22023';
  end if;

  if p_target_type = 'project' then
    if p_target_id is not null then
      raise exception 'PROJECT_COMMENT_TARGET_ID_MUST_BE_NULL' using errcode = '22023';
    end if;
  elsif p_target_type = 'board' then
    if p_target_id is null or not exists (
      select 1
      from public.boards b
      where b.id = p_target_id
        and b.project_id = p_project_id
        and (p_board_id is null or b.id = p_board_id)
    ) then
      raise exception 'COMMENT_BOARD_TARGET_INVALID' using errcode = '22023';
    end if;
  elsif p_target_type = 'node' then
    if p_target_id is null or not exists (
      select 1
      from public.canvas_nodes n
      join public.boards b on b.id = n.board_id
      where n.id = p_target_id
        and b.project_id = p_project_id
        and (p_board_id is null or b.id = p_board_id)
    ) then
      raise exception 'COMMENT_NODE_TARGET_INVALID' using errcode = '22023';
    end if;
  elsif p_target_type = 'document' then
    if p_target_id is null or not exists (
      select 1
      from public.project_documents d
      where d.id = p_target_id
        and d.project_id = p_project_id
    ) then
      raise exception 'COMMENT_DOCUMENT_TARGET_INVALID' using errcode = '22023';
    end if;
  end if;
end;
$projectflow$;

revoke all on function public.assert_project_comment_target(text, text, text, text, integer) from public;

create or replace function public.create_project_comment(
  p_project_id text,
  p_body text,
  p_board_id text default null,
  p_target_type text default 'project',
  p_target_id text default null,
  p_page_number integer default null,
  p_parent_comment_id uuid default null,
  p_mention_user_ids jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_comment_id uuid;
  v_body text;
  v_mention_text text;
  v_mention_id uuid;
begin
  if not public.can_edit_project(p_project_id) then
    raise exception 'COMMENT_CREATE_DENIED' using errcode = '42501';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'INVALID_COMMENT_BODY' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_mention_user_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_COMMENT_MENTIONS' using errcode = '22023';
  end if;

  perform public.assert_project_comment_target(
    p_project_id,
    p_board_id,
    p_target_type,
    p_target_id,
    p_page_number
  );

  if p_parent_comment_id is not null and not exists (
    select 1
    from public.project_comments c
    where c.id = p_parent_comment_id
      and c.project_id = p_project_id
  ) then
    raise exception 'COMMENT_PARENT_INVALID' using errcode = '22023';
  end if;

  insert into public.project_comments (
    project_id,
    board_id,
    target_type,
    target_id,
    page_number,
    parent_comment_id,
    body,
    created_by
  )
  values (
    p_project_id,
    p_board_id,
    p_target_type,
    p_target_id,
    p_page_number,
    p_parent_comment_id,
    v_body,
    auth.uid()
  )
  returning id into v_comment_id;

  for v_mention_text in
    select value from jsonb_array_elements_text(coalesce(p_mention_user_ids, '[]'::jsonb))
  loop
    begin
      v_mention_id := v_mention_text::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_MENTION_USER_ID' using errcode = '22023';
    end;

    if v_mention_id <> auth.uid() and not exists (
      select 1
      from public.projects p
      where p.id = p_project_id
        and (
          p.created_by = v_mention_id
          or exists (
            select 1
            from public.project_members pm
            where pm.project_id = p_project_id
              and pm.user_id = v_mention_id
          )
        )
    ) then
      raise exception 'MENTION_USER_NOT_IN_PROJECT' using errcode = '22023';
    end if;

    insert into public.project_comment_mentions (comment_id, user_id)
    values (v_comment_id, v_mention_id)
    on conflict do nothing;
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
    p_project_id,
    auth.uid(),
    'comment_created',
    p_target_type,
    coalesce(p_target_id, p_project_id),
    jsonb_build_object(
      'comment_id', v_comment_id,
      'board_id', p_board_id,
      'page_number', p_page_number,
      'mention_count', jsonb_array_length(coalesce(p_mention_user_ids, '[]'::jsonb))
    )
  );

  return v_comment_id;
end;
$projectflow$;

create or replace function public.list_project_comments(
  p_project_id text,
  p_board_id text default null,
  p_target_type text default null,
  p_target_id text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  project_id text,
  board_id text,
  target_type text,
  target_id text,
  page_number integer,
  parent_comment_id uuid,
  body text,
  created_by uuid,
  author_name text,
  author_email text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  mentions jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'COMMENT_LIST_DENIED' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.project_id,
    c.board_id,
    c.target_type,
    c.target_id,
    c.page_number,
    c.parent_comment_id,
    c.body,
    c.created_by,
    coalesce(nullif(pr.full_name, ''), split_part(coalesce(u.email, ''), '@', 1), 'مستخدم')::text,
    coalesce(u.email, '')::text,
    c.created_at,
    c.updated_at,
    c.resolved_at,
    c.resolved_by,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', m.user_id,
          'full_name', coalesce(nullif(mpr.full_name, ''), split_part(coalesce(mu.email, ''), '@', 1), 'مستخدم'),
          'email', coalesce(mu.email, '')
        )
        order by coalesce(nullif(mpr.full_name, ''), mu.email, m.user_id::text)
      )
      from public.project_comment_mentions m
      join auth.users mu on mu.id = m.user_id
      left join public.profiles mpr on mpr.id = m.user_id
      where m.comment_id = c.id
    ), '[]'::jsonb)
  from public.project_comments c
  join auth.users u on u.id = c.created_by
  left join public.profiles pr on pr.id = c.created_by
  where c.project_id = p_project_id
    and (p_board_id is null or c.board_id = p_board_id)
    and (p_target_type is null or c.target_type = p_target_type)
    and (p_target_id is null or c.target_id = p_target_id)
  order by c.created_at desc
  limit least(200, greatest(1, coalesce(p_limit, 100)));
end;
$projectflow$;

create or replace function public.update_project_comment(
  p_comment_id uuid,
  p_body text,
  p_mention_user_ids jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_created_by uuid;
  v_body text;
  v_mention_text text;
  v_mention_id uuid;
begin
  select project_id, created_by
    into v_project_id, v_created_by
  from public.project_comments
  where id = p_comment_id;

  if v_project_id is null then
    raise exception 'COMMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_edit_project(v_project_id) then
    raise exception 'COMMENT_UPDATE_DENIED' using errcode = '42501';
  end if;

  if v_created_by <> auth.uid() and not public.can_manage_project(v_project_id) then
    raise exception 'COMMENT_UPDATE_DENIED' using errcode = '42501';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'INVALID_COMMENT_BODY' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_mention_user_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_COMMENT_MENTIONS' using errcode = '22023';
  end if;

  update public.project_comments
  set body = v_body
  where id = p_comment_id;

  delete from public.project_comment_mentions
  where comment_id = p_comment_id;

  for v_mention_text in
    select value from jsonb_array_elements_text(coalesce(p_mention_user_ids, '[]'::jsonb))
  loop
    begin
      v_mention_id := v_mention_text::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_MENTION_USER_ID' using errcode = '22023';
    end;

    if not exists (
      select 1
      from public.projects p
      where p.id = v_project_id
        and (
          p.created_by = v_mention_id
          or exists (
            select 1
            from public.project_members pm
            where pm.project_id = v_project_id
              and pm.user_id = v_mention_id
          )
        )
    ) then
      raise exception 'MENTION_USER_NOT_IN_PROJECT' using errcode = '22023';
    end if;

    insert into public.project_comment_mentions (comment_id, user_id)
    values (p_comment_id, v_mention_id)
    on conflict do nothing;
  end loop;

  insert into public.project_activity (
    project_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  values (
    v_project_id,
    auth.uid(),
    'comment_updated',
    'comment',
    p_comment_id::text,
    '{}'::jsonb
  );
end;
$projectflow$;

create or replace function public.set_project_comment_resolved(
  p_comment_id uuid,
  p_resolved boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
begin
  select project_id into v_project_id
  from public.project_comments
  where id = p_comment_id;

  if v_project_id is null then
    raise exception 'COMMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_edit_project(v_project_id) then
    raise exception 'COMMENT_RESOLVE_DENIED' using errcode = '42501';
  end if;

  update public.project_comments
  set
    resolved_at = case when p_resolved then now() else null end,
    resolved_by = case when p_resolved then auth.uid() else null end
  where id = p_comment_id;

  insert into public.project_activity (
    project_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  values (
    v_project_id,
    auth.uid(),
    case when p_resolved then 'comment_resolved' else 'comment_reopened' end,
    'comment',
    p_comment_id::text,
    '{}'::jsonb
  );
end;
$projectflow$;

create or replace function public.delete_project_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_created_by uuid;
begin
  select project_id, created_by
    into v_project_id, v_created_by
  from public.project_comments
  where id = p_comment_id;

  if v_project_id is null then
    return;
  end if;

  if not public.can_edit_project(v_project_id) then
    raise exception 'COMMENT_DELETE_DENIED' using errcode = '42501';
  end if;

  if v_created_by <> auth.uid() and not public.can_manage_project(v_project_id) then
    raise exception 'COMMENT_DELETE_DENIED' using errcode = '42501';
  end if;

  delete from public.project_comments
  where id = p_comment_id;

  insert into public.project_activity (
    project_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  values (
    v_project_id,
    auth.uid(),
    'comment_deleted',
    'comment',
    p_comment_id::text,
    '{}'::jsonb
  );
end;
$projectflow$;

create or replace function public.record_project_activity(
  p_project_id text,
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  if not public.can_edit_project(p_project_id) then
    raise exception 'ACTIVITY_WRITE_DENIED' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_action, ''))) not between 1 and 80
    or char_length(trim(coalesce(p_entity_type, ''))) not between 1 and 40
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
  then
    raise exception 'INVALID_ACTIVITY_PAYLOAD' using errcode = '22023';
  end if;

  insert into public.project_activity (
    project_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  values (
    p_project_id,
    auth.uid(),
    trim(p_action),
    trim(p_entity_type),
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$projectflow$;

create or replace function public.list_project_activity(
  p_project_id text,
  p_limit integer default 80
)
returns table (
  id uuid,
  project_id text,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  action text,
  entity_type text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'ACTIVITY_LIST_DENIED' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.project_id,
    a.actor_user_id,
    coalesce(nullif(pr.full_name, ''), split_part(coalesce(u.email, ''), '@', 1), 'النظام')::text,
    coalesce(u.email, '')::text,
    a.action,
    a.entity_type,
    a.entity_id,
    a.metadata,
    a.created_at
  from public.project_activity a
  left join auth.users u on u.id = a.actor_user_id
  left join public.profiles pr on pr.id = a.actor_user_id
  where a.project_id = p_project_id
  order by a.created_at desc
  limit least(200, greatest(1, coalesce(p_limit, 80)));
end;
$projectflow$;

create or replace function public.heartbeat_project_presence(
  p_project_id text,
  p_session_id uuid,
  p_context_type text default 'project',
  p_context_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'PRESENCE_DENIED' using errcode = '42501';
  end if;

  if p_context_type not in ('project','board','document') then
    raise exception 'INVALID_PRESENCE_CONTEXT' using errcode = '22023';
  end if;

  if p_context_type = 'board' and (
    p_context_id is null or not exists (
      select 1 from public.boards b
      where b.id = p_context_id and b.project_id = p_project_id
    )
  ) then
    raise exception 'INVALID_PRESENCE_BOARD' using errcode = '22023';
  end if;

  if p_context_type = 'document' and (
    p_context_id is null or not exists (
      select 1 from public.project_documents d
      where d.id = p_context_id and d.project_id = p_project_id
    )
  ) then
    raise exception 'INVALID_PRESENCE_DOCUMENT' using errcode = '22023';
  end if;

  delete from public.project_presence
  where project_id = p_project_id
    and last_seen_at < now() - interval '3 minutes';

  insert into public.project_presence (
    project_id, user_id, session_id, context_type, context_id, last_seen_at
  )
  values (
    p_project_id, auth.uid(), p_session_id, p_context_type, p_context_id, now()
  )
  on conflict (project_id, user_id, session_id) do update
  set
    context_type = excluded.context_type,
    context_id = excluded.context_id,
    last_seen_at = now();
end;
$projectflow$;

create or replace function public.end_project_presence(
  p_project_id text,
  p_session_id uuid
)
returns void
language sql
security definer
set search_path = public
as $projectflow$
  delete from public.project_presence
  where project_id = p_project_id
    and user_id = auth.uid()
    and session_id = p_session_id;
$projectflow$;

create or replace function public.list_project_presence(p_project_id text)
returns table (
  user_id uuid,
  full_name text,
  email text,
  context_type text,
  context_id text,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'PRESENCE_LIST_DENIED' using errcode = '42501';
  end if;

  return query
  select distinct on (p.user_id)
    p.user_id,
    coalesce(nullif(pr.full_name, ''), split_part(coalesce(u.email, ''), '@', 1), 'مستخدم')::text,
    coalesce(u.email, '')::text,
    p.context_type,
    p.context_id,
    p.last_seen_at
  from public.project_presence p
  join auth.users u on u.id = p.user_id
  left join public.profiles pr on pr.id = p.user_id
  where p.project_id = p_project_id
    and p.last_seen_at >= now() - interval '45 seconds'
  order by p.user_id, p.last_seen_at desc;
end;
$projectflow$;

revoke all on function public.create_project_comment(text, text, text, text, text, integer, uuid, jsonb) from public;
revoke all on function public.list_project_comments(text, text, text, text, integer) from public;
revoke all on function public.update_project_comment(uuid, text, jsonb) from public;
revoke all on function public.set_project_comment_resolved(uuid, boolean) from public;
revoke all on function public.delete_project_comment(uuid) from public;
revoke all on function public.record_project_activity(text, text, text, text, jsonb) from public;
revoke all on function public.list_project_activity(text, integer) from public;
revoke all on function public.heartbeat_project_presence(text, uuid, text, text) from public;
revoke all on function public.end_project_presence(text, uuid) from public;
revoke all on function public.list_project_presence(text) from public;

grant execute on function public.create_project_comment(text, text, text, text, text, integer, uuid, jsonb) to authenticated;
grant execute on function public.list_project_comments(text, text, text, text, integer) to authenticated;
grant execute on function public.update_project_comment(uuid, text, jsonb) to authenticated;
grant execute on function public.set_project_comment_resolved(uuid, boolean) to authenticated;
grant execute on function public.delete_project_comment(uuid) to authenticated;
grant execute on function public.record_project_activity(text, text, text, text, jsonb) to authenticated;
grant execute on function public.list_project_activity(text, integer) to authenticated;
grant execute on function public.heartbeat_project_presence(text, uuid, text, text) to authenticated;
grant execute on function public.end_project_presence(text, uuid) to authenticated;
grant execute on function public.list_project_presence(text) to authenticated;
