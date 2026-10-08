-- Phase 51: Governance Assurance Findings Follow-up & Escalation.

insert into public.projectflow_schema_versions (version, label)
values (36, 'assurance-findings-followup-escalation')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

alter table public.executive_governance_assurance_findings
  add column if not exists reminder_date date;

alter table public.executive_governance_assurance_findings
  drop constraint if exists executive_governance_assurance_finding_reminder_check;

alter table public.executive_governance_assurance_findings
  add constraint executive_governance_assurance_finding_reminder_check
  check (
    reminder_date is null
    or (
      due_date is not null
      and reminder_date <= due_date
    )
  );

create index if not exists executive_governance_assurance_findings_followup_idx
  on public.executive_governance_assurance_findings(
    status,
    reminder_date,
    due_date,
    responsible_user_id
  );

create or replace function public.projectflow_governance_assurance_finding_json(
  p_row public.executive_governance_assurance_findings
)
returns jsonb
language sql
stable
as $projectflow$
  select jsonb_build_object(
    'id', p_row.id,
    'archive_id', p_row.archive_id,
    'owner_user_id', p_row.owner_user_id,
    'source_type', p_row.source_type,
    'source_ref_id', p_row.source_ref_id,
    'title', p_row.title,
    'description', p_row.description,
    'severity', p_row.severity,
    'status', p_row.status,
    'responsible_user_id', p_row.responsible_user_id,
    'responsible_name_snapshot', p_row.responsible_name_snapshot,
    'responsible_email_snapshot', p_row.responsible_email_snapshot,
    'due_date', p_row.due_date,
    'reminder_date', p_row.reminder_date,
    'corrective_action', p_row.corrective_action,
    'resolution_note', p_row.resolution_note,
    'version', p_row.version,
    'resolved_at', p_row.resolved_at,
    'accepted_at', p_row.accepted_at,
    'created_by', p_row.created_by,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$projectflow$;

revoke all on function public.projectflow_governance_assurance_finding_json(
  public.executive_governance_assurance_findings
) from public;

drop function if exists public.save_executive_governance_assurance_finding(
  uuid, bigint, uuid, text, uuid, text, text, text, text, uuid, date, text, text
);

create or replace function public.save_executive_governance_assurance_finding(
  p_finding_id uuid,
  p_expected_version bigint,
  p_archive_id uuid,
  p_source_type text,
  p_source_ref_id uuid,
  p_title text,
  p_description text,
  p_severity text,
  p_status text,
  p_responsible_user_id uuid,
  p_due_date date,
  p_reminder_date date,
  p_corrective_action text,
  p_resolution_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_archive public.executive_governance_assurance_archives%rowtype;
  v_existing public.executive_governance_assurance_findings%rowtype;
  v_saved public.executive_governance_assurance_findings%rowtype;
  v_review public.executive_governance_reviews%rowtype;
  v_auth_name text;
  v_auth_email text;
  v_event text;
  v_project_id text;
  v_notify_assignment boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_archive_id is null
     or p_source_type not in (
       'manual',
       'signoff_reservation',
       'recipient_acknowledgement'
     )
     or char_length(trim(coalesce(p_title, ''))) not between 1 and 240
     or char_length(trim(coalesce(p_description, ''))) not between 1 and 12000
     or p_severity not in ('low','medium','high','critical')
     or p_status not in ('open','in_progress','resolved','accepted')
     or char_length(coalesce(p_corrective_action, '')) > 12000
     or char_length(coalesce(p_resolution_note, '')) > 12000
     or (
       p_status in ('resolved','accepted')
       and nullif(trim(coalesce(p_resolution_note, '')), '') is null
     )
     or (
       p_reminder_date is not null
       and (
         p_due_date is null
         or p_reminder_date > p_due_date
       )
     )
  then
    raise exception 'ASSURANCE_FINDING_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_archive
  from public.executive_governance_assurance_archives
  where id = p_archive_id
    and owner_user_id = auth.uid();

  if not found then
    raise exception 'ASSURANCE_ARCHIVE_NOT_FOUND_OR_NOT_OWNER'
      using errcode = 'P0002';
  end if;

  perform public.projectflow_validate_governance_assurance_finding_source(
    v_archive,
    p_source_type,
    p_source_ref_id
  );

  if p_responsible_user_id is not null then
    if not public.projectflow_governance_assurance_responsible_allowed(
      v_archive,
      p_responsible_user_id
    ) then
      raise exception 'ASSURANCE_FINDING_RESPONSIBLE_NOT_ALLOWED'
        using errcode = '42501';
    end if;

    select
      coalesce(
        nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(u.raw_user_meta_data->>'name'), ''),
        nullif(trim(u.email), ''),
        u.id::text
      ),
      nullif(trim(u.email), '')
    into v_auth_name, v_auth_email
    from auth.users u
    where u.id = p_responsible_user_id;

    if not found then
      raise exception 'ASSURANCE_FINDING_RESPONSIBLE_NOT_FOUND'
        using errcode = '22023';
    end if;
  else
    v_auth_name := null;
    v_auth_email := null;
  end if;

  if p_finding_id is null then
    if p_expected_version is not null then
      raise exception 'ASSURANCE_FINDING_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    v_event := 'created';
    v_notify_assignment := p_responsible_user_id is not null;

    insert into public.executive_governance_assurance_findings (
      archive_id,
      owner_user_id,
      source_type,
      source_ref_id,
      title,
      description,
      severity,
      status,
      responsible_user_id,
      responsible_name_snapshot,
      responsible_email_snapshot,
      due_date,
      reminder_date,
      corrective_action,
      resolution_note,
      resolved_at,
      accepted_at,
      created_by
    )
    values (
      v_archive.id,
      auth.uid(),
      p_source_type,
      p_source_ref_id,
      trim(p_title),
      trim(p_description),
      p_severity,
      p_status,
      p_responsible_user_id,
      v_auth_name,
      v_auth_email,
      p_due_date,
      p_reminder_date,
      nullif(trim(coalesce(p_corrective_action, '')), ''),
      nullif(trim(coalesce(p_resolution_note, '')), ''),
      case when p_status = 'resolved' then now() else null end,
      case when p_status = 'accepted' then now() else null end,
      auth.uid()
    )
    returning * into v_saved;
  else
    select * into v_existing
    from public.executive_governance_assurance_findings
    where id = p_finding_id
      and owner_user_id = auth.uid()
    for update;

    if not found then
      raise exception 'ASSURANCE_FINDING_NOT_FOUND'
        using errcode = 'P0002';
    end if;

    if v_existing.archive_id <> v_archive.id then
      raise exception 'ASSURANCE_FINDING_ARCHIVE_IMMUTABLE'
        using errcode = '55000';
    end if;

    if p_expected_version is null
       or v_existing.version <> p_expected_version
    then
      raise exception 'ASSURANCE_FINDING_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    v_event := 'updated';
    v_notify_assignment :=
      p_responsible_user_id is not null
      and p_responsible_user_id is distinct from v_existing.responsible_user_id;

    update public.executive_governance_assurance_findings
    set
      source_type = p_source_type,
      source_ref_id = p_source_ref_id,
      title = trim(p_title),
      description = trim(p_description),
      severity = p_severity,
      status = p_status,
      responsible_user_id = p_responsible_user_id,
      responsible_name_snapshot = v_auth_name,
      responsible_email_snapshot = v_auth_email,
      due_date = p_due_date,
      reminder_date = p_reminder_date,
      corrective_action =
        nullif(trim(coalesce(p_corrective_action, '')), ''),
      resolution_note =
        nullif(trim(coalesce(p_resolution_note, '')), ''),
      resolved_at = case
        when p_status = 'resolved' then coalesce(v_existing.resolved_at, now())
        else null
      end,
      accepted_at = case
        when p_status = 'accepted' then coalesce(v_existing.accepted_at, now())
        else null
      end,
      version = version + 1,
      updated_at = now()
    where id = v_existing.id
    returning * into v_saved;
  end if;

  insert into public.executive_governance_assurance_finding_history (
    finding_id,
    archive_id,
    owner_user_id,
    version,
    event,
    actor_user_id,
    snapshot
  )
  values (
    v_saved.id,
    v_saved.archive_id,
    v_saved.owner_user_id,
    v_saved.version,
    v_event,
    auth.uid(),
    public.projectflow_governance_assurance_finding_json(v_saved)
  );

  if v_notify_assignment
     and v_saved.responsible_user_id <> auth.uid()
  then
    select * into v_review
    from public.executive_governance_reviews
    where id = v_archive.review_id;

    v_project_id := public.projectflow_governance_notification_project(
      v_saved.responsible_user_id,
      v_review.source_window_meeting_ids
    );

    if v_project_id is not null then
      perform public.enqueue_user_notification(
        v_saved.responsible_user_id,
        v_project_id,
        'governance_alert',
        auth.uid(),
        null,
        null,
        null,
        null,
        jsonb_build_object(
          'event', 'assurance_finding_assigned',
          'archive_id', v_archive.id,
          'certificate_code', v_archive.certificate_code,
          'finding_id', v_saved.id,
          'title', v_saved.title,
          'severity', v_saved.severity,
          'status', v_saved.status,
          'due_date', v_saved.due_date,
          'reminder_date', v_saved.reminder_date
        ),
        'governance-assurance-finding:' || v_saved.id::text ||
          ':responsible:' || v_saved.responsible_user_id::text ||
          ':v' || v_saved.version::text
      );
    end if;
  end if;

  return public.projectflow_governance_assurance_finding_json(v_saved);
end;
$projectflow$;

revoke all on function public.save_executive_governance_assurance_finding(
  uuid, bigint, uuid, text, uuid, text, text, text, text, uuid, date, date, text, text
) from public;
grant execute on function public.save_executive_governance_assurance_finding(
  uuid, bigint, uuid, text, uuid, text, text, text, text, uuid, date, date, text, text
) to authenticated;

create or replace function public.list_executive_governance_assurance_findings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
declare
  v_today date := current_date;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'findings',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'finding',
            public.projectflow_governance_assurance_finding_json(f),
          'archive',
            public.projectflow_governance_archive_json(a),
          'can_manage', f.owner_user_id = auth.uid(),
          'is_responsible', f.responsible_user_id = auth.uid()
        )
        order by
          case f.severity
            when 'critical' then 1
            when 'high' then 2
            when 'medium' then 3
            else 4
          end,
          case
            when f.status in ('open','in_progress')
              and f.due_date is not null
              and f.due_date < v_today
              then 0
            else 1
          end,
          f.updated_at desc
      )
      from public.executive_governance_assurance_findings f
      join public.executive_governance_assurance_archives a
        on a.id = f.archive_id
      where public.projectflow_can_access_governance_assurance_archive(
        a.id,
        auth.uid()
      )
    ), '[]'::jsonb),
    'manageable_archive_ids',
    coalesce((
      select jsonb_agg(a.id order by a.archived_at desc)
      from public.executive_governance_assurance_archives a
      where a.owner_user_id = auth.uid()
    ), '[]'::jsonb),
    'summary',
    coalesce((
      select jsonb_build_object(
        'total', count(*),
        'open', count(*) filter (where f.status = 'open'),
        'in_progress', count(*) filter (where f.status = 'in_progress'),
        'resolved', count(*) filter (where f.status = 'resolved'),
        'accepted', count(*) filter (where f.status = 'accepted'),
        'critical_active', count(*) filter (
          where f.severity = 'critical'
            and f.status in ('open','in_progress')
        ),
        'high_active', count(*) filter (
          where f.severity = 'high'
            and f.status in ('open','in_progress')
        ),
        'overdue_active', count(*) filter (
          where f.status in ('open','in_progress')
            and f.due_date is not null
            and f.due_date < v_today
        ),
        'unassigned_active', count(*) filter (
          where f.status in ('open','in_progress')
            and f.responsible_user_id is null
        ),
        'assigned_to_me_active', count(*) filter (
          where f.status in ('open','in_progress')
            and f.responsible_user_id = auth.uid()
        )
      )
      from public.executive_governance_assurance_findings f
      join public.executive_governance_assurance_archives a
        on a.id = f.archive_id
      where public.projectflow_can_access_governance_assurance_archive(
        a.id,
        auth.uid()
      )
    ), jsonb_build_object(
      'total', 0,
      'open', 0,
      'in_progress', 0,
      'resolved', 0,
      'accepted', 0,
      'critical_active', 0,
      'high_active', 0,
      'overdue_active', 0,
      'unassigned_active', 0,
      'assigned_to_me_active', 0
    ))
  );
end;
$projectflow$;

revoke all on function public.list_executive_governance_assurance_findings()
  from public;
grant execute on function public.list_executive_governance_assurance_findings()
  to authenticated;

create or replace function public.projectflow_enqueue_assurance_finding_followup(
  p_finding public.executive_governance_assurance_findings,
  p_recipient_user_id uuid,
  p_event text,
  p_actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_archive public.executive_governance_assurance_archives%rowtype;
  v_review public.executive_governance_reviews%rowtype;
  v_project_id text;
  v_dedupe text;
begin
  if p_event not in ('assurance_finding_reminder','assurance_finding_overdue') then
    raise exception 'ASSURANCE_FINDING_NOTIFICATION_EVENT_INVALID'
      using errcode = '22023';
  end if;

  select * into v_archive
  from public.executive_governance_assurance_archives
  where id = p_finding.archive_id;

  if not found then
    return 0;
  end if;

  select * into v_review
  from public.executive_governance_reviews
  where id = v_archive.review_id;

  if not found then
    return 0;
  end if;

  v_project_id := public.projectflow_governance_notification_project(
    p_recipient_user_id,
    v_review.source_window_meeting_ids
  );

  if v_project_id is null then
    return 0;
  end if;

  v_dedupe :=
    'governance-assurance-finding-followup:' ||
    p_finding.id::text || ':' ||
    p_event || ':' ||
    coalesce(p_finding.reminder_date::text, 'none') || ':' ||
    coalesce(p_finding.due_date::text, 'none') || ':' ||
    p_recipient_user_id::text;

  perform public.enqueue_user_notification(
    p_recipient_user_id,
    v_project_id,
    'governance_alert',
    p_actor_user_id,
    null,
    null,
    null,
    null,
    jsonb_build_object(
      'event', p_event,
      'archive_id', v_archive.id,
      'certificate_code', v_archive.certificate_code,
      'finding_id', p_finding.id,
      'title', p_finding.title,
      'severity', p_finding.severity,
      'status', p_finding.status,
      'responsible_user_id', p_finding.responsible_user_id,
      'due_date', p_finding.due_date,
      'reminder_date', p_finding.reminder_date
    ),
    v_dedupe
  );

  return 1;
end;
$projectflow$;

revoke all on function public.projectflow_enqueue_assurance_finding_followup(
  public.executive_governance_assurance_findings,
  uuid,
  text,
  uuid
) from public;

create or replace function public.refresh_assurance_finding_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_finding public.executive_governance_assurance_findings%rowtype;
  v_event text;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  for v_finding in
    select f.*
    from public.executive_governance_assurance_findings f
    where f.status in ('open','in_progress')
      and (
        f.owner_user_id = auth.uid()
        or f.responsible_user_id = auth.uid()
      )
      and (
        (
          f.due_date is not null
          and f.due_date < current_date
        )
        or (
          f.reminder_date is not null
          and f.reminder_date <= current_date
          and f.due_date is not null
          and f.due_date >= current_date
        )
      )
  loop
    v_event := case
      when v_finding.due_date < current_date
        then 'assurance_finding_overdue'
      else 'assurance_finding_reminder'
    end;

    v_count := v_count +
      public.projectflow_enqueue_assurance_finding_followup(
        v_finding,
        auth.uid(),
        v_event,
        auth.uid()
      );
  end loop;

  return v_count;
end;
$projectflow$;

revoke all on function public.refresh_assurance_finding_notifications()
  from public;
grant execute on function public.refresh_assurance_finding_notifications()
  to authenticated;

create or replace function public.refresh_all_assurance_finding_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_finding public.executive_governance_assurance_findings%rowtype;
  v_event text;
  v_recipient uuid;
  v_count integer := 0;
begin
  for v_finding in
    select f.*
    from public.executive_governance_assurance_findings f
    where f.status in ('open','in_progress')
      and (
        (
          f.due_date is not null
          and f.due_date < current_date
        )
        or (
          f.reminder_date is not null
          and f.reminder_date <= current_date
          and f.due_date is not null
          and f.due_date >= current_date
        )
      )
  loop
    v_event := case
      when v_finding.due_date < current_date
        then 'assurance_finding_overdue'
      else 'assurance_finding_reminder'
    end;

    for v_recipient in
      select distinct user_id
      from (
        select v_finding.owner_user_id as user_id
        union
        select v_finding.responsible_user_id as user_id
      ) q
      where user_id is not null
    loop
      v_count := v_count +
        public.projectflow_enqueue_assurance_finding_followup(
          v_finding,
          v_recipient,
          v_event,
          v_finding.owner_user_id
        );
    end loop;
  end loop;

  return v_count;
end;
$projectflow$;

revoke all on function public.refresh_all_assurance_finding_notifications()
  from public;

do $projectflow$
begin
  begin
    perform cron.unschedule('projectflow-assurance-findings-followup');
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      null;
    when others then
      null;
  end;

  begin
    perform cron.schedule(
      'projectflow-assurance-findings-followup',
      '25 * * * *',
      'select public.refresh_all_assurance_finding_notifications();'
    );
  exception
    when undefined_function or undefined_table or invalid_schema_name
      or insufficient_privilege then
      null;
    when others then
      null;
  end;
end;
$projectflow$;
