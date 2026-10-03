-- Phase 29: Portfolio Risk Radar & Executive Escalation.

insert into public.projectflow_schema_versions (version, label)
values (20, 'portfolio-risk-radar-executive-escalation')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

-- Extend notification kinds for executive risk escalation.
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
      'risk_escalation'
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
      'risk_escalation'
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

create or replace function public.notify_project_risk_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_recipient uuid;
  v_should_notify boolean := false;
begin
  if tg_op = 'INSERT' then
    v_should_notify :=
      new.status in ('open','mitigating')
      and new.severity = 'critical';
  else
    v_should_notify :=
      new.status in ('open','mitigating')
      and new.severity = 'critical'
      and (
        old.severity is distinct from 'critical'
        or old.status not in ('open','mitigating')
      );
  end if;

  if not v_should_notify then
    return new;
  end if;

  for v_recipient in
    select distinct recipient
    from (
      select p.created_by as recipient
      from public.projects p
      where p.id = new.project_id

      union

      select pm.user_id as recipient
      from public.project_members pm
      where pm.project_id = new.project_id
        and pm.role in ('owner','admin')

      union

      select new.owner_user_id as recipient
    ) recipients
    where recipient is not null
      and recipient <> auth.uid()
  loop
    perform public.enqueue_user_notification(
      v_recipient,
      new.project_id,
      'risk_escalation',
      auth.uid(),
      null,
      new.board_id,
      null,
      null,
      jsonb_build_object(
        'event', 'critical',
        'risk_id', new.id,
        'title', new.title,
        'severity', new.severity,
        'status', new.status,
        'due_date', new.due_date,
        'target_type', case when new.node_id is null then 'project' else 'node' end,
        'target_id', coalesce(new.node_id, new.project_id)
      ),
      'risk:critical:' || new.id::text || ':' ||
        new.version::text || ':' || v_recipient::text
    );
  end loop;

  return new;
end;
$projectflow$;

drop trigger if exists project_risks_notify_escalation
  on public.project_risks;
create trigger project_risks_notify_escalation
after insert or update on public.project_risks
for each row
execute function public.notify_project_risk_escalation();

revoke all on function public.notify_project_risk_escalation() from public;

create or replace function public.refresh_risk_escalation_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_row record;
  v_inserted integer := 0;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  for v_row in
    select
      r.id,
      r.project_id,
      r.title,
      r.severity,
      r.status,
      r.due_date,
      r.board_id,
      r.node_id
    from public.project_risks r
    join public.projects p on p.id = r.project_id
    where r.status in ('open','mitigating')
      and r.due_date is not null
      and r.due_date < current_date
      and public.can_access_project(r.project_id)
      and (
        r.owner_user_id = auth.uid()
        or p.created_by = auth.uid()
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = r.project_id
            and pm.user_id = auth.uid()
            and pm.role in ('owner','admin')
        )
      )
  loop
    v_id := public.enqueue_user_notification(
      auth.uid(),
      v_row.project_id,
      'risk_escalation',
      null,
      null,
      v_row.board_id,
      null,
      null,
      jsonb_build_object(
        'event', 'overdue',
        'risk_id', v_row.id,
        'title', v_row.title,
        'severity', v_row.severity,
        'status', v_row.status,
        'due_date', v_row.due_date,
        'target_type', case when v_row.node_id is null then 'project' else 'node' end,
        'target_id', coalesce(v_row.node_id, v_row.project_id)
      ),
      'risk:overdue:' || v_row.id::text || ':' ||
        v_row.due_date::text || ':' || auth.uid()::text
    );

    if v_id is not null then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$projectflow$;

revoke all on function public.refresh_risk_escalation_notifications() from public;
grant execute on function public.refresh_risk_escalation_notifications() to authenticated;

create or replace function public.refresh_all_risk_escalation_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_row record;
  v_recipient uuid;
  v_inserted integer := 0;
  v_id uuid;
begin
  for v_row in
    select
      r.id,
      r.project_id,
      r.title,
      r.severity,
      r.status,
      r.due_date,
      r.board_id,
      r.node_id,
      r.owner_user_id,
      p.created_by
    from public.project_risks r
    join public.projects p on p.id = r.project_id
    where r.status in ('open','mitigating')
      and r.due_date is not null
      and r.due_date < current_date
  loop
    for v_recipient in
      select distinct recipient
      from (
        select v_row.created_by as recipient

        union

        select pm.user_id as recipient
        from public.project_members pm
        where pm.project_id = v_row.project_id
          and pm.role in ('owner','admin')

        union

        select v_row.owner_user_id as recipient
      ) recipients
      where recipient is not null
    loop
      v_id := public.enqueue_user_notification(
        v_recipient,
        v_row.project_id,
        'risk_escalation',
        null,
        null,
        v_row.board_id,
        null,
        null,
        jsonb_build_object(
          'event', 'overdue',
          'risk_id', v_row.id,
          'title', v_row.title,
          'severity', v_row.severity,
          'status', v_row.status,
          'due_date', v_row.due_date,
          'target_type', case when v_row.node_id is null then 'project' else 'node' end,
          'target_id', coalesce(v_row.node_id, v_row.project_id),
          'source', 'server_scheduler'
        ),
        'risk:overdue:' || v_row.id::text || ':' ||
          v_row.due_date::text || ':' || v_recipient::text
      );

      if v_id is not null then
        v_inserted := v_inserted + 1;
      end if;
    end loop;
  end loop;

  return v_inserted;
end;
$projectflow$;

revoke all on function public.refresh_all_risk_escalation_notifications()
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

  if p_filter not in ('all','unread','mentions','tasks','risks') then
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
  order by n.created_at desc
  limit least(150, greatest(1, coalesce(p_limit, 60)));
end;
$projectflow$;

revoke all on function public.list_user_notifications(text, integer) from public;
grant execute on function public.list_user_notifications(text, integer)
  to authenticated;

create or replace function public.list_portfolio_action_center()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'risks',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'project_id', r.project_id,
          'project_name', p.name,
          'title', r.title,
          'description', r.description,
          'severity', r.severity,
          'status', r.status,
          'owner_user_id', r.owner_user_id,
          'owner_name', case
            when r.owner_user_id is null then null
            else coalesce(
              nullif(pr.full_name, ''),
              nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
              'مستخدم'
            )
          end,
          'mitigation', r.mitigation,
          'due_date', r.due_date,
          'board_id', r.board_id,
          'board_name', b.name,
          'node_id', r.node_id,
          'node_title', n.title,
          'version', r.version,
          'created_at', r.created_at,
          'updated_at', r.updated_at
        )
        order by
          case r.status
            when 'open' then 0
            when 'mitigating' then 1
            when 'accepted' then 2
            else 3
          end,
          case r.severity
            when 'critical' then 0
            when 'high' then 1
            when 'medium' then 2
            else 3
          end,
          r.due_date nulls last
      )
      from public.project_risks r
      join public.projects p on p.id = r.project_id
      left join auth.users u on u.id = r.owner_user_id
      left join public.profiles pr on pr.id = r.owner_user_id
      left join public.boards b on b.id = r.board_id
      left join public.canvas_nodes n
        on n.id = r.node_id
        and n.board_id = r.board_id
      where public.can_access_project(r.project_id)
    ), '[]'::jsonb),
    'decisions',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'project_id', d.project_id,
          'project_name', p.name,
          'title', d.title,
          'decision', d.decision,
          'rationale', d.rationale,
          'status', d.status,
          'owner_user_id', d.owner_user_id,
          'owner_name', case
            when d.owner_user_id is null then null
            else coalesce(
              nullif(pr.full_name, ''),
              nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
              'مستخدم'
            )
          end,
          'decided_at', d.decided_at,
          'board_id', d.board_id,
          'board_name', b.name,
          'node_id', d.node_id,
          'node_title', n.title,
          'version', d.version,
          'created_at', d.created_at,
          'updated_at', d.updated_at
        )
        order by
          case d.status
            when 'proposed' then 0
            when 'decided' then 1
            when 'superseded' then 2
            else 3
          end,
          coalesce(d.decided_at, d.created_at) desc
      )
      from public.project_decisions d
      join public.projects p on p.id = d.project_id
      left join auth.users u on u.id = d.owner_user_id
      left join public.profiles pr on pr.id = d.owner_user_id
      left join public.boards b on b.id = d.board_id
      left join public.canvas_nodes n
        on n.id = d.node_id
        and n.board_id = d.board_id
      where public.can_access_project(d.project_id)
    ), '[]'::jsonb)
  );
end;
$projectflow$;

revoke all on function public.list_portfolio_action_center() from public;
grant execute on function public.list_portfolio_action_center()
  to authenticated;


-- Best-effort 24/7 overdue-risk escalation. App refresh remains the fallback.
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
    -- App fallback continues to call refresh_risk_escalation_notifications().
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
        execute 'select jobid from cron.job where jobname = ''projectflow-risk-escalations'''
      loop
        execute 'select cron.unschedule($1)' using v_job_id;
      end loop;

      execute 'select cron.schedule($1, $2, $3)'
        into v_job_id
        using
          'projectflow-risk-escalations',
          '15 * * * *',
          'select public.refresh_all_risk_escalation_notifications();';
    exception when others then
      -- Do not fail deployment when cron permissions/capability are unavailable.
      null;
    end;
  end if;
end;
$projectflow$;
