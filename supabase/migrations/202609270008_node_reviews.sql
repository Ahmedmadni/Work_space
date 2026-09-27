-- Phase 15: node-level review threads and scalable review summaries.

create index if not exists project_comments_node_review_idx
  on public.project_comments(board_id, target_id, created_at desc)
  where target_type = 'node';

create index if not exists project_comments_node_review_open_idx
  on public.project_comments(board_id, target_id, created_at desc)
  where target_type = 'node'
    and parent_comment_id is null
    and resolved_at is null;

create or replace function public.list_board_node_review_summary(
  p_project_id text,
  p_board_id text
)
returns table (
  node_id text,
  open_thread_count integer,
  total_thread_count integer,
  comment_count integer,
  latest_comment_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'NODE_REVIEW_LIST_DENIED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.boards b
    where b.id = p_board_id
      and b.project_id = p_project_id
  ) then
    raise exception 'NODE_REVIEW_BOARD_INVALID' using errcode = '22023';
  end if;

  return query
  select
    c.target_id as node_id,
    count(*) filter (
      where c.parent_comment_id is null
        and c.resolved_at is null
    )::integer as open_thread_count,
    count(*) filter (
      where c.parent_comment_id is null
    )::integer as total_thread_count,
    count(*)::integer as comment_count,
    max(c.created_at) as latest_comment_at
  from public.project_comments c
  join public.canvas_nodes n
    on n.id = c.target_id
    and n.board_id = p_board_id
  where c.project_id = p_project_id
    and c.board_id = p_board_id
    and c.target_type = 'node'
  group by c.target_id;
end;
$projectflow$;

revoke all on function public.list_board_node_review_summary(text, text) from public;
grant execute on function public.list_board_node_review_summary(text, text) to authenticated;

-- Node review panels may legitimately contain more than the generic 200-comment cap.
-- Raise the cap while preserving the same authorization and filtering contract.
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
    coalesce(
      nullif(pr.full_name, ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'مستخدم'
    )::text,
    coalesce(u.email, '')::text,
    c.created_at,
    c.updated_at,
    c.resolved_at,
    c.resolved_by,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', m.user_id,
          'full_name', coalesce(
            nullif(mpr.full_name, ''),
            split_part(coalesce(mu.email, ''), '@', 1),
            'مستخدم'
          ),
          'email', coalesce(mu.email, '')
        )
        order by coalesce(
          nullif(mpr.full_name, ''),
          mu.email,
          m.user_id::text
        )
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
  limit least(500, greatest(1, coalesce(p_limit, 100)));
end;
$projectflow$;

-- Preserve node context in activity records for review-specific activity feeds.
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
  v_target_type text;
  v_target_id text;
  v_board_id text;
  v_body text;
  v_mention_text text;
  v_mention_id uuid;
begin
  select project_id, created_by, target_type, target_id, board_id
    into v_project_id, v_created_by, v_target_type, v_target_id, v_board_id
  from public.project_comments
  where id = p_comment_id;

  if v_project_id is null then
    raise exception 'COMMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_edit_project(v_project_id) then
    raise exception 'COMMENT_UPDATE_DENIED' using errcode = '42501';
  end if;

  if v_created_by <> auth.uid()
    and not public.can_manage_project(v_project_id)
  then
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
    select value
    from jsonb_array_elements_text(
      coalesce(p_mention_user_ids, '[]'::jsonb)
    )
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
    'comment_updated',
    'comment',
    p_comment_id::text,
    jsonb_build_object(
      'target_type', v_target_type,
      'target_id', v_target_id,
      'board_id', v_board_id
    )
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
  v_target_type text;
  v_target_id text;
  v_board_id text;
begin
  select project_id, target_type, target_id, board_id
    into v_project_id, v_target_type, v_target_id, v_board_id
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
    case
      when p_resolved then 'comment_resolved'
      else 'comment_reopened'
    end,
    'comment',
    p_comment_id::text,
    jsonb_build_object(
      'target_type', v_target_type,
      'target_id', v_target_id,
      'board_id', v_board_id
    )
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
  v_target_type text;
  v_target_id text;
  v_board_id text;
begin
  select project_id, created_by, target_type, target_id, board_id
    into
      v_project_id,
      v_created_by,
      v_target_type,
      v_target_id,
      v_board_id
  from public.project_comments
  where id = p_comment_id;

  if v_project_id is null then
    return;
  end if;

  if not public.can_edit_project(v_project_id) then
    raise exception 'COMMENT_DELETE_DENIED' using errcode = '42501';
  end if;

  if v_created_by <> auth.uid()
    and not public.can_manage_project(v_project_id)
  then
    raise exception 'COMMENT_DELETE_DENIED' using errcode = '42501';
  end if;

  delete from public.project_comments
  where id = p_comment_id;

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
    'comment_deleted',
    'comment',
    p_comment_id::text,
    jsonb_build_object(
      'target_type', v_target_type,
      'target_id', v_target_id,
      'board_id', v_board_id
    )
  );
end;
$projectflow$;

revoke all on function public.update_project_comment(uuid, text, jsonb) from public;
revoke all on function public.set_project_comment_resolved(uuid, boolean) from public;
revoke all on function public.delete_project_comment(uuid) from public;

grant execute on function public.update_project_comment(uuid, text, jsonb) to authenticated;
grant execute on function public.set_project_comment_resolved(uuid, boolean) to authenticated;
grant execute on function public.delete_project_comment(uuid) to authenticated;

-- Intentional node deletion emits a compact collaboration event. Clean up node
-- review threads there, while preserving reviews across restore/import snapshots.
create or replace function public.cleanup_deleted_node_reviews()
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

    delete from public.project_comments
    where board_id = new.board_id
      and target_type = 'node'
      and target_id = v_node_id;
  end loop;

  return new;
end;
$projectflow$;

drop trigger if exists board_collaboration_events_cleanup_node_reviews
  on public.board_collaboration_events;

create trigger board_collaboration_events_cleanup_node_reviews
after insert on public.board_collaboration_events
for each row
execute function public.cleanup_deleted_node_reviews();

revoke all on function public.cleanup_deleted_node_reviews() from public;
