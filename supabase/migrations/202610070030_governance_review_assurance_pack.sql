-- Phase 44: Governance Review & Assurance Pack.

insert into public.projectflow_schema_versions (version, label)
values (30, 'governance-review-assurance-pack')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.executive_governance_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  period_label text not null,
  review_date date not null,
  status text not null default 'draft'
    check (status in ('draft','finalized')),
  assurance_conclusion text not null
    check (
      assurance_conclusion in (
        'satisfactory',
        'needs_improvement',
        'unsatisfactory',
        'insufficient_evidence'
      )
    ),
  summary text not null,
  management_response text,
  target_version bigint not null,
  source_window_meeting_ids jsonb not null
    check (
      jsonb_typeof(source_window_meeting_ids) = 'array'
      and jsonb_array_length(source_window_meeting_ids) between 1 and 3
    ),
  target_assessments_snapshot jsonb not null
    check (jsonb_typeof(target_assessments_snapshot) = 'array'),
  operating_rhythm_snapshot jsonb not null
    check (jsonb_typeof(operating_rhythm_snapshot) = 'object'),
  exceptions_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(exceptions_snapshot) = 'array'),
  evidence_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_snapshot) = 'array'),
  source_generated_at timestamptz not null,
  finalized_at timestamptz,
  version bigint not null default 1,
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists executive_governance_reviews_owner_date_idx
  on public.executive_governance_reviews(
    owner_user_id,
    review_date desc,
    created_at desc
  );

create table if not exists public.executive_governance_review_history (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null
    references public.executive_governance_reviews(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  version bigint not null,
  snapshot jsonb not null
    check (jsonb_typeof(snapshot) = 'object'),
  changed_by uuid not null references auth.users(id) on delete cascade,
  changed_at timestamptz not null default now(),
  unique(review_id, version)
);

create index if not exists executive_governance_review_history_idx
  on public.executive_governance_review_history(
    owner_user_id,
    review_id,
    version desc
  );

alter table public.executive_governance_reviews enable row level security;
alter table public.executive_governance_review_history enable row level security;

revoke all on table public.executive_governance_reviews
  from anon, authenticated;
revoke all on table public.executive_governance_review_history
  from anon, authenticated;

create or replace function public.projectflow_governance_review_json(
  p_row public.executive_governance_reviews
)
returns jsonb
language sql
stable
as $projectflow$
  select jsonb_build_object(
    'id', p_row.id,
    'owner_user_id', p_row.owner_user_id,
    'period_label', p_row.period_label,
    'review_date', p_row.review_date,
    'status', p_row.status,
    'assurance_conclusion', p_row.assurance_conclusion,
    'summary', p_row.summary,
    'management_response', p_row.management_response,
    'target_version', p_row.target_version,
    'source_window_meeting_ids', p_row.source_window_meeting_ids,
    'target_assessments_snapshot', p_row.target_assessments_snapshot,
    'operating_rhythm_snapshot', p_row.operating_rhythm_snapshot,
    'exceptions_snapshot', p_row.exceptions_snapshot,
    'evidence_snapshot', p_row.evidence_snapshot,
    'source_generated_at', p_row.source_generated_at,
    'finalized_at', p_row.finalized_at,
    'version', p_row.version,
    'created_by', p_row.created_by,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$projectflow$;

revoke all on function public.projectflow_governance_review_json(
  public.executive_governance_reviews
) from public;

create or replace function public.projectflow_validate_governance_review_source(
  p_expected_target_version bigint,
  p_source_window_meeting_ids jsonb,
  p_target_assessments_snapshot jsonb,
  p_operating_rhythm_snapshot jsonb,
  p_exceptions_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_targets public.executive_governance_targets%rowtype;
  v_meeting_text text;
  v_meeting_id uuid;
  v_row jsonb;
  v_exception public.executive_governance_exceptions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_targets
  from public.executive_governance_targets
  where owner_user_id = auth.uid();

  if not found then
    raise exception 'GOVERNANCE_TARGETS_NOT_CONFIGURED'
      using errcode = '22023';
  end if;

  if p_expected_target_version is null
     or v_targets.version <> p_expected_target_version
  then
    raise exception 'EXECUTIVE_GOVERNANCE_TARGETS_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  if jsonb_typeof(coalesce(p_source_window_meeting_ids, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_source_window_meeting_ids) not between 1 and 3
     or jsonb_typeof(coalesce(p_target_assessments_snapshot, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_target_assessments_snapshot) > 8
     or jsonb_typeof(coalesce(p_operating_rhythm_snapshot, 'null'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_exceptions_snapshot, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_exceptions_snapshot) > 100
  then
    raise exception 'GOVERNANCE_REVIEW_INVALID_SOURCE'
      using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_array_elements_text(p_source_window_meeting_ids)
  ) <> (
    select count(distinct value)
    from jsonb_array_elements_text(p_source_window_meeting_ids)
  )
  then
    raise exception 'GOVERNANCE_REVIEW_DUPLICATE_MEETINGS'
      using errcode = '22023';
  end if;

  for v_meeting_text in
    select value
    from jsonb_array_elements_text(p_source_window_meeting_ids)
  loop
    begin
      v_meeting_id := v_meeting_text::uuid;
    exception when invalid_text_representation then
      raise exception 'GOVERNANCE_REVIEW_INVALID_MEETING_ID'
        using errcode = '22023';
    end;

    if not exists (
      select 1
      from public.executive_strategy_meetings m
      where m.id = v_meeting_id
        and m.status = 'completed'
        and public.projectflow_can_view_executive_meeting(m.id)
    )
    then
      raise exception 'GOVERNANCE_REVIEW_MEETING_DENIED'
        using errcode = '42501';
    end if;
  end loop;

  for v_row in
    select value
    from jsonb_array_elements(p_target_assessments_snapshot)
  loop
    if coalesce(v_row->>'key', '') not in (
      'decision_resolution',
      'deferred_rate',
      'action_completion',
      'overdue_open',
      'unowned_open',
      'on_time_completion',
      'median_completion_days',
      'repeated_deferrals'
    )
    or coalesce(v_row->>'status', '') not in (
      'met',
      'not_met',
      'no_target',
      'insufficient_data'
    )
    or coalesce(v_row->>'operator', '') not in ('gte','lte')
    or coalesce(v_row->>'unit', '') not in ('%','days','count')
    then
      raise exception 'GOVERNANCE_REVIEW_INVALID_ASSESSMENT'
        using errcode = '22023';
    end if;
  end loop;

  if coalesce(p_operating_rhythm_snapshot->>'status', '') not in (
    'on_schedule',
    'due_soon',
    'overdue',
    'no_target',
    'no_meetings'
  )
  then
    raise exception 'GOVERNANCE_REVIEW_INVALID_RHYTHM'
      using errcode = '22023';
  end if;

  for v_row in
    select value
    from jsonb_array_elements(p_exceptions_snapshot)
  loop
    begin
      select * into v_exception
      from public.executive_governance_exceptions e
      where e.id = nullif(v_row->>'id', '')::uuid
        and e.owner_user_id = auth.uid();
    exception when invalid_text_representation then
      raise exception 'GOVERNANCE_REVIEW_INVALID_EXCEPTION_ID'
        using errcode = '22023';
    end;

    if not found
       or v_exception.version <> coalesce(nullif(v_row->>'version', '')::bigint, -1)
    then
      raise exception 'GOVERNANCE_REVIEW_EXCEPTION_VERSION_MISMATCH'
        using errcode = '40001';
    end if;
  end loop;
end;
$projectflow$;

revoke all on function public.projectflow_validate_governance_review_source(
  bigint, jsonb, jsonb, jsonb, jsonb
) from public;

create or replace function public.create_executive_governance_review(
  p_period_label text,
  p_review_date date,
  p_assurance_conclusion text,
  p_summary text,
  p_management_response text,
  p_expected_target_version bigint,
  p_source_window_meeting_ids jsonb,
  p_target_assessments_snapshot jsonb,
  p_operating_rhythm_snapshot jsonb,
  p_exceptions_snapshot jsonb,
  p_source_generated_at timestamptz,
  p_evidence_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_review public.executive_governance_reviews%rowtype;
begin
  if char_length(trim(coalesce(p_period_label, ''))) not between 1 and 180
     or p_review_date is null
     or p_assurance_conclusion not in (
       'satisfactory',
       'needs_improvement',
       'unsatisfactory',
       'insufficient_evidence'
     )
     or char_length(trim(coalesce(p_summary, ''))) not between 1 and 12000
     or char_length(coalesce(p_management_response, '')) > 12000
     or p_source_generated_at is null
     or jsonb_typeof(coalesce(p_evidence_snapshot, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_evidence_snapshot) > 50
  then
    raise exception 'GOVERNANCE_REVIEW_INVALID_INPUT'
      using errcode = '22023';
  end if;

  perform public.projectflow_validate_governance_review_source(
    p_expected_target_version,
    p_source_window_meeting_ids,
    p_target_assessments_snapshot,
    p_operating_rhythm_snapshot,
    p_exceptions_snapshot
  );

  insert into public.executive_governance_reviews (
    owner_user_id,
    period_label,
    review_date,
    status,
    assurance_conclusion,
    summary,
    management_response,
    target_version,
    source_window_meeting_ids,
    target_assessments_snapshot,
    operating_rhythm_snapshot,
    exceptions_snapshot,
    evidence_snapshot,
    source_generated_at,
    created_by
  )
  values (
    auth.uid(),
    trim(p_period_label),
    p_review_date,
    'draft',
    p_assurance_conclusion,
    trim(p_summary),
    nullif(trim(coalesce(p_management_response, '')), ''),
    p_expected_target_version,
    p_source_window_meeting_ids,
    p_target_assessments_snapshot,
    p_operating_rhythm_snapshot,
    p_exceptions_snapshot,
    p_evidence_snapshot,
    p_source_generated_at,
    auth.uid()
  )
  returning * into v_review;

  insert into public.executive_governance_review_history (
    review_id,
    owner_user_id,
    version,
    snapshot,
    changed_by
  )
  values (
    v_review.id,
    auth.uid(),
    v_review.version,
    public.projectflow_governance_review_json(v_review),
    auth.uid()
  );

  return public.projectflow_governance_review_json(v_review);
end;
$projectflow$;

revoke all on function public.create_executive_governance_review(
  text, date, text, text, text, bigint, jsonb, jsonb, jsonb, jsonb,
  timestamptz, jsonb
) from public;
grant execute on function public.create_executive_governance_review(
  text, date, text, text, text, bigint, jsonb, jsonb, jsonb, jsonb,
  timestamptz, jsonb
) to authenticated;

create or replace function public.update_executive_governance_review(
  p_review_id uuid,
  p_expected_version bigint,
  p_period_label text,
  p_review_date date,
  p_assurance_conclusion text,
  p_summary text,
  p_management_response text,
  p_evidence_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_old public.executive_governance_reviews%rowtype;
  v_new public.executive_governance_reviews%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_period_label, ''))) not between 1 and 180
     or p_review_date is null
     or p_assurance_conclusion not in (
       'satisfactory',
       'needs_improvement',
       'unsatisfactory',
       'insufficient_evidence'
     )
     or char_length(trim(coalesce(p_summary, ''))) not between 1 and 12000
     or char_length(coalesce(p_management_response, '')) > 12000
     or jsonb_typeof(coalesce(p_evidence_snapshot, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_evidence_snapshot) > 50
  then
    raise exception 'GOVERNANCE_REVIEW_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_old
  from public.executive_governance_reviews
  where id = p_review_id
    and owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'GOVERNANCE_REVIEW_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_old.status <> 'draft' then
    raise exception 'GOVERNANCE_REVIEW_LOCKED'
      using errcode = '55000';
  end if;

  if p_expected_version is null or v_old.version <> p_expected_version then
    raise exception 'GOVERNANCE_REVIEW_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  update public.executive_governance_reviews
  set
    period_label = trim(p_period_label),
    review_date = p_review_date,
    assurance_conclusion = p_assurance_conclusion,
    summary = trim(p_summary),
    management_response =
      nullif(trim(coalesce(p_management_response, '')), ''),
    evidence_snapshot = p_evidence_snapshot,
    version = version + 1,
    updated_at = now()
  where id = p_review_id
  returning * into v_new;

  insert into public.executive_governance_review_history (
    review_id,
    owner_user_id,
    version,
    snapshot,
    changed_by
  )
  values (
    v_new.id,
    auth.uid(),
    v_new.version,
    public.projectflow_governance_review_json(v_new),
    auth.uid()
  );

  return public.projectflow_governance_review_json(v_new);
end;
$projectflow$;

revoke all on function public.update_executive_governance_review(
  uuid, bigint, text, date, text, text, text, jsonb
) from public;
grant execute on function public.update_executive_governance_review(
  uuid, bigint, text, date, text, text, text, jsonb
) to authenticated;

create or replace function public.finalize_executive_governance_review(
  p_review_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_old public.executive_governance_reviews%rowtype;
  v_new public.executive_governance_reviews%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_old
  from public.executive_governance_reviews
  where id = p_review_id
    and owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'GOVERNANCE_REVIEW_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_old.status <> 'draft' then
    raise exception 'GOVERNANCE_REVIEW_LOCKED'
      using errcode = '55000';
  end if;

  if p_expected_version is null or v_old.version <> p_expected_version then
    raise exception 'GOVERNANCE_REVIEW_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  if char_length(trim(v_old.summary)) < 1
     or v_old.assurance_conclusion is null
  then
    raise exception 'GOVERNANCE_REVIEW_NOT_READY'
      using errcode = '22023';
  end if;

  update public.executive_governance_reviews
  set
    status = 'finalized',
    finalized_at = now(),
    version = version + 1,
    updated_at = now()
  where id = p_review_id
  returning * into v_new;

  insert into public.executive_governance_review_history (
    review_id,
    owner_user_id,
    version,
    snapshot,
    changed_by
  )
  values (
    v_new.id,
    auth.uid(),
    v_new.version,
    public.projectflow_governance_review_json(v_new),
    auth.uid()
  );

  return public.projectflow_governance_review_json(v_new);
end;
$projectflow$;

revoke all on function public.finalize_executive_governance_review(
  uuid, bigint
) from public;
grant execute on function public.finalize_executive_governance_review(
  uuid, bigint
) to authenticated;

create or replace function public.list_executive_governance_reviews()
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

  return jsonb_build_object(
    'reviews',
    coalesce((
      select jsonb_agg(
        public.projectflow_governance_review_json(r)
        order by r.review_date desc, r.created_at desc
      )
      from public.executive_governance_reviews r
      where r.owner_user_id = auth.uid()
    ), '[]'::jsonb),
    'history',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'review_id', h.review_id,
          'owner_user_id', h.owner_user_id,
          'version', h.version,
          'snapshot', h.snapshot,
          'changed_by', h.changed_by,
          'changed_at', h.changed_at
        )
        order by h.changed_at desc
      )
      from (
        select *
        from public.executive_governance_review_history
        where owner_user_id = auth.uid()
        order by changed_at desc
        limit 100
      ) h
    ), '[]'::jsonb)
  );
end;
$projectflow$;

revoke all on function public.list_executive_governance_reviews()
  from public;
grant execute on function public.list_executive_governance_reviews()
  to authenticated;
