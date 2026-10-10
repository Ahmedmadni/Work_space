-- Phase 54: Finding Taxonomy, Root Cause & Deterministic Recurrence Detection.

insert into public.projectflow_schema_versions (version, label)
values (38, 'assurance-finding-taxonomy-root-cause-recurrence')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

alter table public.executive_governance_assurance_findings
  add column if not exists taxonomy_category text,
  add column if not exists root_cause_category text,
  add column if not exists root_cause_note text,
  add column if not exists control_reference text,
  add column if not exists recurrence_key text;

alter table public.executive_governance_assurance_findings
  drop constraint if exists executive_governance_assurance_finding_taxonomy_check,
  drop constraint if exists executive_governance_assurance_finding_root_cause_check,
  drop constraint if exists executive_governance_assurance_finding_taxonomy_lengths_check,
  drop constraint if exists executive_governance_assurance_finding_recurrence_requirements_check;

alter table public.executive_governance_assurance_findings
  add constraint executive_governance_assurance_finding_taxonomy_check
  check (
    taxonomy_category is null
    or taxonomy_category in (
      'control_design',
      'control_execution',
      'process',
      'data_quality',
      'access_security',
      'compliance',
      'documentation',
      'third_party',
      'governance',
      'other'
    )
  ),
  add constraint executive_governance_assurance_finding_root_cause_check
  check (
    root_cause_category is null
    or root_cause_category in (
      'people',
      'process',
      'system',
      'data',
      'governance',
      'third_party',
      'external',
      'unknown',
      'other'
    )
  ),
  add constraint executive_governance_assurance_finding_taxonomy_lengths_check
  check (
    char_length(coalesce(root_cause_note, '')) <= 12000
    and char_length(coalesce(control_reference, '')) <= 240
    and char_length(coalesce(recurrence_key, '')) <= 160
  ),
  add constraint executive_governance_assurance_finding_recurrence_requirements_check
  check (
    recurrence_key is null
    or (
      nullif(trim(recurrence_key), '') is not null
      and taxonomy_category is not null
      and root_cause_category is not null
    )
  );

create index if not exists executive_governance_assurance_findings_taxonomy_idx
  on public.executive_governance_assurance_findings(
    taxonomy_category,
    root_cause_category,
    status
  );

create index if not exists executive_governance_assurance_findings_recurrence_idx
  on public.executive_governance_assurance_findings(
    recurrence_key,
    archive_id
  )
  where recurrence_key is not null;

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
    'taxonomy_category', p_row.taxonomy_category,
    'root_cause_category', p_row.root_cause_category,
    'root_cause_note', p_row.root_cause_note,
    'control_reference', p_row.control_reference,
    'recurrence_key', p_row.recurrence_key,
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

drop function if exists public.save_executive_governance_assurance_finding(
  uuid, bigint, uuid, text, uuid, text, text, text, text, uuid, date, date, text, text
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
  p_resolution_note text,
  p_taxonomy_category text,
  p_root_cause_category text,
  p_root_cause_note text,
  p_control_reference text,
  p_recurrence_key text
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
  v_recurrence_key text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_recurrence_key :=
    nullif(lower(trim(coalesce(p_recurrence_key, ''))), '');

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
     or char_length(coalesce(p_root_cause_note, '')) > 12000
     or char_length(coalesce(p_control_reference, '')) > 240
     or char_length(coalesce(v_recurrence_key, '')) > 160
     or (
       p_taxonomy_category is not null
       and p_taxonomy_category not in (
         'control_design',
         'control_execution',
         'process',
         'data_quality',
         'access_security',
         'compliance',
         'documentation',
         'third_party',
         'governance',
         'other'
       )
     )
     or (
       p_root_cause_category is not null
       and p_root_cause_category not in (
         'people',
         'process',
         'system',
         'data',
         'governance',
         'third_party',
         'external',
         'unknown',
         'other'
       )
     )
     or (
       v_recurrence_key is not null
       and (
         p_taxonomy_category is null
         or p_root_cause_category is null
       )
     )
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
      taxonomy_category,
      root_cause_category,
      root_cause_note,
      control_reference,
      recurrence_key,
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
      p_taxonomy_category,
      p_root_cause_category,
      nullif(trim(coalesce(p_root_cause_note, '')), ''),
      nullif(trim(coalesce(p_control_reference, '')), ''),
      v_recurrence_key,
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
      taxonomy_category = p_taxonomy_category,
      root_cause_category = p_root_cause_category,
      root_cause_note =
        nullif(trim(coalesce(p_root_cause_note, '')), ''),
      control_reference =
        nullif(trim(coalesce(p_control_reference, '')), ''),
      recurrence_key = v_recurrence_key,
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
  uuid, bigint, uuid, text, uuid, text, text, text, text, uuid, date, date, text, text,
  text, text, text, text, text
) from public;
grant execute on function public.save_executive_governance_assurance_finding(
  uuid, bigint, uuid, text, uuid, text, text, text, text, uuid, date, date, text, text,
  text, text, text, text, text
) to authenticated;

create or replace function public.list_executive_governance_assurance_recurrence()
returns jsonb
language sql
stable
security definer
set search_path = public
as $projectflow$
  with visible as (
    select
      f.*,
      a.certificate_code,
      a.archived_at,
      a.snapshot->'review'->>'period_label' as period_label
    from public.executive_governance_assurance_findings f
    join public.executive_governance_assurance_archives a
      on a.id = f.archive_id
    where auth.uid() is not null
      and f.recurrence_key is not null
      and public.projectflow_can_access_governance_assurance_archive(
        a.id,
        auth.uid()
      )
  ),
  grouped as (
    select
      recurrence_key,
      count(*)::int as finding_count,
      count(distinct archive_id)::int as archive_count,
      count(*) filter (
        where status in ('open','in_progress')
      )::int as active_count,
      count(*) filter (
        where status in ('open','in_progress')
          and severity in ('critical','high')
      )::int as critical_high_active,
      min(created_at) as first_seen_at,
      max(created_at) as last_seen_at,
      jsonb_agg(
        jsonb_build_object(
          'finding_id', id,
          'archive_id', archive_id,
          'certificate_code', certificate_code,
          'period_label', period_label,
          'title', title,
          'severity', severity,
          'status', status,
          'taxonomy_category', taxonomy_category,
          'root_cause_category', root_cause_category,
          'control_reference', control_reference,
          'created_at', created_at
        )
        order by created_at desc
      ) as occurrences,
      count(distinct taxonomy_category)::int as taxonomy_variant_count,
      count(distinct root_cause_category)::int as root_cause_variant_count
    from visible
    group by recurrence_key
    having count(distinct archive_id) >= 2
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'recurrence_key', recurrence_key,
        'finding_count', finding_count,
        'archive_count', archive_count,
        'active_count', active_count,
        'critical_high_active', critical_high_active,
        'first_seen_at', first_seen_at,
        'last_seen_at', last_seen_at,
        'taxonomy_consistent', taxonomy_variant_count <= 1,
        'root_cause_consistent', root_cause_variant_count <= 1,
        'occurrences', occurrences
      )
      order by
        critical_high_active desc,
        active_count desc,
        archive_count desc,
        last_seen_at desc
    ),
    '[]'::jsonb
  )
  from grouped;
$projectflow$;

revoke all on function public.list_executive_governance_assurance_recurrence()
  from public;
grant execute on function public.list_executive_governance_assurance_recurrence()
  to authenticated;
