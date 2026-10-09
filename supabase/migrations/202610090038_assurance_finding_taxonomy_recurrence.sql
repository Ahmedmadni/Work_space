-- Phase 54: Assurance Finding Taxonomy, Root Cause & Recurrence.

insert into public.projectflow_schema_versions (version, label)
values (38, 'assurance-finding-taxonomy-recurrence')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

alter table public.executive_governance_assurance_findings
  add column if not exists finding_category text,
  add column if not exists root_cause_category text,
  add column if not exists root_cause_detail text,
  add column if not exists recurrence_parent_finding_id uuid
    references public.executive_governance_assurance_findings(id)
    on delete restrict,
  add column if not exists recurrence_root_finding_id uuid
    references public.executive_governance_assurance_findings(id)
    on delete restrict,
  add column if not exists recurrence_sequence integer not null default 1,
  add column if not exists recurrence_reason text,
  add column if not exists taxonomy_version integer not null default 1,
  add column if not exists classified_by uuid
    references auth.users(id) on delete set null,
  add column if not exists classified_at timestamptz;

alter table public.executive_governance_assurance_findings
  drop constraint if exists executive_governance_assurance_finding_category_check;
alter table public.executive_governance_assurance_findings
  add constraint executive_governance_assurance_finding_category_check
  check (
    finding_category is null
    or finding_category in (
      'control_design',
      'control_operation',
      'process_gap',
      'data_quality',
      'compliance',
      'governance',
      'security_access',
      'documentation',
      'execution',
      'third_party',
      'other'
    )
  );

alter table public.executive_governance_assurance_findings
  drop constraint if exists executive_governance_assurance_root_cause_check;
alter table public.executive_governance_assurance_findings
  add constraint executive_governance_assurance_root_cause_check
  check (
    root_cause_category is null
    or root_cause_category in (
      'people',
      'process',
      'technology',
      'data',
      'governance',
      'third_party',
      'external',
      'unknown',
      'other'
    )
  );

alter table public.executive_governance_assurance_findings
  drop constraint if exists executive_governance_assurance_taxonomy_detail_check;
alter table public.executive_governance_assurance_findings
  add constraint executive_governance_assurance_taxonomy_detail_check
  check (
    char_length(coalesce(root_cause_detail, '')) <= 4000
    and char_length(coalesce(recurrence_reason, '')) <= 4000
    and (
      root_cause_category is null
      or finding_category is not null
    )
    and (
      nullif(trim(coalesce(root_cause_detail, '')), '') is null
      or root_cause_category is not null
    )
  );

alter table public.executive_governance_assurance_findings
  drop constraint if exists executive_governance_assurance_recurrence_check;
alter table public.executive_governance_assurance_findings
  add constraint executive_governance_assurance_recurrence_check
  check (
    (
      recurrence_parent_finding_id is null
      and recurrence_root_finding_id is null
      and recurrence_sequence = 1
      and nullif(trim(coalesce(recurrence_reason, '')), '') is null
    )
    or
    (
      recurrence_parent_finding_id is not null
      and recurrence_root_finding_id is not null
      and recurrence_parent_finding_id is distinct from id
      and recurrence_root_finding_id is distinct from id
      and recurrence_sequence >= 2
      and nullif(trim(coalesce(recurrence_reason, '')), '') is not null
    )
  );

alter table public.executive_governance_assurance_findings
  drop constraint if exists executive_governance_assurance_taxonomy_version_check;
alter table public.executive_governance_assurance_findings
  add constraint executive_governance_assurance_taxonomy_version_check
  check (taxonomy_version = 1);

create index if not exists executive_governance_assurance_findings_taxonomy_idx
  on public.executive_governance_assurance_findings(
    owner_user_id,
    finding_category,
    root_cause_category
  );

create index if not exists executive_governance_assurance_findings_recurrence_idx
  on public.executive_governance_assurance_findings(
    owner_user_id,
    recurrence_root_finding_id,
    recurrence_sequence
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
    'verification_status', p_row.verification_status,
    'verifier_user_id', p_row.verifier_user_id,
    'verifier_name_snapshot', p_row.verifier_name_snapshot,
    'verifier_email_snapshot', p_row.verifier_email_snapshot,
    'verification_requested_at', p_row.verification_requested_at,
    'verified_at', p_row.verified_at,
    'effectiveness_note', p_row.effectiveness_note,
    'finding_category', p_row.finding_category,
    'root_cause_category', p_row.root_cause_category,
    'root_cause_detail', p_row.root_cause_detail,
    'recurrence_parent_finding_id', p_row.recurrence_parent_finding_id,
    'recurrence_root_finding_id', p_row.recurrence_root_finding_id,
    'recurrence_sequence', p_row.recurrence_sequence,
    'recurrence_reason', p_row.recurrence_reason,
    'taxonomy_version', p_row.taxonomy_version,
    'classified_by', p_row.classified_by,
    'classified_at', p_row.classified_at,
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

create or replace function public.classify_executive_governance_assurance_finding(
  p_finding_id uuid,
  p_expected_version bigint,
  p_finding_category text,
  p_root_cause_category text,
  p_root_cause_detail text,
  p_recurrence_parent_finding_id uuid,
  p_recurrence_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_finding public.executive_governance_assurance_findings%rowtype;
  v_parent public.executive_governance_assurance_findings%rowtype;
  v_archive public.executive_governance_assurance_archives%rowtype;
  v_parent_archive public.executive_governance_assurance_archives%rowtype;
  v_root_id uuid;
  v_sequence integer := 1;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if (
    p_finding_category is not null
    and p_finding_category not in (
      'control_design',
      'control_operation',
      'process_gap',
      'data_quality',
      'compliance',
      'governance',
      'security_access',
      'documentation',
      'execution',
      'third_party',
      'other'
    )
  )
  or (
    p_root_cause_category is not null
    and p_root_cause_category not in (
      'people',
      'process',
      'technology',
      'data',
      'governance',
      'third_party',
      'external',
      'unknown',
      'other'
    )
  )
  or (
    p_root_cause_category is not null
    and p_finding_category is null
  )
  or char_length(coalesce(p_root_cause_detail, '')) > 4000
  or (
    nullif(trim(coalesce(p_root_cause_detail, '')), '') is not null
    and p_root_cause_category is null
  )
  or char_length(coalesce(p_recurrence_reason, '')) > 4000
  or (
    p_recurrence_parent_finding_id is null
    and nullif(trim(coalesce(p_recurrence_reason, '')), '') is not null
  )
  or (
    p_recurrence_parent_finding_id is not null
    and nullif(trim(coalesce(p_recurrence_reason, '')), '') is null
  )
  then
    raise exception 'ASSURANCE_FINDING_TAXONOMY_INVALID_INPUT'
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

  if p_expected_version is null
     or v_finding.version <> p_expected_version
  then
    raise exception 'ASSURANCE_FINDING_VERSION_MISMATCH'
      using errcode = '40001';
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

  if p_recurrence_parent_finding_id is not null then
    select * into v_parent
    from public.executive_governance_assurance_findings
    where id = p_recurrence_parent_finding_id
      and owner_user_id = auth.uid();

    if not found or v_parent.id = v_finding.id then
      raise exception 'ASSURANCE_FINDING_RECURRENCE_PARENT_INVALID'
        using errcode = '22023';
    end if;

    if v_parent.archive_id = v_finding.archive_id then
      raise exception 'ASSURANCE_FINDING_RECURRENCE_REQUIRES_PRIOR_ARCHIVE'
        using errcode = '22023';
    end if;

    select * into v_parent_archive
    from public.executive_governance_assurance_archives
    where id = v_parent.archive_id;

    if not found
       or v_parent_archive.archived_at >= v_archive.archived_at
    then
      raise exception 'ASSURANCE_FINDING_RECURRENCE_REQUIRES_PRIOR_ARCHIVE'
        using errcode = '22023';
    end if;

    v_root_id := coalesce(
      v_parent.recurrence_root_finding_id,
      v_parent.id
    );
    v_sequence := greatest(2, v_parent.recurrence_sequence + 1);
  else
    v_root_id := null;
    v_sequence := 1;
  end if;

  update public.executive_governance_assurance_findings
  set
    finding_category = p_finding_category,
    root_cause_category = p_root_cause_category,
    root_cause_detail =
      nullif(trim(coalesce(p_root_cause_detail, '')), ''),
    recurrence_parent_finding_id = p_recurrence_parent_finding_id,
    recurrence_root_finding_id = v_root_id,
    recurrence_sequence = v_sequence,
    recurrence_reason = case
      when p_recurrence_parent_finding_id is null then null
      else nullif(trim(coalesce(p_recurrence_reason, '')), '')
    end,
    taxonomy_version = 1,
    classified_by = auth.uid(),
    classified_at = now(),
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

  return public.projectflow_governance_assurance_finding_json(v_finding);
end;
$projectflow$;

revoke all on function public.classify_executive_governance_assurance_finding(
  uuid, bigint, text, text, text, uuid, text
) from public;
grant execute on function public.classify_executive_governance_assurance_finding(
  uuid, bigint, text, text, text, uuid, text
) to authenticated;
