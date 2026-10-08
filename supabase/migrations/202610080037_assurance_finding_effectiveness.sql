-- Phase 52: Assurance Finding Closure Evidence & Effectiveness Review.

insert into public.projectflow_schema_versions (version, label)
values (37, 'assurance-finding-effectiveness-review')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

alter table public.executive_governance_assurance_findings
  add column if not exists verification_status text not null default 'not_requested',
  add column if not exists verifier_user_id uuid references auth.users(id) on delete set null,
  add column if not exists verifier_name_snapshot text,
  add column if not exists verifier_email_snapshot text,
  add column if not exists verification_requested_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists effectiveness_note text;

alter table public.executive_governance_assurance_findings
  drop constraint if exists executive_governance_assurance_finding_verification_status_check;

alter table public.executive_governance_assurance_findings
  add constraint executive_governance_assurance_finding_verification_status_check
  check (
    verification_status in (
      'not_requested',
      'pending',
      'effective',
      'partially_effective',
      'ineffective'
    )
  );

alter table public.executive_governance_assurance_findings
  drop constraint if exists executive_governance_assurance_finding_effectiveness_note_length;

alter table public.executive_governance_assurance_findings
  add constraint executive_governance_assurance_finding_effectiveness_note_length
  check (char_length(coalesce(effectiveness_note, '')) <= 12000);

create table if not exists public.executive_governance_assurance_finding_evidence (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null
    references public.executive_governance_assurance_findings(id)
    on delete cascade,
  archive_id uuid not null
    references public.executive_governance_assurance_archives(id)
    on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  evidence_type text not null
    check (evidence_type in ('note','link','reference')),
  title text not null
    check (char_length(trim(title)) between 1 and 240),
  detail text not null
    check (char_length(trim(detail)) between 1 and 12000),
  reference_url text
    check (
      char_length(coalesce(reference_url, '')) <= 2000
      and (
        reference_url is null
        or reference_url ~* '^https?://'
      )
    ),
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists executive_governance_assurance_finding_evidence_idx
  on public.executive_governance_assurance_finding_evidence(
    finding_id,
    created_at desc
  );

alter table public.executive_governance_assurance_finding_evidence enable row level security;
revoke all on table public.executive_governance_assurance_finding_evidence
  from anon, authenticated;

create or replace function public.projectflow_governance_assurance_finding_evidence_json(
  p_row public.executive_governance_assurance_finding_evidence
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
    'evidence_type', p_row.evidence_type,
    'title', p_row.title,
    'detail', p_row.detail,
    'reference_url', p_row.reference_url,
    'created_by', p_row.created_by,
    'created_at', p_row.created_at
  );
$projectflow$;

revoke all on function public.projectflow_governance_assurance_finding_evidence_json(
  public.executive_governance_assurance_finding_evidence
) from public;

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
    'verification_status', p_row.verification_status,
    'verifier_user_id', p_row.verifier_user_id,
    'verifier_name_snapshot', p_row.verifier_name_snapshot,
    'verifier_email_snapshot', p_row.verifier_email_snapshot,
    'verification_requested_at', p_row.verification_requested_at,
    'verified_at', p_row.verified_at,
    'effectiveness_note', p_row.effectiveness_note,
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

create or replace function public.projectflow_validate_assurance_finding_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
begin
  if tg_op = 'UPDATE'
     and old.verification_status = 'pending'
     and (
       new.status is distinct from old.status
       or new.responsible_user_id is distinct from old.responsible_user_id
     )
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

  if tg_op = 'UPDATE'
     and old.status = 'resolved'
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

  if new.status = 'resolved' then
    if tg_op = 'INSERT'
       or not exists (
         select 1
         from public.executive_governance_assurance_finding_evidence e
         where e.finding_id = new.id
       )
    then
      raise exception 'ASSURANCE_FINDING_EVIDENCE_REQUIRED_BEFORE_RESOLUTION'
        using errcode = '55000';
    end if;

    if tg_op = 'INSERT'
       or old.status is distinct from 'resolved'
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

  return new;
end;
$projectflow$;

revoke all on function public.projectflow_validate_assurance_finding_resolution()
  from public;

drop trigger if exists projectflow_validate_assurance_finding_resolution
  on public.executive_governance_assurance_findings;

create trigger projectflow_validate_assurance_finding_resolution
before insert or update
on public.executive_governance_assurance_findings
for each row
execute function public.projectflow_validate_assurance_finding_resolution();

create or replace function public.add_executive_governance_assurance_finding_evidence(
  p_finding_id uuid,
  p_evidence_type text,
  p_title text,
  p_detail text,
  p_reference_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_finding public.executive_governance_assurance_findings%rowtype;
  v_evidence public.executive_governance_assurance_finding_evidence%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_evidence_type not in ('note','link','reference')
     or char_length(trim(coalesce(p_title, ''))) not between 1 and 240
     or char_length(trim(coalesce(p_detail, ''))) not between 1 and 12000
     or char_length(coalesce(p_reference_url, '')) > 2000
     or (
       nullif(trim(coalesce(p_reference_url, '')), '') is not null
       and trim(p_reference_url) !~* '^https?://'
     )
     or (
       p_evidence_type = 'link'
       and nullif(trim(coalesce(p_reference_url, '')), '') is null
     )
  then
    raise exception 'ASSURANCE_FINDING_EVIDENCE_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_finding
  from public.executive_governance_assurance_findings
  where id = p_finding_id
    and owner_user_id = auth.uid();

  if not found then
    raise exception 'ASSURANCE_FINDING_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  insert into public.executive_governance_assurance_finding_evidence (
    finding_id,
    archive_id,
    owner_user_id,
    evidence_type,
    title,
    detail,
    reference_url,
    created_by
  )
  values (
    v_finding.id,
    v_finding.archive_id,
    v_finding.owner_user_id,
    p_evidence_type,
    trim(p_title),
    trim(p_detail),
    nullif(trim(coalesce(p_reference_url, '')), ''),
    auth.uid()
  )
  returning * into v_evidence;

  return public.projectflow_governance_assurance_finding_evidence_json(v_evidence);
end;
$projectflow$;

revoke all on function public.add_executive_governance_assurance_finding_evidence(
  uuid, text, text, text, text
) from public;
grant execute on function public.add_executive_governance_assurance_finding_evidence(
  uuid, text, text, text, text
) to authenticated;

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

  if v_finding.verification_status = 'pending' then
    raise exception 'ASSURANCE_FINDING_VERIFICATION_ALREADY_PENDING'
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

revoke all on function public.request_executive_governance_assurance_finding_verification(
  uuid, bigint, uuid
) from public;
grant execute on function public.request_executive_governance_assurance_finding_verification(
  uuid, bigint, uuid
) to authenticated;

create or replace function public.act_on_executive_governance_assurance_finding_verification(
  p_finding_id uuid,
  p_expected_version bigint,
  p_decision text,
  p_effectiveness_note text
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
  v_recipient uuid;
  v_project_id text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_decision not in ('effective','partially_effective','ineffective')
     or char_length(trim(coalesce(p_effectiveness_note, ''))) not between 1 and 12000
  then
    raise exception 'ASSURANCE_FINDING_VERIFICATION_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_finding
  from public.executive_governance_assurance_findings
  where id = p_finding_id
    and verifier_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'ASSURANCE_FINDING_VERIFICATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if p_expected_version is null
     or v_finding.version <> p_expected_version
  then
    raise exception 'ASSURANCE_FINDING_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  if v_finding.verification_status <> 'pending'
     or v_finding.status <> 'resolved'
  then
    raise exception 'ASSURANCE_FINDING_VERIFICATION_NOT_PENDING'
      using errcode = '55000';
  end if;

  update public.executive_governance_assurance_findings
  set
    verification_status = p_decision,
    verified_at = now(),
    effectiveness_note = trim(p_effectiveness_note),
    status = case
      when p_decision = 'effective' then 'resolved'
      else 'in_progress'
    end,
    resolved_at = case
      when p_decision = 'effective' then resolved_at
      else null
    end,
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

  select * into v_archive
  from public.executive_governance_assurance_archives
  where id = v_finding.archive_id;

  select * into v_review
  from public.executive_governance_reviews
  where id = v_archive.review_id;

  for v_recipient in
    select distinct user_id
    from (
      select v_finding.owner_user_id as user_id
      union
      select v_finding.responsible_user_id as user_id
    ) q
    where user_id is not null
      and user_id <> auth.uid()
  loop
    v_project_id := public.projectflow_governance_notification_project(
      v_recipient,
      v_review.source_window_meeting_ids
    );

    if v_project_id is not null then
      perform public.enqueue_user_notification(
        v_recipient,
        v_project_id,
        'governance_alert',
        auth.uid(),
        null,
        null,
        null,
        null,
        jsonb_build_object(
          'event', 'assurance_finding_verification_completed',
          'archive_id', v_archive.id,
          'certificate_code', v_archive.certificate_code,
          'finding_id', v_finding.id,
          'title', v_finding.title,
          'decision', p_decision,
          'status', v_finding.status
        ),
        'governance-assurance-finding-verification:' ||
          v_finding.id::text || ':result:v' || v_finding.version::text ||
          ':' || v_recipient::text
      );
    end if;
  end loop;

  return public.projectflow_governance_assurance_finding_json(v_finding);
end;
$projectflow$;

revoke all on function public.act_on_executive_governance_assurance_finding_verification(
  uuid, bigint, text, text
) from public;
grant execute on function public.act_on_executive_governance_assurance_finding_verification(
  uuid, bigint, text, text
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
      'ineffective_active', 0
    ))
  );
end;
$projectflow$;

revoke all on function public.list_executive_governance_assurance_findings()
  from public;
grant execute on function public.list_executive_governance_assurance_findings()
  to authenticated;
