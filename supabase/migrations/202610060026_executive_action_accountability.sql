-- Phase 38: Executive Action Accountability & Escalation.

insert into public.projectflow_schema_versions (version, label)
values (26, 'executive-action-accountability-escalation')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

-- Extend notification kinds with governed executive action reminders.
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
      'task_due',
      'risk_escalation',
      'strategy_schedule',
      'executive_action'
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
      'task_due',
      'risk_escalation',
      'strategy_schedule',
      'executive_action'
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

create or replace function public.projectflow_executive_action_project(
  p_action_item_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $projectflow$
  select coalesce(
    a.project_id,
    (
      select min(opl.project_id)
      from public.objective_project_links opl
      where opl.objective_id = a.objective_id
    ),
    (
      select min(lp.project_id)
      from public.projectflow_meeting_linked_projects(a.meeting_id) lp
    )
  )
  from public.executive_meeting_action_items a
  where a.id = p_action_item_id;
$projectflow$;

revoke all on function public.projectflow_executive_action_project(uuid)
  from public;

create or replace function public.projectflow_is_executive_action_recipient(
  p_action_item_id uuid,
  p_user_id uuid,
  p_event text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $projectflow$
  with context as (
    select
      a.id,
      a.owner_user_id,
      a.meeting_id,
      m.created_by,
      m.chair_user_id,
      public.projectflow_executive_action_project(a.id) as project_id
    from public.executive_meeting_action_items a
    join public.executive_strategy_meetings m on m.id = a.meeting_id
    where a.id = p_action_item_id
      and m.status = 'completed'
  )
  select
    p_user_id is not null
    and exists (
      select 1
      from context c
      where
        (
          p_event = 'due_soon'
          and c.owner_user_id = p_user_id
        )
        or (
          p_event = 'overdue'
          and (
            c.owner_user_id = p_user_id
            or c.created_by = p_user_id
            or c.chair_user_id = p_user_id
            or exists (
              select 1
              from public.projects p
              where p.id = c.project_id
                and p.created_by = p_user_id
            )
            or exists (
              select 1
              from public.project_members pm
              where pm.project_id = c.project_id
                and pm.user_id = p_user_id
                and pm.role in ('owner','admin')
            )
          )
        )
    );
$projectflow$;

revoke all on function public.projectflow_is_executive_action_recipient(
  uuid, uuid, text
) from public;

create or replace function public.refresh_executive_action_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_row record;
  v_event text;
  v_project_id text;
  v_id uuid;
  v_inserted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  for v_row in
    select
      a.id,
      a.meeting_id,
      a.objective_id,
      a.title,
      a.due_date,
      a.owner_user_id,
      m.title as meeting_title,
      o.title as objective_title
    from public.executive_meeting_action_items a
    join public.executive_strategy_meetings m on m.id = a.meeting_id
    left join public.portfolio_objectives o on o.id = a.objective_id
    where m.status = 'completed'
      and a.status in ('open','in_progress')
      and a.due_date is not null
      and a.due_date <= current_date + 3
  loop
    v_event := case
      when v_row.due_date < current_date then 'overdue'
      else 'due_soon'
    end;

    if not public.projectflow_is_executive_action_recipient(
      v_row.id,
      auth.uid(),
      v_event
    ) then
      continue;
    end if;

    v_project_id := public.projectflow_executive_action_project(v_row.id);
    if v_project_id is null or not public.can_access_project(v_project_id) then
      continue;
    end if;

    v_id := public.enqueue_user_notification(
      auth.uid(),
      v_project_id,
      'executive_action',
      null,
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'event', v_event,
        'action_item_id', v_row.id,
        'meeting_id', v_row.meeting_id,
        'meeting_title', v_row.meeting_title,
        'objective_id', v_row.objective_id,
        'objective_title', v_row.objective_title,
        'title', v_row.title,
        'due_date', v_row.due_date,
        'owner_user_id', v_row.owner_user_id
      ),
      'executive-action:' || v_row.id::text || ':' ||
        v_row.due_date::text || ':' || v_event || ':' || auth.uid()::text
    );

    if v_id is not null then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$projectflow$;

revoke all on function public.refresh_executive_action_notifications()
  from public;
grant execute on function public.refresh_executive_action_notifications()
  to authenticated;

create or replace function public.refresh_all_executive_action_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_row record;
  v_recipient uuid;
  v_event text;
  v_project_id text;
  v_id uuid;
  v_inserted integer := 0;
begin
  for v_row in
    select
      a.id,
      a.meeting_id,
      a.objective_id,
      a.title,
      a.due_date,
      a.owner_user_id,
      m.title as meeting_title,
      m.created_by,
      m.chair_user_id,
      o.title as objective_title
    from public.executive_meeting_action_items a
    join public.executive_strategy_meetings m on m.id = a.meeting_id
    left join public.portfolio_objectives o on o.id = a.objective_id
    where m.status = 'completed'
      and a.status in ('open','in_progress')
      and a.due_date is not null
      and a.due_date <= current_date + 3
  loop
    v_event := case
      when v_row.due_date < current_date then 'overdue'
      else 'due_soon'
    end;
    v_project_id := public.projectflow_executive_action_project(v_row.id);

    if v_project_id is null then
      continue;
    end if;

    for v_recipient in
      select distinct recipient
      from (
        select v_row.owner_user_id as recipient

        union

        select v_row.created_by
        where v_event = 'overdue'

        union

        select v_row.chair_user_id
        where v_event = 'overdue'

        union

        select p.created_by
        from public.projects p
        where p.id = v_project_id
          and v_event = 'overdue'

        union

        select pm.user_id
        from public.project_members pm
        where pm.project_id = v_project_id
          and pm.role in ('owner','admin')
          and v_event = 'overdue'
      ) recipients
      where recipient is not null
    loop
      v_id := public.enqueue_user_notification(
        v_recipient,
        v_project_id,
        'executive_action',
        null,
        null,
        null,
        null,
        null,
        jsonb_build_object(
          'event', v_event,
          'action_item_id', v_row.id,
          'meeting_id', v_row.meeting_id,
          'meeting_title', v_row.meeting_title,
          'objective_id', v_row.objective_id,
          'objective_title', v_row.objective_title,
          'title', v_row.title,
          'due_date', v_row.due_date,
          'owner_user_id', v_row.owner_user_id,
          'source', 'server_scheduler'
        ),
        'executive-action:' || v_row.id::text || ':' ||
          v_row.due_date::text || ':' || v_event || ':' || v_recipient::text
      );

      if v_id is not null then
        v_inserted := v_inserted + 1;
      end if;
    end loop;
  end loop;

  return v_inserted;
end;
$projectflow$;

revoke all on function public.refresh_all_executive_action_notifications()
  from public;

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

  if p_filter not in (
    'all','unread','mentions','tasks','risks','strategy','executive'
  ) then
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
    and (
      p_filter <> 'risks'
      or n.kind = 'risk_escalation'
    )
    and (
      p_filter <> 'strategy'
      or n.kind = 'strategy_schedule'
    )
    and (
      p_filter <> 'executive'
      or n.kind = 'executive_action'
    )
  order by n.created_at desc
  limit least(150, greatest(1, coalesce(p_limit, 60)));
end;
$projectflow$;

revoke all on function public.list_user_notifications(text, integer) from public;
grant execute on function public.list_user_notifications(text, integer)
  to authenticated;

-- Best-effort 24/7 executive action reminders. App refresh remains the fallback.
do $projectflow$
declare
  v_job_id bigint;
  v_installed boolean := false;
begin
  begin
    if exists (
      select 1
      from pg_available_extensions
      where name = 'pg_cron'
    ) and not exists (
      select 1
      from pg_extension
      where extname = 'pg_cron'
    ) then
      execute 'create extension if not exists pg_cron';
    end if;
  exception when others then
    null;
  end;

  select exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) into v_installed;

  if v_installed and to_regnamespace('cron') is not null then
    begin
      for v_job_id in
        execute 'select jobid from cron.job where jobname = ''projectflow-executive-actions'''
      loop
        execute 'select cron.unschedule($1)' using v_job_id;
      end loop;

      execute 'select cron.schedule($1, $2, $3)'
        into v_job_id
        using
          'projectflow-executive-actions',
          '35 * * * *',
          'select public.refresh_all_executive_action_notifications();';
    exception when others then
      null;
    end;
  end if;
end;
$projectflow$;
