-- Phase 13: in-app notification center, mention/reply inbox and deep-link context.

alter table public.project_comments
  add column if not exists origin_board_id text references public.boards(id) on delete set null;

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  kind text not null
    check (kind in ('mention','reply','project_added','role_changed','project_removed')),
  actor_user_id uuid references auth.users(id) on delete set null,
  comment_id uuid references public.project_comments(id) on delete set null,
  board_id text references public.boards(id) on delete set null,
  document_id text references public.project_documents(id) on delete set null,
  page_number integer check (page_number is null or page_number > 0),
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_recipient_created_idx
  on public.user_notifications(recipient_user_id, created_at desc);
create index if not exists user_notifications_recipient_unread_idx
  on public.user_notifications(recipient_user_id, created_at desc)
  where read_at is null;
create index if not exists user_notifications_project_idx
  on public.user_notifications(project_id, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists user_notifications_select_self on public.user_notifications;
create policy user_notifications_select_self on public.user_notifications
for select to authenticated
using (recipient_user_id = auth.uid());

revoke insert, update, delete on public.user_notifications from authenticated;
grant select on public.user_notifications to authenticated;

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
    or p_kind not in ('mention','reply','project_added','role_changed','project_removed')
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

-- Only triggers/functions in this migration call enqueue_user_notification.

create or replace function public.notify_project_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_actor uuid;
  v_project_name text;
begin
  v_actor := auth.uid();

  if tg_op = 'INSERT' then
    if v_actor is not null and new.user_id = v_actor then
      return new;
    end if;

    select name into v_project_name
    from public.projects
    where id = new.project_id;

    perform public.enqueue_user_notification(
      new.user_id,
      new.project_id,
      'project_added',
      v_actor,
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'role', new.role,
        'project_name', coalesce(v_project_name, 'المشروع')
      ),
      null
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      select name into v_project_name
      from public.projects
      where id = new.project_id;

      perform public.enqueue_user_notification(
        new.user_id,
        new.project_id,
        'role_changed',
        v_actor,
        null,
        null,
        null,
        null,
        jsonb_build_object(
          'old_role', old.role,
          'role', new.role,
          'project_name', coalesce(v_project_name, 'المشروع')
        ),
        null
      );
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    select name into v_project_name
    from public.projects
    where id = old.project_id;

    -- During ON DELETE CASCADE from projects, the parent may already be gone.
    -- Skip the personal removal notification in that case so project deletion
    -- can never be blocked by the notification FK.
    if v_project_name is null then
      return old;
    end if;

    perform public.enqueue_user_notification(
      old.user_id,
      old.project_id,
      'project_removed',
      v_actor,
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'old_role', old.role,
        'project_name', coalesce(v_project_name, 'المشروع')
      ),
      null
    );
    return old;
  end if;

  return null;
end;
$projectflow$;

drop trigger if exists project_members_notify_change on public.project_members;
create trigger project_members_notify_change
after insert or update or delete on public.project_members
for each row execute function public.notify_project_member_change();

create or replace function public.notify_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_parent_author uuid;
  v_board_id text;
  v_document_id text;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select created_by into v_parent_author
  from public.project_comments
  where id = new.parent_comment_id;

  if v_parent_author is null or v_parent_author = new.created_by then
    return new;
  end if;

  v_board_id := coalesce(new.board_id, new.origin_board_id);
  v_document_id :=
    case when new.target_type = 'document' then new.target_id else null end;

  perform public.enqueue_user_notification(
    v_parent_author,
    new.project_id,
    'reply',
    new.created_by,
    new.id,
    v_board_id,
    v_document_id,
    new.page_number,
    jsonb_build_object(
      'target_type', new.target_type,
      'target_id', new.target_id,
      'preview', left(new.body, 180)
    ),
    'reply:' || new.id::text || ':' || v_parent_author::text
  );

  return new;
end;
$projectflow$;

drop trigger if exists project_comments_notify_reply on public.project_comments;
create trigger project_comments_notify_reply
after insert on public.project_comments
for each row execute function public.notify_comment_reply();

create or replace function public.notify_comment_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_comment public.project_comments%rowtype;
  v_parent_author uuid;
  v_board_id text;
  v_document_id text;
begin
  select * into v_comment
  from public.project_comments
  where id = new.comment_id;

  if v_comment.id is null or new.user_id = v_comment.created_by then
    return new;
  end if;

  if v_comment.parent_comment_id is not null then
    select created_by into v_parent_author
    from public.project_comments
    where id = v_comment.parent_comment_id;

    if v_parent_author = new.user_id then
      return new;
    end if;
  end if;

  v_board_id := coalesce(v_comment.board_id, v_comment.origin_board_id);
  v_document_id :=
    case when v_comment.target_type = 'document' then v_comment.target_id else null end;

  perform public.enqueue_user_notification(
    new.user_id,
    v_comment.project_id,
    'mention',
    v_comment.created_by,
    v_comment.id,
    v_board_id,
    v_document_id,
    v_comment.page_number,
    jsonb_build_object(
      'target_type', v_comment.target_type,
      'target_id', v_comment.target_id,
      'preview', left(v_comment.body, 180)
    ),
    'mention:' || v_comment.id::text || ':' || new.user_id::text
  );

  return new;
end;
$projectflow$;

drop trigger if exists project_comment_mentions_notify on public.project_comment_mentions;
create trigger project_comment_mentions_notify
after insert on public.project_comment_mentions
for each row execute function public.notify_comment_mention();

-- Replace comment creation with origin-board context for document deep links.
drop function if exists public.create_project_comment(
  text, text, text, text, text, integer, uuid, jsonb
);

create or replace function public.create_project_comment(
  p_project_id text,
  p_body text,
  p_board_id text default null,
  p_target_type text default 'project',
  p_target_id text default null,
  p_page_number integer default null,
  p_parent_comment_id uuid default null,
  p_mention_user_ids jsonb default '[]'::jsonb,
  p_origin_board_id text default null
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

  if p_origin_board_id is not null and not exists (
    select 1
    from public.boards b
    where b.id = p_origin_board_id
      and b.project_id = p_project_id
  ) then
    raise exception 'COMMENT_ORIGIN_BOARD_INVALID' using errcode = '22023';
  end if;

  if p_parent_comment_id is not null and not exists (
    select 1
    from public.project_comments c
    where c.id = p_parent_comment_id
      and c.project_id = p_project_id
      and c.target_type = p_target_type
      and c.target_id is not distinct from p_target_id
      and c.page_number is not distinct from p_page_number
  ) then
    raise exception 'COMMENT_PARENT_INVALID' using errcode = '22023';
  end if;

  insert into public.project_comments (
    project_id,
    board_id,
    origin_board_id,
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
    p_origin_board_id,
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
      'origin_board_id', p_origin_board_id,
      'page_number', p_page_number,
      'mention_count', jsonb_array_length(coalesce(p_mention_user_ids, '[]'::jsonb))
    )
  );

  return v_comment_id;
end;
$projectflow$;

revoke all on function public.create_project_comment(
  text, text, text, text, text, integer, uuid, jsonb, text
) from public;
grant execute on function public.create_project_comment(
  text, text, text, text, text, integer, uuid, jsonb, text
) to authenticated;

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

  if p_filter not in ('all','unread','mentions') then
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
    and (p_filter <> 'mentions' or n.kind in ('mention','reply'))
  order by n.created_at desc
  limit least(150, greatest(1, coalesce(p_limit, 60)));
end;
$projectflow$;

create or replace function public.count_unread_notifications()
returns integer
language sql
stable
security definer
set search_path = public
as $projectflow$
  select count(*)::integer
  from public.user_notifications n
  where n.recipient_user_id = auth.uid()
    and n.read_at is null;
$projectflow$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language sql
security definer
set search_path = public
as $projectflow$
  update public.user_notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and recipient_user_id = auth.uid();
$projectflow$;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = public
as $projectflow$
  update public.user_notifications
  set read_at = coalesce(read_at, now())
  where recipient_user_id = auth.uid()
    and read_at is null;
$projectflow$;

revoke all on function public.list_user_notifications(text, integer) from public;
revoke all on function public.count_unread_notifications() from public;
revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_all_notifications_read() from public;

grant execute on function public.list_user_notifications(text, integer) to authenticated;
grant execute on function public.count_unread_notifications() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
