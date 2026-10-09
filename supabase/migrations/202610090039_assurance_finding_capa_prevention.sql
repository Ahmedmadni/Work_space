-- Phase 55: Structured CAPA & Recurrence Prevention.

insert into public.projectflow_schema_versions (version, label)
values (39, 'assurance-finding-capa-prevention')
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
  owner_user_id uuid not null
    references auth.users(id) on delete cascade,
  action_type text not null
    check (action_type in ('corrective','preventive')),
  title text not null
    check (char_length(trim(title)) between 1 and 240),
  description text not null
    check (char_length(trim(description)) between 1 and 12000),
  status text not null default 'open'
    check (status in ('open','in_progress','completed','cancelled')),
  responsible_user_id uuid
    references auth.users(id) on delete set null,
  responsible_name_snapshot text,
  responsible_email_snapshot text,
  due_date date,
  outcome_note text
    check (char_length(coalesce(outcome_note, '')) <= 12000),
  version bigint not null default 1
    check (version >= 1),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint executive_governance_assurance_finding_action_terminal_check
  check (
    (
      status in ('open','in_progress')
      and completed_at is null
      and cancelled_at is null
      and nullif(trim(coalesce(outcome_note, '')), '') is null
    )
    or
    (
      status = 'completed'
      and completed_at is not null
      and cancelled_at is null
      and nullif(trim(coalesce(outcome_note, '')), '') is not null
    )
    or
    (
      status = 'cancelled'
      and cancelled_at is not null
      and completed_at is null
      and nullif(trim(coalesce(outcome_note, '')), '') is not null
    )
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
    owner_user_id,
    action_type,
    status,
    due_date
  );

alter table public.executive_governance_assurance_finding_actions
  enable row level security;
revoke all on table public.executive_governance_assurance_finding_actions
  from anon, authenticated;

create table if not exists public.executive_governance_assurance_finding_action_history (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null
    references public.executive_governance_assurance_finding_actions(id)
    on delete cascade,
  finding_id uuid not null
    references public.executive_governance_assurance_findings(id)
    on delete cascade,
  archive_id uuid not null
    references public.executive_governance_assurance_archives(id)
    on delete restrict,
  owner_user_id uuid not null
    references auth.users(id) on delete cascade,
  version bigint not null,
  event text not null check (event in ('created','updated')),
  actor_user_id uuid not null
    references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(action_id, version)
);

alter table public.executive_governance_assurance_finding_action_history
  enable row level security;
revoke all on table public.executive_governance_assurance_finding_action_history
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
    'owner_user_id', p_row.owner_user_id,
    'action_type', p_row.action_type,
    'title', p_row.title,
    'description', p_row.description,
    'status', p_row.status,
    'responsible_user_id', p_row.responsible_user_id,
    'responsible_name_snapshot', p_row.responsible_name_snapshot,
    'responsible_email_snapshot', p_row.responsible_email_snapshot,
    'due_date', p_row.due_date,
    'outcome_note', p_row.outcome_note,
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

create or replace function public.list_executive_governance_assurance_finding_actions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'action',
          public.projectflow_governance_assurance_finding_action_json(a),
        'can_manage', a.owner_user_id = auth.uid(),
        'is_responsible', a.responsible_user_id = auth.uid()
      )
      order by
        case
          when a.status in ('open','in_progress')
            and a.due_date is not null
            and a.due_date < current_date
            then 0
          when a.status in ('open','in_progress') then 1
          when a.status = 'completed' then 2
          else 3
        end,
        a.updated_at desc
    )
    from public.executive_governance_assurance_finding_actions a
    where public.projectflow_can_access_governance_assurance_archive(
      a.archive_id,
      auth.uid()
    )
  ), '[]'::jsonb);
end;
$projectflow$;

revoke all on function public.list_executive_governance_assurance_finding_actions()
  from public;
grant execute on function public.list_executive_governance_assurance_finding_actions()
  to authenticated;

create or replace function public.save_executive_governance_assurance_finding_action(
  p_action_id uuid,
  p_expected_version bigint,
  p_finding_id uuid,
  p_action_type text,
  p_title text,
  p_description text,
  p_status text,
  p_responsible_user_id uuid,
  p_due_date date,
  p_outcome_note text
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
  v_existing public.executive_governance_assurance_finding_actions%rowtype;
  v_saved public.executive_governance_assurance_finding_actions%rowtype;
  v_name text;
  v_email text;
  v_event text;
  v_notify_assignment boolean := false;
  v_project_id text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_action_type not in ('corrective','preventive')
     or char_length(trim(coalesce(p_title, ''))) not between 1 and 240
     or char_length(trim(coalesce(p_description, ''))) not between 1 and 12000
     or p_status not in ('open','in_progress','completed','cancelled')
     or char_length(coalesce(p_outcome_note, '')) > 12000
     or (
       p_status in ('completed','cancelled')
       and nullif(trim(coalesce(p_outcome_note, '')), '') is null
     )
     or (
       p_status in ('open','in_progress')
       and nullif(trim(coalesce(p_outcome_note, '')), '') is not null
     )
  then
    raise exception 'ASSURANCE_CAPA_ACTION_INVALID_INPUT'
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

  if v_finding.verification_status = 'pending' then
    raise exception 'ASSURANCE_FINDING_VERIFICATION_PENDING'
      using errcode = '55000';
  end if;

  select * into v_archive
  from public.executive_governance_assurance_archives
  where id = v_finding.archive_id;

  if not found then
    raise exception 'ASSURANCE_ARCHIVE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if p_responsible_user_id is not null then
    if not public.projectflow_governance_assurance_responsible_allowed(
      v_archive,
      p_responsible_user_id
    ) then
      raise exception 'ASSURANCE_CAPA_RESPONSIBLE_NOT_ALLOWED'
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
    where u.id = p_responsible_user_id;

    if not found then
      raise exception 'ASSURANCE_CAPA_RESPONSIBLE_NOT_FOUND'
        using errcode = '22023';
    end if;
  else
    v_name := null;
    v_email := null;
  end if;

  if p_action_id is null then
    if p_expected_version is not null then
      raise exception 'ASSURANCE_CAPA_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    v_event := 'created';
    v_notify_assignment := p_responsible_user_id is not null;

    insert into public.executive_governance_assurance_finding_actions (
      finding_id,
      archive_id,
      owner_user_id,
      action_type,
      title,
      description,
      status,
      responsible_user_id,
      responsible_name_snapshot,
      responsible_email_snapshot,
      due_date,
      outcome_note,
      completed_at,
      cancelled_at,
      created_by
    )
    values (
      v_finding.id,
      v_finding.archive_id,
      v_finding.owner_user_id,
      p_action_type,
      trim(p_title),
      trim(p_description),
      p_status,
      p_responsible_user_id,
      v_name,
      v_email,
      p_due_date,
      case
        when p_status in ('completed','cancelled')
          then nullif(trim(coalesce(p_outcome_note, '')), '')
        else null
      end,
      case when p_status = 'completed' then now() else null end,
      case when p_status = 'cancelled' then now() else null end,
      auth.uid()
    )
    returning * into v_saved;
  else
    select * into v_existing
    from public.executive_governance_assurance_finding_actions
    where id = p_action_id
      and owner_user_id = auth.uid()
    for update;

    if not found then
      raise exception 'ASSURANCE_CAPA_ACTION_NOT_FOUND'
        using errcode = 'P0002';
    end if;

    if v_existing.finding_id <> v_finding.id then
      raise exception 'ASSURANCE_CAPA_FINDING_IMMUTABLE'
        using errcode = '55000';
    end if;

    if p_expected_version is null
       or v_existing.version <> p_expected_version
    then
      raise exception 'ASSURANCE_CAPA_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    v_event := 'updated';
    v_notify_assignment :=
      p_responsible_user_id is not null
      and p_responsible_user_id is distinct from
        v_existing.responsible_user_id;

    update public.executive_governance_assurance_finding_actions
    set
      action_type = p_action_type,
      title = trim(p_title),
      description = trim(p_description),
      status = p_status,
      responsible_user_id = p_responsible_user_id,
      responsible_name_snapshot = v_name,
      responsible_email_snapshot = v_email,
      due_date = p_due_date,
      outcome_note = case
        when p_status in ('completed','cancelled')
          then nullif(trim(coalesce(p_outcome_note, '')), '')
        else null
      end,
      completed_at = case
        when p_status = 'completed'
          then coalesce(v_existing.completed_at, now())
        else null
      end,
      cancelled_at = case
        when p_status = 'cancelled'
          then coalesce(v_existing.cancelled_at, now())
        else null
      end,
      version = version + 1,
      updated_at = now()
    where id = v_existing.id
    returning * into v_saved;
  end if;

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
    v_saved.id,
    v_saved.finding_id,
    v_saved.archive_id,
    v_saved.owner_user_id,
    v_saved.version,
    v_event,
    auth.uid(),
    public.projectflow_governance_assurance_finding_action_json(v_saved)
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
          'event', 'assurance_capa_action_assigned',
          'archive_id', v_archive.id,
          'certificate_code', v_archive.certificate_code,
          'finding_id', v_finding.id,
          'finding_title', v_finding.title,
          'action_id', v_saved.id,
          'title', v_saved.title,
          'action_type', v_saved.action_type,
          'status', v_saved.status,
          'due_date', v_saved.due_date
        ),
        'governance-assurance-capa:' ||
          v_saved.id::text || ':responsible:' ||
          v_saved.responsible_user_id::text || ':v' ||
          v_saved.version::text
      );
    end if;
  end if;

  return public.projectflow_governance_assurance_finding_action_json(v_saved);
end;
$projectflow$;

revoke all on function public.save_executive_governance_assurance_finding_action(
  uuid, bigint, uuid, text, text, text, text, uuid, date, text
) from public;
grant execute on function public.save_executive_governance_assurance_finding_action(
  uuid, bigint, uuid, text, text, text, text, uuid, date, text
) to authenticated;
