-- Phase 49: Governance Assurance Archive & Integrity Certificate.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

insert into public.projectflow_schema_versions (version, label)
values (34, 'assurance-archive-integrity-certificate')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.executive_governance_assurance_archives (
  id uuid primary key,
  certificate_code text not null unique,
  review_id uuid not null unique
    references public.executive_governance_reviews(id) on delete restrict,
  signoff_id uuid not null unique
    references public.executive_governance_review_signoffs(id) on delete restrict,
  distribution_id uuid not null unique
    references public.executive_governance_assurance_distributions(id)
    on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  review_version bigint not null,
  signoff_version bigint not null,
  distribution_version bigint not null,
  snapshot_schema_version integer not null default 1
    check (snapshot_schema_version = 1),
  snapshot jsonb not null
    check (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 text not null
    check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  archived_at timestamptz not null default now(),
  archived_by uuid not null references auth.users(id) on delete cascade
);

create index if not exists executive_governance_assurance_archives_owner_idx
  on public.executive_governance_assurance_archives(
    owner_user_id,
    archived_at desc
  );

alter table public.executive_governance_assurance_archives enable row level security;
revoke all on table public.executive_governance_assurance_archives
  from anon, authenticated;

create or replace function public.projectflow_block_governance_assurance_archive_update()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $projectflow$
begin
  raise exception 'ASSURANCE_ARCHIVE_IMMUTABLE'
    using errcode = '55000';
end;
$projectflow$;

revoke all on function public.projectflow_block_governance_assurance_archive_update()
  from public;

drop trigger if exists projectflow_block_governance_assurance_archive_update
  on public.executive_governance_assurance_archives;

create trigger projectflow_block_governance_assurance_archive_update
before update
on public.executive_governance_assurance_archives
for each row
execute function public.projectflow_block_governance_assurance_archive_update();

create or replace function public.projectflow_governance_archive_snapshot(
  p_review public.executive_governance_reviews,
  p_signoff public.executive_governance_review_signoffs,
  p_distribution public.executive_governance_assurance_distributions
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $projectflow$
  select jsonb_build_object(
    'archive_schema_version', 1,
    'review', public.projectflow_governance_review_json(p_review),
    'signoff', public.projectflow_governance_signoff_json(p_signoff),
    'distribution',
      public.projectflow_governance_distribution_json(p_distribution)
  );
$projectflow$;

revoke all on function public.projectflow_governance_archive_snapshot(
  public.executive_governance_reviews,
  public.executive_governance_review_signoffs,
  public.executive_governance_assurance_distributions
) from public;

create or replace function public.projectflow_governance_archive_json(
  p_row public.executive_governance_assurance_archives
)
returns jsonb
language sql
stable
as $projectflow$
  select jsonb_build_object(
    'id', p_row.id,
    'certificate_code', p_row.certificate_code,
    'review_id', p_row.review_id,
    'signoff_id', p_row.signoff_id,
    'distribution_id', p_row.distribution_id,
    'owner_user_id', p_row.owner_user_id,
    'review_version', p_row.review_version,
    'signoff_version', p_row.signoff_version,
    'distribution_version', p_row.distribution_version,
    'snapshot_schema_version', p_row.snapshot_schema_version,
    'snapshot', p_row.snapshot,
    'snapshot_sha256', p_row.snapshot_sha256,
    'archived_at', p_row.archived_at,
    'archived_by', p_row.archived_by
  );
$projectflow$;

revoke all on function public.projectflow_governance_archive_json(
  public.executive_governance_assurance_archives
) from public;

create or replace function public.projectflow_can_access_governance_assurance_archive(
  p_archive_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $projectflow$
  select exists (
    select 1
    from public.executive_governance_assurance_archives a
    where a.id = p_archive_id
      and (
        a.owner_user_id = p_user_id
        or exists (
          select 1
          from public.executive_governance_review_attestations att
          where att.signoff_id = a.signoff_id
            and att.assignee_user_id = p_user_id
        )
        or exists (
          select 1
          from public.executive_governance_assurance_distribution_recipients rr
          where rr.distribution_id = a.distribution_id
            and rr.recipient_user_id = p_user_id
        )
      )
  );
$projectflow$;

revoke all on function public.projectflow_can_access_governance_assurance_archive(
  uuid, uuid
) from public;

create or replace function public.projectflow_seal_governance_assurance_archive(
  p_distribution_id uuid,
  p_actor_user_id uuid,
  p_notify boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $projectflow$
declare
  v_distribution public.executive_governance_assurance_distributions%rowtype;
  v_review public.executive_governance_reviews%rowtype;
  v_signoff public.executive_governance_review_signoffs%rowtype;
  v_existing public.executive_governance_assurance_archives%rowtype;
  v_archive public.executive_governance_assurance_archives%rowtype;
  v_archive_id uuid;
  v_certificate_code text;
  v_snapshot jsonb;
  v_sha256 text;
  v_recipient_user_id uuid;
  v_project_id text;
begin
  if p_distribution_id is null or p_actor_user_id is null then
    raise exception 'ASSURANCE_ARCHIVE_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_distribution
  from public.executive_governance_assurance_distributions
  where id = p_distribution_id;

  if not found or v_distribution.status <> 'closed' then
    raise exception 'ASSURANCE_ARCHIVE_REQUIRES_CLOSED_DISTRIBUTION'
      using errcode = '55000';
  end if;

  select * into v_review
  from public.executive_governance_reviews
  where id = v_distribution.review_id;

  if not found or v_review.status <> 'finalized' then
    raise exception 'ASSURANCE_ARCHIVE_REQUIRES_FINALIZED_REVIEW'
      using errcode = '55000';
  end if;

  select * into v_signoff
  from public.executive_governance_review_signoffs
  where id = v_distribution.signoff_id
    and review_id = v_review.id;

  if not found or v_signoff.status <> 'completed' then
    raise exception 'ASSURANCE_ARCHIVE_REQUIRES_COMPLETED_SIGNOFF'
      using errcode = '55000';
  end if;

  select * into v_existing
  from public.executive_governance_assurance_archives
  where distribution_id = v_distribution.id;

  if found then
    return public.projectflow_governance_archive_json(v_existing);
  end if;

  v_snapshot := public.projectflow_governance_archive_snapshot(
    v_review,
    v_signoff,
    v_distribution
  );
  v_sha256 := encode(
    digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );
  v_archive_id := gen_random_uuid();
  v_certificate_code :=
    'PF-GOV-' ||
    to_char(current_date, 'YYYY') ||
    '-' ||
    upper(substr(replace(v_archive_id::text, '-', ''), 1, 12));

  insert into public.executive_governance_assurance_archives (
    id,
    certificate_code,
    review_id,
    signoff_id,
    distribution_id,
    owner_user_id,
    review_version,
    signoff_version,
    distribution_version,
    snapshot_schema_version,
    snapshot,
    snapshot_sha256,
    archived_by
  )
  values (
    v_archive_id,
    v_certificate_code,
    v_review.id,
    v_signoff.id,
    v_distribution.id,
    v_distribution.owner_user_id,
    v_review.version,
    v_signoff.version,
    v_distribution.version,
    1,
    v_snapshot,
    v_sha256,
    p_actor_user_id
  )
  returning * into v_archive;

  if p_notify then
    for v_recipient_user_id in
      select distinct user_id
      from (
        select att.assignee_user_id as user_id
        from public.executive_governance_review_attestations att
        where att.signoff_id = v_signoff.id
        union
        select rr.recipient_user_id as user_id
        from public.executive_governance_assurance_distribution_recipients rr
        where rr.distribution_id = v_distribution.id
      ) q
      where user_id <> v_distribution.owner_user_id
    loop
      v_project_id := public.projectflow_governance_notification_project(
        v_recipient_user_id,
        v_review.source_window_meeting_ids
      );

      if v_project_id is not null then
        perform public.enqueue_user_notification(
          v_recipient_user_id,
          v_project_id,
          'governance_alert',
          p_actor_user_id,
          null,
          null,
          null,
          null,
          jsonb_build_object(
            'event', 'assurance_archive_sealed',
            'review_id', v_review.id,
            'review_period', v_review.period_label,
            'archive_id', v_archive.id,
            'certificate_code', v_archive.certificate_code,
            'snapshot_sha256', v_archive.snapshot_sha256
          ),
          'governance-assurance-archive:' ||
            v_archive.id::text || ':' ||
            v_recipient_user_id::text
        );
      end if;
    end loop;
  end if;

  return public.projectflow_governance_archive_json(v_archive);
end;
$projectflow$;

revoke all on function public.projectflow_seal_governance_assurance_archive(
  uuid, uuid, boolean
) from public;

create or replace function public.projectflow_archive_on_distribution_close()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $projectflow$
begin
  if new.status = 'closed'
     and old.status is distinct from 'closed'
  then
    perform public.projectflow_seal_governance_assurance_archive(
      new.id,
      coalesce(auth.uid(), new.owner_user_id),
      true
    );
  end if;

  return new;
end;
$projectflow$;

revoke all on function public.projectflow_archive_on_distribution_close()
  from public;

drop trigger if exists projectflow_archive_on_distribution_close
  on public.executive_governance_assurance_distributions;

create trigger projectflow_archive_on_distribution_close
after update of status
on public.executive_governance_assurance_distributions
for each row
execute function public.projectflow_archive_on_distribution_close();

do $projectflow$
declare
  v_distribution_id uuid;
  v_owner_user_id uuid;
begin
  for v_distribution_id, v_owner_user_id in
    select d.id, d.owner_user_id
    from public.executive_governance_assurance_distributions d
    where d.status = 'closed'
      and not exists (
        select 1
        from public.executive_governance_assurance_archives a
        where a.distribution_id = d.id
      )
  loop
    perform public.projectflow_seal_governance_assurance_archive(
      v_distribution_id,
      v_owner_user_id,
      false
    );
  end loop;
end;
$projectflow$;

create or replace function public.list_executive_governance_assurance_archives()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $projectflow$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'archives',
    coalesce((
      select jsonb_agg(
        public.projectflow_governance_archive_json(a)
        order by a.archived_at desc
      )
      from public.executive_governance_assurance_archives a
      where
        a.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.executive_governance_review_attestations att
          where att.signoff_id = a.signoff_id
            and att.assignee_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.executive_governance_assurance_distribution_recipients rr
          where rr.distribution_id = a.distribution_id
            and rr.recipient_user_id = auth.uid()
        )
    ), '[]'::jsonb)
  );
end;
$projectflow$;

revoke all on function public.list_executive_governance_assurance_archives()
  from public;
grant execute on function public.list_executive_governance_assurance_archives()
  to authenticated;

create or replace function public.verify_executive_governance_assurance_archive(
  p_archive_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $projectflow$
declare
  v_archive public.executive_governance_assurance_archives%rowtype;
  v_review public.executive_governance_reviews%rowtype;
  v_signoff public.executive_governance_review_signoffs%rowtype;
  v_distribution public.executive_governance_assurance_distributions%rowtype;
  v_stored_sha256 text;
  v_live_snapshot jsonb;
  v_live_sha256 text;
  v_versions_match boolean;
  v_lifecycle_match boolean;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not public.projectflow_can_access_governance_assurance_archive(
    p_archive_id,
    auth.uid()
  ) then
    raise exception 'ASSURANCE_ARCHIVE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select * into v_archive
  from public.executive_governance_assurance_archives
  where id = p_archive_id;

  v_stored_sha256 := encode(
    digest(convert_to(v_archive.snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select * into v_review
  from public.executive_governance_reviews
  where id = v_archive.review_id;

  select * into v_signoff
  from public.executive_governance_review_signoffs
  where id = v_archive.signoff_id;

  select * into v_distribution
  from public.executive_governance_assurance_distributions
  where id = v_archive.distribution_id;

  if v_review.id is null
     or v_signoff.id is null
     or v_distribution.id is null
  then
    v_live_snapshot := null;
    v_live_sha256 := null;
    v_versions_match := false;
    v_lifecycle_match := false;
  else
    v_live_snapshot := public.projectflow_governance_archive_snapshot(
      v_review,
      v_signoff,
      v_distribution
    );
    v_live_sha256 := encode(
      digest(convert_to(v_live_snapshot::text, 'UTF8'), 'sha256'),
      'hex'
    );
    v_versions_match :=
      v_archive.review_version = v_review.version
      and v_archive.signoff_version = v_signoff.version
      and v_archive.distribution_version = v_distribution.version;
    v_lifecycle_match :=
      v_review.status = 'finalized'
      and v_signoff.status = 'completed'
      and v_distribution.status = 'closed';
  end if;

  return jsonb_build_object(
    'archive', public.projectflow_governance_archive_json(v_archive),
    'stored_integrity', v_stored_sha256 = v_archive.snapshot_sha256,
    'source_integrity',
      v_live_sha256 is not null
      and v_live_sha256 = v_archive.snapshot_sha256,
    'version_match', v_versions_match,
    'lifecycle_match', v_lifecycle_match,
    'verified_at', now(),
    'expected_sha256', v_archive.snapshot_sha256,
    'stored_computed_sha256', v_stored_sha256,
    'live_sha256', v_live_sha256
  );
end;
$projectflow$;

revoke all on function public.verify_executive_governance_assurance_archive(uuid)
  from public;
grant execute on function public.verify_executive_governance_assurance_archive(uuid)
  to authenticated;
