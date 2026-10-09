-- Phase 56: CAPA Assignee Workflow, Due Escalation & Closure Readiness.

insert into public.projectflow_schema_versions (version, label)
values (40, 'assurance-capa-assignee-followup')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create or replace function public.act_on_executive_governance_assurance_finding_action(
  p_action_id uuid,
  p_expected_version bigint,
  p_status text,
  p_outcome_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_action public.executive_governance_assurance_finding_actions%rowtype;
  v_finding public.executive_governance_assurance_findings%rowtype;
  v_archive public.executive_governance_assurance_archives%rowtype;
  v_review public.executive_governance_reviews%rowtype;
  v_project_id text;
  v_event text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_status not in ('in_progress','completed')
     or char_length(coalesce(p_outcome_note, '')) > 12000
     or (
       p_status = 'completed'
       and nullif(trim(coalesce(p_outcome_note, '')), '') is null
     )
     or (
       p_status = 'in_progress'
       and nullif(trim(coalesce(p_outcome_note, '')), '') is not null
     )
  then
    raise exception 'ASSURANCE_CAPA_ASSIGNEE_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_action
  from public.executive_governance_assurance_finding_actions
  where id = p_action_id
    and responsible_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'ASSURANCE_CAPA_ACTION_NOT_ASSIGNED_TO_ACTOR'
      using errcode = '42501';
  end if;

  if p_expected_version is null
     or v_action.version <> p_expected_version
  then
    raise exception 'ASSURANCE_CAPA_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  select * into v_finding
  from public.executive_governance_assurance_findings
  where id = v_action.finding_id
  for update;

  if not found then
    raise exception 'ASSURANCE_FINDING_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_finding.verification_status = 'pending' then
    raise exception 'ASSURANCE_FINDING_VERIFICATION_PENDING'
      using errcode = '55000';
  end if;

  if v_action.status = 'open' then
    if p_status not in ('in_progress','completed') then
      raise exception 'ASSURANCE_CAPA_ASSIGNEE_TRANSITION_INVALID'
        using errcode = '55000';
    end if;
  elsif v_action.status = 'in_progress' then
    if p_status <> 'completed' then
      raise exception 'ASSURANCE_CAPA_ASSIGNEE_TRANSITION_INVALID'
        using errcode = '55000';
    end if;
  else
    raise exception 'ASSURANCE_CAPA_ASSIGNEE_TRANSITION_INVALID'
      using errcode = '55000';
  end if;

  update public.executive_governance_assurance_finding_actions
  set
    status = p_status,
    outcome_note = case
      when p_status = 'completed'
        then nullif(trim(coalesce(p_outcome_note, '')), '')
      else null
    end,
    completed_at = case
      when p_status = 'completed' then now()
      else null
    end,
    cancelled_at = null,
    version = version + 1,
    updated_at = now()
  where id = v_action.id
  returning * into v_action;

  insert into public.executive_governance_assurance_finding_action_history (
    action_id,
    finding_id,
    archive_id,
    owner_user_id,
    version,
    event,
    actor_user_id,
    snapshot
  )
  values (
    v_action.id,
    v_action.finding_id,
    v_action.archive_id,
    v_action.owner_user_id,
    v_action.version,
    'updated',
    auth.uid(),
    public.projectflow_governance_assurance_finding_action_json(v_action)
  );

  select * into v_archive
  from public.executive_governance_assurance_archives
  where id = v_action.archive_id;

  select * into v_review
  from public.executive_governance_reviews
  where id = v_archive.review_id;

  v_event := case
    when p_status = 'completed' then 'assurance_capa_action_completed'
    else 'assurance_capa_action_started'
  end;

  if v_action.owner_user_id <> auth.uid() then
    v_project_id := public.projectflow_governance_notification_project(
      v_action.owner_user_id,
      v_review.source_window_meeting_ids
    );

    if v_project_id is not null then
      perform public.enqueue_user_notification(
        v_action.owner_user_id,
        v_project_id,
        'governance_alert',
        auth.uid(),
        null,
        null,
        null,
        null,
        jsonb_build_object(
          'event', v_event,
          'archive_id', v_archive.id,
          'certificate_code', v_archive.certificate_code,
          'finding_id', v_finding.id,
          'finding_title', v_finding.title,
          'action_id', v_action.id,
          'title', v_action.title,
          'action_type', v_action.action_type,
          'status', v_action.status,
          'due_date', v_action.due_date
        ),
        'governance-assurance-capa:' ||
          v_action.id::text || ':' || v_event ||
          ':v' || v_action.version::text ||
          ':' || v_action.owner_user_id::text
      );
    end if;
  end if;

  return public.projectflow_governance_assurance_finding_action_json(v_action);
end;
$projectflow$;

revoke all on function public.act_on_executive_governance_assurance_finding_action(
  uuid, bigint, text, text
) from public;
grant execute on function public.act_on_executive_governance_assurance_finding_action(
  uuid, bigint, text, text
) to authenticated;

create or replace function public.projectflow_enqueue_assurance_capa_overdue(
  p_action public.executive_governance_assurance_finding_actions,
  p_recipient_user_id uuid,
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
  v_finding public.executive_governance_assurance_findings%rowtype;
  v_project_id text;
begin
  select * into v_archive
  from public.executive_governance_assurance_archives
  where id = p_action.archive_id;

  if not found then return 0; end if;

  select * into v_review
  from public.executive_governance_reviews
  where id = v_archive.review_id;

  if not found then return 0; end if;

  select * into v_finding
  from public.executive_governance_assurance_findings
  where id = p_action.finding_id;

  if not found then return 0; end if;

  v_project_id := public.projectflow_governance_notification_project(
    p_recipient_user_id,
    v_review.source_window_meeting_ids
  );

  if v_project_id is null then return 0; end if;

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
      'event', 'assurance_capa_action_overdue',
      'archive_id', v_archive.id,
      'certificate_code', v_archive.certificate_code,
      'finding_id', v_finding.id,
      'finding_title', v_finding.title,
      'action_id', p_action.id,
      'title', p_action.title,
      'action_type', p_action.action_type,
      'status', p_action.status,
      'due_date', p_action.due_date
    ),
    'governance-assurance-capa-overdue:' ||
      p_action.id::text || ':' ||
      coalesce(p_action.due_date::text, 'none') || ':' ||
      p_recipient_user_id::text
  );

  return 1;
end;
$projectflow$;

revoke all on function public.projectflow_enqueue_assurance_capa_overdue(
  public.executive_governance_assurance_finding_actions,
  uuid,
  uuid
) from public;

create or replace function public.refresh_assurance_capa_action_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_action public.executive_governance_assurance_finding_actions%rowtype;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  for v_action in
    select a.*
    from public.executive_governance_assurance_finding_actions a
    where a.status in ('open','in_progress')
      and a.due_date is not null
      and a.due_date < current_date
      and (
        a.owner_user_id = auth.uid()
        or a.responsible_user_id = auth.uid()
      )
  loop
    v_count := v_count +
      public.projectflow_enqueue_assurance_capa_overdue(
        v_action,
        auth.uid(),
        auth.uid()
      );
  end loop;

  return v_count;
end;
$projectflow$;

revoke all on function public.refresh_assurance_capa_action_notifications()
  from public;
grant execute on function public.refresh_assurance_capa_action_notifications()
  to authenticated;

create or replace function public.refresh_all_assurance_capa_action_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_action public.executive_governance_assurance_finding_actions%rowtype;
  v_recipient uuid;
  v_count integer := 0;
begin
  for v_action in
    select a.*
    from public.executive_governance_assurance_finding_actions a
    where a.status in ('open','in_progress')
      and a.due_date is not null
      and a.due_date < current_date
  loop
    for v_recipient in
      select distinct user_id
      from (
        select v_action.owner_user_id as user_id
        union
        select v_action.responsible_user_id as user_id
      ) q
      where user_id is not null
    loop
      v_count := v_count +
        public.projectflow_enqueue_assurance_capa_overdue(
          v_action,
          v_recipient,
          v_action.owner_user_id
        );
    end loop;
  end loop;

  return v_count;
end;
$projectflow$;

revoke all on function public.refresh_all_assurance_capa_action_notifications()
  from public;

create or replace function public.request_executive_governance_assurance_finding_verification(
  p_finding_id uuid,
  p_expected_version bigint,
  p_verifier_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_finding public.executive_governance_assurance_findings%rowtype;
  v_archive public.executive_governance_assurance_archives%rowtype;
  v_review public.executive_governance_reviews%rowtype;
  v_name text;
  v_email text;
  v_project_id text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_finding
  from public.executive_governance_assurance_findings
  where id = p_finding_id
    and owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'ASSURANCE_FINDING_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if p_expected_version is null
     or v_finding.version <> p_expected_version
  then
    raise exception 'ASSURANCE_FINDING_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  if v_finding.status <> 'resolved' then
    raise exception 'ASSURANCE_FINDING_MUST_BE_RESOLVED_BEFORE_VERIFICATION'
      using errcode = '55000';
  end if;

  if v_finding.verification_status <> 'not_requested' then
    raise exception 'ASSURANCE_FINDING_VERIFICATION_NOT_REQUESTABLE'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.executive_governance_assurance_finding_evidence e
    where e.finding_id = v_finding.id
  ) then
    raise exception 'ASSURANCE_FINDING_EVIDENCE_REQUIRED_BEFORE_VERIFICATION'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.executive_governance_assurance_finding_actions a
    where a.finding_id = v_finding.id
      and a.status in ('open','in_progress')
  ) then
    raise exception 'ASSURANCE_CAPA_ACTIVE_ACTIONS_BLOCK_VERIFICATION'
      using errcode = '55000';
  end if;

  if v_finding.recurrence_parent_finding_id is not null
     and not exists (
       select 1
       from public.executive_governance_assurance_finding_actions a
       where a.finding_id = v_finding.id
         and a.action_type = 'preventive'
         and a.status = 'completed'
     )
  then
    raise exception 'ASSURANCE_CAPA_PREVENTIVE_REQUIRED_FOR_RECURRENCE'
      using errcode = '55000';
  end if;

  select * into v_archive
  from public.executive_governance_assurance_archives
  where id = v_finding.archive_id;

  if p_verifier_user_id is null
     or not public.projectflow_governance_assurance_responsible_allowed(
       v_archive,
       p_verifier_user_id
     )
     or p_verifier_user_id is not distinct from v_finding.responsible_user_id
  then
    raise exception 'ASSURANCE_FINDING_VERIFIER_NOT_INDEPENDENT'
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
  into v_name, v_email
  from auth.users u
  where u.id = p_verifier_user_id;

  if not found then
    raise exception 'ASSURANCE_FINDING_VERIFIER_NOT_FOUND'
      using errcode = '22023';
  end if;

  update public.executive_governance_assurance_findings
  set
    verification_status = 'pending',
    verifier_user_id = p_verifier_user_id,
    verifier_name_snapshot = v_name,
    verifier_email_snapshot = v_email,
    verification_requested_at = now(),
    verified_at = null,
    effectiveness_note = null,
    version = version + 1,
    updated_at = now()
  where id = v_finding.id
  returning * into v_finding;

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
    v_finding.id,
    v_finding.archive_id,
    v_finding.owner_user_id,
    v_finding.version,
    'updated',
    auth.uid(),
    public.projectflow_governance_assurance_finding_json(v_finding)
  );

  select * into v_review
  from public.executive_governance_reviews
  where id = v_archive.review_id;

  if p_verifier_user_id <> auth.uid() then
    v_project_id := public.projectflow_governance_notification_project(
      p_verifier_user_id,
      v_review.source_window_meeting_ids
    );

    if v_project_id is not null then
      perform public.enqueue_user_notification(
        p_verifier_user_id,
        v_project_id,
        'governance_alert',
        auth.uid(),
        null,
        null,
        null,
        null,
        jsonb_build_object(
          'event', 'assurance_finding_verification_requested',
          'archive_id', v_archive.id,
          'certificate_code', v_archive.certificate_code,
          'finding_id', v_finding.id,
          'title', v_finding.title,
          'severity', v_finding.severity
        ),
        'governance-assurance-finding-verification:' ||
          v_finding.id::text || ':request:v' || v_finding.version::text
      );
    end if;
  end if;

  return public.projectflow_governance_assurance_finding_json(v_finding);
end;
$projectflow$;

do $projectflow$
begin
  begin
    perform cron.unschedule('projectflow-assurance-capa-followup');
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      null;
    when others then
      null;
  end;

  begin
    perform cron.schedule(
      'projectflow-assurance-capa-followup',
      '35 * * * *',
      'select public.refresh_all_assurance_capa_action_notifications();'
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
