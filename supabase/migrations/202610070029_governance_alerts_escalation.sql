-- Phase 43: Governance Alerts & Escalation.

insert into public.projectflow_schema_versions (version, label)
values (29, 'governance-alerts-escalation')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

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
      'executive_action',
      'governance_alert'
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
      'executive_action',
      'governance_alert'
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

create or replace function public.projectflow_user_can_access_project(
  p_project_id text,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $projectflow$
  select p_user_id is not null and exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        p.created_by = p_user_id
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = p_user_id
        )
      )
  );
$projectflow$;

revoke all on function public.projectflow_user_can_access_project(text, uuid)
  from public;

create or replace function public.projectflow_user_can_view_executive_meeting(
  p_meeting_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $projectflow$
  select p_user_id is not null and exists (
    select 1
    from public.executive_strategy_meetings m
    where m.id = p_meeting_id
      and (
        m.created_by = p_user_id
        or m.chair_user_id = p_user_id
        or exists (
          select 1
          from public.executive_meeting_attendees a
          where a.meeting_id = m.id
            and a.user_id = p_user_id
        )
        or exists (
          select 1
          from public.projectflow_meeting_linked_projects(m.id) lp
          where public.projectflow_user_can_access_project(
            lp.project_id,
            p_user_id
          )
        )
      )
  );
$projectflow$;

revoke all on function public.projectflow_user_can_view_executive_meeting(
  uuid, uuid
) from public;

create or replace function public.projectflow_governance_notification_project(
  p_user_id uuid,
  p_meeting_ids jsonb
)
returns text
language sql
stable
security definer
set search_path = public
as $projectflow$
  with meeting_ids as (
    select distinct value::uuid as meeting_id
    from jsonb_array_elements_text(
      coalesce(p_meeting_ids, '[]'::jsonb)
    )
  ),
  candidates as (
    select distinct lp.project_id
    from meeting_ids mi
    join lateral public.projectflow_meeting_linked_projects(
      mi.meeting_id
    ) lp on true
    where public.projectflow_user_can_access_project(
      lp.project_id,
      p_user_id
    )
  )
  select min(project_id)
  from candidates;
$projectflow$;

revoke all on function public.projectflow_governance_notification_project(
  uuid, jsonb
) from public;

create or replace function public.projectflow_latest_user_executive_meeting(
  p_user_id uuid
)
returns table (
  meeting_id uuid,
  meeting_date date,
  project_id text
)
language sql
stable
security definer
set search_path = public
as $projectflow$
  select
    m.id,
    m.meeting_date,
    public.projectflow_governance_notification_project(
      p_user_id,
      jsonb_build_array(m.id)
    ) as project_id
  from public.executive_strategy_meetings m
  where m.status = 'completed'
    and public.projectflow_user_can_view_executive_meeting(
      m.id,
      p_user_id
    )
  order by m.meeting_date desc, m.updated_at desc
  limit 1;
$projectflow$;

revoke all on function public.projectflow_latest_user_executive_meeting(uuid)
  from public;

create or replace function public.refresh_governance_alert_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_exception public.executive_governance_exceptions%rowtype;
  v_targets public.executive_governance_targets%rowtype;
  v_latest record;
  v_event text;
  v_project_id text;
  v_next_due date;
  v_warning_date date;
  v_id uuid;
  v_inserted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  for v_exception in
    select *
    from public.executive_governance_exceptions e
    where e.owner_user_id = auth.uid()
      and e.status in ('open','mitigating','accepted')
      and e.due_date is not null
      and e.due_date <= current_date + 3
  loop
    v_event := case
      when v_exception.due_date < current_date
        then 'exception_overdue'
      else 'exception_due_soon'
    end;

    v_project_id := public.projectflow_governance_notification_project(
      auth.uid(),
      v_exception.source_window_meeting_ids
    );

    if v_project_id is null then
      continue;
    end if;

    v_id := public.enqueue_user_notification(
      auth.uid(),
      v_project_id,
      'governance_alert',
      null,
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'event', v_event,
        'exception_id', v_exception.id,
        'metric_key', v_exception.metric_key,
        'title', v_exception.title,
        'due_date', v_exception.due_date,
        'responsible_name', v_exception.responsible_name,
        'actual_value', v_exception.actual_value,
        'target_value', v_exception.target_value,
        'target_operator', v_exception.target_operator,
        'target_unit', v_exception.target_unit,
        'target_version', v_exception.target_version
      ),
      'governance-exception:' || v_exception.id::text || ':' ||
        v_exception.due_date::text || ':' || v_event || ':' ||
        auth.uid()::text
    );

    if v_id is not null then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  select * into v_targets
  from public.executive_governance_targets
  where owner_user_id = auth.uid();

  if found and v_targets.meeting_cadence_days is not null then
    select * into v_latest
    from public.projectflow_latest_user_executive_meeting(auth.uid());

    if found and v_latest.project_id is not null then
      v_project_id := v_latest.project_id;
      v_next_due := v_latest.meeting_date + v_targets.meeting_cadence_days;
      v_warning_date := case
        when v_targets.cadence_warning_days_before is null then null
        else v_next_due - v_targets.cadence_warning_days_before
      end;

      v_event := case
        when current_date > v_next_due then 'cadence_overdue'
        when v_warning_date is not null
          and current_date >= v_warning_date
          and current_date <= v_next_due
          then 'cadence_due_soon'
        else null
      end;

      if v_event is not null then
        v_id := public.enqueue_user_notification(
          auth.uid(),
          v_project_id,
          'governance_alert',
          null,
          null,
          null,
          null,
          null,
          jsonb_build_object(
            'event', v_event,
            'meeting_id', v_latest.meeting_id,
            'last_meeting_date', v_latest.meeting_date,
            'next_due_date', v_next_due,
            'cadence_days', v_targets.meeting_cadence_days,
            'warning_days_before',
              v_targets.cadence_warning_days_before,
            'target_version', v_targets.version
          ),
          'governance-cadence:' || auth.uid()::text || ':' ||
            v_targets.version::text || ':' || v_next_due::text || ':' ||
            v_event
        );

        if v_id is not null then
          v_inserted := v_inserted + 1;
        end if;
      end if;
    end if;
  end if;

  return v_inserted;
end;
$projectflow$;

revoke all on function public.refresh_governance_alert_notifications()
  from public;
grant execute on function public.refresh_governance_alert_notifications()
  to authenticated;

create or replace function public.refresh_all_governance_alert_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_exception public.executive_governance_exceptions%rowtype;
  v_targets public.executive_governance_targets%rowtype;
  v_latest record;
  v_event text;
  v_project_id text;
  v_next_due date;
  v_warning_date date;
  v_id uuid;
  v_inserted integer := 0;
begin
  for v_exception in
    select *
    from public.executive_governance_exceptions e
    where e.status in ('open','mitigating','accepted')
      and e.due_date is not null
      and e.due_date <= current_date + 3
  loop
    v_event := case
      when v_exception.due_date < current_date
        then 'exception_overdue'
      else 'exception_due_soon'
    end;

    v_project_id := public.projectflow_governance_notification_project(
      v_exception.owner_user_id,
      v_exception.source_window_meeting_ids
    );

    if v_project_id is null then
      continue;
    end if;

    v_id := public.enqueue_user_notification(
      v_exception.owner_user_id,
      v_project_id,
      'governance_alert',
      null,
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'event', v_event,
        'exception_id', v_exception.id,
        'metric_key', v_exception.metric_key,
        'title', v_exception.title,
        'due_date', v_exception.due_date,
        'responsible_name', v_exception.responsible_name,
        'actual_value', v_exception.actual_value,
        'target_value', v_exception.target_value,
        'target_operator', v_exception.target_operator,
        'target_unit', v_exception.target_unit,
        'target_version', v_exception.target_version,
        'source', 'server_scheduler'
      ),
      'governance-exception:' || v_exception.id::text || ':' ||
        v_exception.due_date::text || ':' || v_event || ':' ||
        v_exception.owner_user_id::text
    );

    if v_id is not null then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  for v_targets in
    select *
    from public.executive_governance_targets t
    where t.meeting_cadence_days is not null
  loop
    select * into v_latest
    from public.projectflow_latest_user_executive_meeting(
      v_targets.owner_user_id
    );

    if not found or v_latest.project_id is null then
      continue;
    end if;

    v_project_id := v_latest.project_id;
    v_next_due := v_latest.meeting_date + v_targets.meeting_cadence_days;
    v_warning_date := case
      when v_targets.cadence_warning_days_before is null then null
      else v_next_due - v_targets.cadence_warning_days_before
    end;

    v_event := case
      when current_date > v_next_due then 'cadence_overdue'
      when v_warning_date is not null
        and current_date >= v_warning_date
        and current_date <= v_next_due
        then 'cadence_due_soon'
      else null
    end;

    if v_event is null then
      continue;
    end if;

    v_id := public.enqueue_user_notification(
      v_targets.owner_user_id,
      v_project_id,
      'governance_alert',
      null,
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'event', v_event,
        'meeting_id', v_latest.meeting_id,
        'last_meeting_date', v_latest.meeting_date,
        'next_due_date', v_next_due,
        'cadence_days', v_targets.meeting_cadence_days,
        'warning_days_before', v_targets.cadence_warning_days_before,
        'target_version', v_targets.version,
        'source', 'server_scheduler'
      ),
      'governance-cadence:' || v_targets.owner_user_id::text || ':' ||
        v_targets.version::text || ':' || v_next_due::text || ':' ||
        v_event
    );

    if v_id is not null then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$projectflow$;

revoke all on function public.refresh_all_governance_alert_notifications()
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
    'all','unread','mentions','tasks','risks','strategy','executive',
    'governance'
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
    and (
      p_filter <> 'governance'
      or n.kind = 'governance_alert'
    )
  order by n.created_at desc
  limit least(150, greatest(1, coalesce(p_limit, 60)));
end;
$projectflow$;

revoke all on function public.list_user_notifications(text, integer)
  from public;
grant execute on function public.list_user_notifications(text, integer)
  to authenticated;

-- Best-effort 24/7 governance reminders. App refresh remains the fallback.
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
        execute 'select jobid from cron.job where jobname = ''projectflow-governance-alerts'''
      loop
        execute 'select cron.unschedule($1)' using v_job_id;
      end loop;

      execute 'select cron.schedule($1, $2, $3)'
        into v_job_id
        using
          'projectflow-governance-alerts',
          '45 * * * *',
          'select public.refresh_all_governance_alert_notifications();';
    exception when others then
      null;
    end;
  end if;
end;
$projectflow$;
