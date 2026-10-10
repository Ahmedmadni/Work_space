-- Phase 55: Finding Corrective Action Plans & Ownership Escalation.

insert into public.projectflow_schema_versions (version, label)
values (39, 'assurance-finding-corrective-action-plans')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.executive_governance_assurance_finding_actions (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null
    references public.executive_governance_assurance_findings(id)
    on delete cascade,
  archive_id uuid not null
    references public.executive_governance_assurance_archives(id)
    on delete restrict,
  finding_owner_user_id uuid not null
    references auth.users(id) on delete cascade,
  title text not null
    check (char_length(trim(title)) between 1 and 240),
  description text not null default ''
    check (char_length(description) <= 12000),
  action_owner_user_id uuid not null
    references auth.users(id) on delete restrict,
  action_owner_name_snapshot text,
  action_owner_email_snapshot text,
  status text not null default 'planned'
    check (status in ('planned','in_progress','completed','cancelled')),
  due_date date,
  reminder_date date,
  closure_note text
    check (char_length(coalesce(closure_note, '')) <= 12000),
  version bigint not null default 1 check (version >= 1),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    reminder_date is null
    or (
      due_date is not null
      and reminder_date <= due_date
    )
  ),
  check (
    status not in ('completed','cancelled')
    or nullif(trim(coalesce(closure_note, '')), '') is not null
  )
);

create index if not exists executive_governance_assurance_finding_actions_finding_idx
  on public.executive_governance_assurance_finding_actions(
    finding_id,
    status,
    due_date
  );

create index if not exists executive_governance_assurance_finding_actions_owner_idx
  on public.executive_governance_assurance_finding_actions(
    action_owner_user_id,
    status,
    reminder_date,
    due_date
  );

alter table public.executive_governance_assurance_finding_actions
  enable row level security;

revoke all on table public.executive_governance_assurance_finding_actions
  from anon, authenticated;

create or replace function public.projectflow_governance_assurance_finding_action_json(
  p_row public.executive_governance_assurance_finding_actions
)
returns jsonb
language sql
stable
as $projectflow$
  select jsonb_build_object(
    'id', p_row.id,
    'finding_id', p_row.finding_id,
    'archive_id', p_row.archive_id,
    'finding_owner_user_id', p_row.finding_owner_user_id,
    'title', p_row.title,
    'description', p_row.description,
    'action_owner_user_id', p_row.action_owner_user_id,
    'action_owner_name_snapshot', p_row.action_owner_name_snapshot,
    'action_owner_email_snapshot', p_row.action_owner_email_snapshot,
    'status', p_row.status,
    'due_date', p_row.due_date,
    'reminder_date', p_row.reminder_date,
    'closure_note', p_row.closure_note,
    'version', p_row.version,
    'completed_at', p_row.completed_at,
    'cancelled_at', p_row.cancelled_at,
    'created_by', p_row.created_by,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$projectflow$;

revoke all on function public.projectflow_governance_assurance_finding_action_json(
  public.executive_governance_assurance_finding_actions
) from public;

create or replace function public.save_executive_governance_assurance_finding_action(
  p_action_id uuid,
  p_expected_version bigint,
  p_finding_id uuid,
  p_title text,
  p_description text,
  p_action_owner_user_id uuid,
  p_status text,
  p_due_date date,
  p_reminder_date date,
  p_closure_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_finding public.executive_governance_assurance_findings%rowtype;
  v_archive public.executive_governance_assurance_archives%rowtype;
  v_existing public.executive_governance_assurance_finding_actions%rowtype;
  v_saved public.executive_governance_assurance_finding_actions%rowtype;
  v_review public.executive_governance_reviews%rowtype;
  v_owner_name text;
  v_owner_email text;
  v_project_id text;
  v_notify_assignment boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_finding_id is null
     or char_length(trim(coalesce(p_title, ''))) not between 1 and 240
     or char_length(coalesce(p_description, '')) > 12000
     or p_action_owner_user_id is null
     or p_status not in ('planned','in_progress','completed','cancelled')
     or char_length(coalesce(p_closure_note, '')) > 12000
     or (
       p_status in ('completed','cancelled')
       and nullif(trim(coalesce(p_closure_note, '')), '') is null
     )
     or (
       p_reminder_date is not null
       and (
         p_due_date is null
         or p_reminder_date > p_due_date
       )
     )
  then
    raise exception 'ASSURANCE_FINDING_ACTION_INVALID_INPUT'
      using errcode = '22023';
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

  if v_finding.status not in ('open','in_progress')
     or v_finding.verification_status = 'pending'
  then
    raise exception 'ASSURANCE_FINDING_ACTIONS_LOCKED'
      using errcode = '55000';
  end if;

  select * into v_archive
  from public.executive_governance_assurance_archives
  where id = v_finding.archive_id;

  if not public.projectflow_governance_assurance_responsible_allowed(
    v_archive,
    p_action_owner_user_id
  ) then
    raise exception 'ASSURANCE_FINDING_ACTION_OWNER_NOT_ALLOWED'
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
  into v_owner_name, v_owner_email
  from auth.users u
  where u.id = p_action_owner_user_id;

  if not found then
    raise exception 'ASSURANCE_FINDING_ACTION_OWNER_NOT_FOUND'
      using errcode = '22023';
  end if;

  if p_action_id is null then
    if p_expected_version is not null then
      raise exception 'ASSURANCE_FINDING_ACTION_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    v_notify_assignment := true;

    insert into public.executive_governance_assurance_finding_actions (
      finding_id,
      archive_id,
      finding_owner_user_id,
      title,
      description,
      action_owner_user_id,
      action_owner_name_snapshot,
      action_owner_email_snapshot,
      status,
      due_date,
      reminder_date,
      closure_note,
      completed_at,
      cancelled_at,
      created_by
    )
    values (
      v_finding.id,
      v_finding.archive_id,
      v_finding.owner_user_id,
      trim(p_title),
      trim(coalesce(p_description, '')),
      p_action_owner_user_id,
      v_owner_name,
      v_owner_email,
      p_status,
      p_due_date,
      p_reminder_date,
      nullif(trim(coalesce(p_closure_note, '')), ''),
      case when p_status = 'completed' then now() else null end,
      case when p_status = 'cancelled' then now() else null end,
      auth.uid()
    )
    returning * into v_saved;
  else
    select * into v_existing
    from public.executive_governance_assurance_finding_actions
    where id = p_action_id
      and finding_id = v_finding.id
      and finding_owner_user_id = auth.uid()
    for update;

    if not found then
      raise exception 'ASSURANCE_FINDING_ACTION_NOT_FOUND'
        using errcode = 'P0002';
    end if;

    if p_expected_version is null
       or v_existing.version <> p_expected_version
    then
      raise exception 'ASSURANCE_FINDING_ACTION_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    v_notify_assignment :=
      p_action_owner_user_id is distinct from v_existing.action_owner_user_id;

    update public.executive_governance_assurance_finding_actions
    set
      title = trim(p_title),
      description = trim(coalesce(p_description, '')),
      action_owner_user_id = p_action_owner_user_id,
      action_owner_name_snapshot = v_owner_name,
      action_owner_email_snapshot = v_owner_email,
      status = p_status,
      due_date = p_due_date,
      reminder_date = p_reminder_date,
      closure_note = nullif(trim(coalesce(p_closure_note, '')), ''),
      completed_at = case
        when p_status = 'completed' then coalesce(v_existing.completed_at, now())
        else null
      end,
      cancelled_at = case
        when p_status = 'cancelled' then coalesce(v_existing.cancelled_at, now())
        else null
      end,
      version = version + 1,
      updated_at = now()
    where id = v_existing.id
    returning * into v_saved;
  end if;

  if v_notify_assignment
     and v_saved.action_owner_user_id <> auth.uid()
  then
    select * into v_review
    from public.executive_governance_reviews
    where id = v_archive.review_id;

    v_project_id := public.projectflow_governance_notification_project(
      v_saved.action_owner_user_id,
      v_review.source_window_meeting_ids
    );

    if v_project_id is not null then
      perform public.enqueue_user_notification(
        v_saved.action_owner_user_id,
        v_project_id,
        'governance_alert',
        auth.uid(),
        null,
        null,
        null,
        null,
        jsonb_build_object(
          'event', 'assurance_finding_action_assigned',
          'archive_id', v_archive.id,
          'certificate_code', v_archive.certificate_code,
          'finding_id', v_finding.id,
          'finding_title', v_finding.title,
          'action_id', v_saved.id,
          'title', v_saved.title,
          'status', v_saved.status,
          'due_date', v_saved.due_date,
          'reminder_date', v_saved.reminder_date
        ),
        'governance-assurance-finding-action:' ||
          v_saved.id::text || ':owner:' ||
          v_saved.action_owner_user_id::text || ':v' ||
          v_saved.version::text
      );
    end if;
  end if;

  return public.projectflow_governance_assurance_finding_action_json(v_saved);
end;
$projectflow$;

revoke all on function public.save_executive_governance_assurance_finding_action(
  uuid, bigint, uuid, text, text, uuid, text, date, date, text
) from public;
grant execute on function public.save_executive_governance_assurance_finding_action(
  uuid, bigint, uuid, text, text, uuid, text, date, date, text
) to authenticated;

create or replace function public.act_on_executive_governance_assurance_finding_action(
  p_action_id uuid,
  p_expected_version bigint,
  p_status text,
  p_closure_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_action public.executive_governance_assurance_finding_actions%rowtype;
  v_finding public.executive_governance_assurance_findings%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_status not in ('in_progress','completed')
     or char_length(coalesce(p_closure_note, '')) > 12000
     or (
       p_status = 'completed'
       and nullif(trim(coalesce(p_closure_note, '')), '') is null
     )
  then
    raise exception 'ASSURANCE_FINDING_ACTION_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_action
  from public.executive_governance_assurance_finding_actions
  where id = p_action_id
    and action_owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'ASSURANCE_FINDING_ACTION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if p_expected_version is null
     or v_action.version <> p_expected_version
  then
    raise exception 'ASSURANCE_FINDING_ACTION_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  if v_action.status in ('completed','cancelled') then
    raise exception 'ASSURANCE_FINDING_ACTION_ALREADY_CLOSED'
      using errcode = '55000';
  end if;

  select * into v_finding
  from public.executive_governance_assurance_findings
  where id = v_action.finding_id;

  if not found
     or v_finding.status not in ('open','in_progress')
     or v_finding.verification_status = 'pending'
  then
    raise exception 'ASSURANCE_FINDING_ACTIONS_LOCKED'
      using errcode = '55000';
  end if;

  update public.executive_governance_assurance_finding_actions
  set
    status = p_status,
    closure_note = case
      when p_status = 'completed'
        then nullif(trim(coalesce(p_closure_note, '')), '')
      else closure_note
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

  return public.projectflow_governance_assurance_finding_action_json(v_action);
end;
$projectflow$;

revoke all on function public.act_on_executive_governance_assurance_finding_action(
  uuid, bigint, text, text
) from public;
grant execute on function public.act_on_executive_governance_assurance_finding_action(
  uuid, bigint, text, text
) to authenticated;

create or replace function public.projectflow_validate_assurance_finding_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  if tg_op = 'UPDATE' then
    if old.verification_status = 'pending'
       and not (
         auth.uid() = old.verifier_user_id
         and new.verification_status in (
           'effective',
           'partially_effective',
           'ineffective'
         )
         and new.responsible_user_id is not distinct from old.responsible_user_id
       )
    then
      raise exception 'ASSURANCE_FINDING_VERIFICATION_PENDING'
        using errcode = '55000';
    end if;

    if old.status = 'resolved'
       and new.status is distinct from 'resolved'
       and old.verification_status <> 'pending'
    then
      new.verification_status := 'not_requested';
      new.verifier_user_id := null;
      new.verifier_name_snapshot := null;
      new.verifier_email_snapshot := null;
      new.verification_requested_at := null;
      new.verified_at := null;
      new.effectiveness_note := null;
    end if;
  end if;

  if new.status in ('resolved','accepted') then
    if exists (
      select 1
      from public.executive_governance_assurance_finding_actions a
      where a.finding_id = new.id
        and a.status in ('planned','in_progress')
    ) then
      raise exception 'ASSURANCE_FINDING_OPEN_ACTIONS'
        using errcode = '55000';
    end if;
  end if;

  if new.status = 'resolved' then
    if tg_op = 'INSERT' then
      raise exception 'ASSURANCE_FINDING_EVIDENCE_REQUIRED_BEFORE_RESOLUTION'
        using errcode = '55000';
    end if;

    if not exists (
      select 1
      from public.executive_governance_assurance_finding_evidence e
      where e.finding_id = new.id
    ) then
      raise exception 'ASSURANCE_FINDING_EVIDENCE_REQUIRED_BEFORE_RESOLUTION'
        using errcode = '55000';
    end if;

    if old.status is distinct from 'resolved' then
      new.verification_status := 'not_requested';
      new.verifier_user_id := null;
      new.verifier_name_snapshot := null;
      new.verifier_email_snapshot := null;
      new.verification_requested_at := null;
      new.verified_at := null;
      new.effectiveness_note := null;
    end if;
  end if;

  return new;
end;
$projectflow$;

revoke all on function public.projectflow_validate_assurance_finding_resolution()
  from public;

create or replace function public.projectflow_enqueue_assurance_finding_action_followup(
  p_action public.executive_governance_assurance_finding_actions,
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
  v_finding public.executive_governance_assurance_findings%rowtype;
  v_review public.executive_governance_reviews%rowtype;
  v_project_id text;
  v_dedupe text;
begin
  if p_event not in (
    'assurance_finding_action_reminder',
    'assurance_finding_action_overdue'
  ) then
    raise exception 'ASSURANCE_FINDING_ACTION_NOTIFICATION_EVENT_INVALID'
      using errcode = '22023';
  end if;

  select * into v_archive
  from public.executive_governance_assurance_archives
  where id = p_action.archive_id;

  select * into v_finding
  from public.executive_governance_assurance_findings
  where id = p_action.finding_id;

  select * into v_review
  from public.executive_governance_reviews
  where id = v_archive.review_id;

  if v_archive.id is null or v_finding.id is null or v_review.id is null then
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
    'governance-assurance-finding-action-followup:' ||
    p_action.id::text || ':' ||
    p_event || ':' ||
    coalesce(p_action.reminder_date::text, 'none') || ':' ||
    coalesce(p_action.due_date::text, 'none') || ':' ||
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
      'finding_id', v_finding.id,
      'finding_title', v_finding.title,
      'action_id', p_action.id,
      'title', p_action.title,
      'status', p_action.status,
      'due_date', p_action.due_date,
      'reminder_date', p_action.reminder_date
    ),
    v_dedupe
  );

  return 1;
end;
$projectflow$;

revoke all on function public.projectflow_enqueue_assurance_finding_action_followup(
  public.executive_governance_assurance_finding_actions,
  uuid,
  text,
  uuid
) from public;

create or replace function public.refresh_assurance_finding_action_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_action public.executive_governance_assurance_finding_actions%rowtype;
  v_event text;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  for v_action in
    select a.*
    from public.executive_governance_assurance_finding_actions a
    where a.status in ('planned','in_progress')
      and (
        a.finding_owner_user_id = auth.uid()
        or a.action_owner_user_id = auth.uid()
      )
      and (
        (
          a.due_date is not null
          and a.due_date < current_date
        )
        or (
          a.reminder_date is not null
          and a.reminder_date <= current_date
          and a.due_date is not null
          and a.due_date >= current_date
        )
      )
  loop
    v_event := case
      when v_action.due_date < current_date
        then 'assurance_finding_action_overdue'
      else 'assurance_finding_action_reminder'
    end;

    v_count := v_count +
      public.projectflow_enqueue_assurance_finding_action_followup(
        v_action,
        auth.uid(),
        v_event,
        auth.uid()
      );
  end loop;

  return v_count;
end;
$projectflow$;

revoke all on function public.refresh_assurance_finding_action_notifications()
  from public;
grant execute on function public.refresh_assurance_finding_action_notifications()
  to authenticated;

create or replace function public.refresh_all_assurance_finding_action_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_action public.executive_governance_assurance_finding_actions%rowtype;
  v_event text;
  v_recipient uuid;
  v_count integer := 0;
begin
  for v_action in
    select a.*
    from public.executive_governance_assurance_finding_actions a
    where a.status in ('planned','in_progress')
      and (
        (
          a.due_date is not null
          and a.due_date < current_date
        )
        or (
          a.reminder_date is not null
          and a.reminder_date <= current_date
          and a.due_date is not null
          and a.due_date >= current_date
        )
      )
  loop
    v_event := case
      when v_action.due_date < current_date
        then 'assurance_finding_action_overdue'
      else 'assurance_finding_action_reminder'
    end;

    for v_recipient in
      select distinct user_id
      from (
        select v_action.finding_owner_user_id as user_id
        union
        select v_action.action_owner_user_id as user_id
      ) q
      where user_id is not null
    loop
      v_count := v_count +
        public.projectflow_enqueue_assurance_finding_action_followup(
          v_action,
          v_recipient,
          v_event,
          v_action.finding_owner_user_id
        );
    end loop;
  end loop;

  return v_count;
end;
$projectflow$;

revoke all on function public.refresh_all_assurance_finding_action_notifications()
  from public;

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
          'is_responsible', f.responsible_user_id = auth.uid(),
          'can_verify',
            f.verifier_user_id = auth.uid()
            and f.verification_status = 'pending'
            and f.status = 'resolved',
          'evidence',
            coalesce((
              select jsonb_agg(
                public.projectflow_governance_assurance_finding_evidence_json(e)
                order by e.created_at asc
              )
              from public.executive_governance_assurance_finding_evidence e
              where e.finding_id = f.id
            ), '[]'::jsonb),
          'actions',
            coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'action',
                    public.projectflow_governance_assurance_finding_action_json(x),
                  'can_manage', x.finding_owner_user_id = auth.uid(),
                  'is_action_owner', x.action_owner_user_id = auth.uid()
                )
                order by
                  case x.status
                    when 'in_progress' then 1
                    when 'planned' then 2
                    when 'completed' then 3
                    else 4
                  end,
                  x.due_date nulls last,
                  x.created_at asc
              )
              from public.executive_governance_assurance_finding_actions x
              where x.finding_id = f.id
            ), '[]'::jsonb)
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
        ),
        'verification_pending', count(*) filter (
          where f.verification_status = 'pending'
        ),
        'ineffective_active', count(*) filter (
          where f.status in ('open','in_progress')
            and f.verification_status in (
              'partially_effective',
              'ineffective'
            )
        ),
        'open_actions', (
          select count(*)
          from public.executive_governance_assurance_finding_actions x
          join public.executive_governance_assurance_findings f2
            on f2.id = x.finding_id
          join public.executive_governance_assurance_archives a2
            on a2.id = f2.archive_id
          where x.status in ('planned','in_progress')
            and public.projectflow_can_access_governance_assurance_archive(
              a2.id,
              auth.uid()
            )
        ),
        'overdue_actions', (
          select count(*)
          from public.executive_governance_assurance_finding_actions x
          join public.executive_governance_assurance_findings f2
            on f2.id = x.finding_id
          join public.executive_governance_assurance_archives a2
            on a2.id = f2.archive_id
          where x.status in ('planned','in_progress')
            and x.due_date is not null
            and x.due_date < v_today
            and public.projectflow_can_access_governance_assurance_archive(
              a2.id,
              auth.uid()
            )
        ),
        'actions_assigned_to_me', (
          select count(*)
          from public.executive_governance_assurance_finding_actions x
          join public.executive_governance_assurance_findings f2
            on f2.id = x.finding_id
          join public.executive_governance_assurance_archives a2
            on a2.id = f2.archive_id
          where x.status in ('planned','in_progress')
            and x.action_owner_user_id = auth.uid()
            and public.projectflow_can_access_governance_assurance_archive(
              a2.id,
              auth.uid()
            )
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
      'assigned_to_me_active', 0,
      'verification_pending', 0,
      'ineffective_active', 0,
      'open_actions', 0,
      'overdue_actions', 0,
      'actions_assigned_to_me', 0
    ))
  );
end;
$projectflow$;

revoke all on function public.list_executive_governance_assurance_findings()
  from public;
grant execute on function public.list_executive_governance_assurance_findings()
  to authenticated;

do $projectflow$
begin
  begin
    perform cron.unschedule('projectflow-assurance-finding-actions');
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      null;
    when others then
      null;
  end;

  begin
    perform cron.schedule(
      'projectflow-assurance-finding-actions',
      '35 * * * *',
      'select public.refresh_all_assurance_finding_action_notifications();'
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
