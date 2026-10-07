-- Phase 47: Governance Assurance Attestation & Sign-off.

insert into public.projectflow_schema_versions (version, label)
values (32, 'assurance-attestation-signoff')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.executive_governance_review_signoffs (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique
    references public.executive_governance_reviews(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open'
    check (status in ('open','completed','declined')),
  version bigint not null default 1,
  completed_at timestamptz,
  declined_at timestamptz,
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.executive_governance_review_attestations (
  id uuid primary key default gen_random_uuid(),
  signoff_id uuid not null
    references public.executive_governance_review_signoffs(id)
    on delete cascade,
  review_id uuid not null
    references public.executive_governance_reviews(id)
    on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null
    check (role in ('prepared_by','reviewed_by','approved_by')),
  sequence_no integer not null
    check (sequence_no between 1 and 3),
  assignee_user_id uuid not null references auth.users(id) on delete cascade,
  assignee_name_snapshot text not null,
  assignee_email_snapshot text,
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'attested',
        'attested_with_reservation',
        'declined'
      )
    ),
  statement text,
  reservation text,
  acted_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(signoff_id, role),
  unique(signoff_id, sequence_no)
);

create index if not exists executive_governance_review_signoffs_owner_idx
  on public.executive_governance_review_signoffs(
    owner_user_id,
    status,
    updated_at desc
  );

create index if not exists executive_governance_review_attestations_assignee_idx
  on public.executive_governance_review_attestations(
    assignee_user_id,
    status,
    updated_at desc
  );

alter table public.executive_governance_review_signoffs enable row level security;
alter table public.executive_governance_review_attestations enable row level security;

revoke all on table public.executive_governance_review_signoffs
  from anon, authenticated;
revoke all on table public.executive_governance_review_attestations
  from anon, authenticated;

create or replace function public.projectflow_governance_attestation_json(
  p_row public.executive_governance_review_attestations
)
returns jsonb
language sql
stable
as $projectflow$
  select jsonb_build_object(
    'id', p_row.id,
    'signoff_id', p_row.signoff_id,
    'review_id', p_row.review_id,
    'owner_user_id', p_row.owner_user_id,
    'role', p_row.role,
    'sequence_no', p_row.sequence_no,
    'assignee_user_id', p_row.assignee_user_id,
    'assignee_name_snapshot', p_row.assignee_name_snapshot,
    'assignee_email_snapshot', p_row.assignee_email_snapshot,
    'status', p_row.status,
    'statement', p_row.statement,
    'reservation', p_row.reservation,
    'acted_at', p_row.acted_at,
    'version', p_row.version,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$projectflow$;

revoke all on function public.projectflow_governance_attestation_json(
  public.executive_governance_review_attestations
) from public;

create or replace function public.projectflow_governance_signoff_json(
  p_row public.executive_governance_review_signoffs
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $projectflow$
  select jsonb_build_object(
    'id', p_row.id,
    'review_id', p_row.review_id,
    'owner_user_id', p_row.owner_user_id,
    'status', p_row.status,
    'version', p_row.version,
    'completed_at', p_row.completed_at,
    'declined_at', p_row.declined_at,
    'created_by', p_row.created_by,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at,
    'attestations', coalesce((
      select jsonb_agg(
        public.projectflow_governance_attestation_json(a)
        order by a.sequence_no
      )
      from public.executive_governance_review_attestations a
      where a.signoff_id = p_row.id
    ), '[]'::jsonb)
  );
$projectflow$;

revoke all on function public.projectflow_governance_signoff_json(
  public.executive_governance_review_signoffs
) from public;

create or replace function public.save_executive_governance_review_signoff_plan(
  p_review_id uuid,
  p_expected_signoff_version bigint,
  p_assignments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_review public.executive_governance_reviews%rowtype;
  v_signoff public.executive_governance_review_signoffs%rowtype;
  v_assignment jsonb;
  v_role text;
  v_sequence integer;
  v_user_id uuid;
  v_name text;
  v_email text;
  v_auth_name text;
  v_auth_email text;
  v_count integer := 0;
  v_distinct_users integer;
  v_any_acted boolean;
  v_project_id text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_review
  from public.executive_governance_reviews
  where id = p_review_id
    and owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'GOVERNANCE_REVIEW_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_review.status <> 'finalized' then
    raise exception 'SIGNOFF_REQUIRES_FINALIZED_REVIEW'
      using errcode = '55000';
  end if;

  if jsonb_typeof(coalesce(p_assignments, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_assignments) <> 3
  then
    raise exception 'SIGNOFF_REQUIRES_THREE_ASSIGNMENTS'
      using errcode = '22023';
  end if;

  select count(distinct value->>'assignee_user_id')
  into v_distinct_users
  from jsonb_array_elements(p_assignments);

  if v_distinct_users <> 3 then
    raise exception 'SIGNOFF_REQUIRES_DISTINCT_USERS'
      using errcode = '22023';
  end if;

  select * into v_signoff
  from public.executive_governance_review_signoffs
  where review_id = p_review_id
  for update;

  if found then
    if p_expected_signoff_version is null
       or v_signoff.version <> p_expected_signoff_version
    then
      raise exception 'SIGNOFF_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    select exists (
      select 1
      from public.executive_governance_review_attestations a
      where a.signoff_id = v_signoff.id
        and a.status <> 'pending'
    )
    into v_any_acted;

    if v_any_acted or v_signoff.status <> 'open' then
      raise exception 'SIGNOFF_ASSIGNMENTS_LOCKED'
        using errcode = '55000';
    end if;

    delete from public.executive_governance_review_attestations
    where signoff_id = v_signoff.id;

    update public.executive_governance_review_signoffs
    set
      version = version + 1,
      updated_at = now()
    where id = v_signoff.id
    returning * into v_signoff;
  else
    if p_expected_signoff_version is not null then
      raise exception 'SIGNOFF_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    insert into public.executive_governance_review_signoffs (
      review_id,
      owner_user_id,
      status,
      created_by
    )
    values (
      v_review.id,
      auth.uid(),
      'open',
      auth.uid()
    )
    returning * into v_signoff;
  end if;

  for v_assignment in
    select value
    from jsonb_array_elements(p_assignments)
  loop
    v_role := coalesce(v_assignment->>'role', '');
    v_sequence := case v_role
      when 'prepared_by' then 1
      when 'reviewed_by' then 2
      when 'approved_by' then 3
      else 0
    end;

    if v_sequence = 0
       or char_length(trim(coalesce(v_assignment->>'assignee_name', '')))
          not between 1 and 180
       or char_length(coalesce(v_assignment->>'assignee_email', '')) > 320
    then
      raise exception 'SIGNOFF_INVALID_ASSIGNMENT'
        using errcode = '22023';
    end if;

    begin
      v_user_id := (v_assignment->>'assignee_user_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'SIGNOFF_INVALID_ASSIGNEE'
        using errcode = '22023';
    end;

    select
      coalesce(
        nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(u.raw_user_meta_data->>'name'), ''),
        nullif(trim(u.email), '')
      ),
      nullif(trim(u.email), '')
    into v_auth_name, v_auth_email
    from auth.users u
    where u.id = v_user_id;

    if not found then
      raise exception 'SIGNOFF_ASSIGNEE_NOT_FOUND'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.executive_governance_review_attestations a
      where a.signoff_id = v_signoff.id
        and a.role = v_role
    )
    then
      raise exception 'SIGNOFF_DUPLICATE_ROLE'
        using errcode = '22023';
    end if;

    v_name := coalesce(
      v_auth_name,
      trim(v_assignment->>'assignee_name')
    );
    v_email := coalesce(
      v_auth_email,
      nullif(trim(coalesce(v_assignment->>'assignee_email', '')), '')
    );

    insert into public.executive_governance_review_attestations (
      signoff_id,
      review_id,
      owner_user_id,
      role,
      sequence_no,
      assignee_user_id,
      assignee_name_snapshot,
      assignee_email_snapshot
    )
    values (
      v_signoff.id,
      v_review.id,
      auth.uid(),
      v_role,
      v_sequence,
      v_user_id,
      v_name,
      v_email
    );

    v_count := v_count + 1;

    v_project_id := public.projectflow_governance_notification_project(
      v_user_id,
      v_review.source_window_meeting_ids
    );

    if v_project_id is not null and v_user_id <> auth.uid() then
      perform public.enqueue_user_notification(
        v_user_id,
        v_project_id,
        'governance_alert',
        auth.uid(),
        null,
        null,
        null,
        null,
        jsonb_build_object(
          'event', 'assurance_signoff_assigned',
          'review_id', v_review.id,
          'review_period', v_review.period_label,
          'review_date', v_review.review_date,
          'signoff_id', v_signoff.id,
          'role', v_role,
          'sequence_no', v_sequence
        ),
        'governance-assurance-signoff:' || v_signoff.id::text || ':' ||
          v_role || ':' || v_user_id::text || ':v' || v_signoff.version::text
      );
    end if;
  end loop;

  if v_count <> 3 then
    raise exception 'SIGNOFF_REQUIRES_THREE_ASSIGNMENTS'
      using errcode = '22023';
  end if;

  if (
    select count(distinct a.role)
    from public.executive_governance_review_attestations a
    where a.signoff_id = v_signoff.id
  ) <> 3
  then
    raise exception 'SIGNOFF_REQUIRES_ALL_ROLES'
      using errcode = '22023';
  end if;

  return public.projectflow_governance_signoff_json(v_signoff);
end;
$projectflow$;

revoke all on function public.save_executive_governance_review_signoff_plan(
  uuid, bigint, jsonb
) from public;
grant execute on function public.save_executive_governance_review_signoff_plan(
  uuid, bigint, jsonb
) to authenticated;

create or replace function public.act_on_executive_governance_attestation(
  p_attestation_id uuid,
  p_expected_version bigint,
  p_decision text,
  p_statement text,
  p_reservation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_attestation public.executive_governance_review_attestations%rowtype;
  v_signoff public.executive_governance_review_signoffs%rowtype;
  v_prior_pending integer;
  v_project_id text;
  v_review public.executive_governance_reviews%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_decision not in (
    'attested',
    'attested_with_reservation',
    'declined'
  )
     or char_length(trim(coalesce(p_statement, ''))) not between 1 and 8000
     or char_length(coalesce(p_reservation, '')) > 8000
     or (
       p_decision = 'attested_with_reservation'
       and nullif(trim(coalesce(p_reservation, '')), '') is null
     )
  then
    raise exception 'ATTESTATION_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_attestation
  from public.executive_governance_review_attestations
  where id = p_attestation_id
    and assignee_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'ATTESTATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_attestation.status <> 'pending' then
    raise exception 'ATTESTATION_ALREADY_ACTED'
      using errcode = '55000';
  end if;

  if p_expected_version is null
     or v_attestation.version <> p_expected_version
  then
    raise exception 'ATTESTATION_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  select * into v_signoff
  from public.executive_governance_review_signoffs
  where id = v_attestation.signoff_id
  for update;

  if v_signoff.status <> 'open' then
    raise exception 'SIGNOFF_NOT_OPEN'
      using errcode = '55000';
  end if;

  select count(*)
  into v_prior_pending
  from public.executive_governance_review_attestations a
  where a.signoff_id = v_signoff.id
    and a.sequence_no < v_attestation.sequence_no
    and a.status not in ('attested','attested_with_reservation');

  if v_prior_pending > 0 then
    raise exception 'ATTESTATION_PREVIOUS_STEP_REQUIRED'
      using errcode = '55000';
  end if;

  update public.executive_governance_review_attestations
  set
    status = p_decision,
    statement = trim(p_statement),
    reservation = nullif(trim(coalesce(p_reservation, '')), ''),
    acted_at = now(),
    version = version + 1,
    updated_at = now()
  where id = v_attestation.id
  returning * into v_attestation;

  if p_decision = 'declined' then
    update public.executive_governance_review_signoffs
    set
      status = 'declined',
      declined_at = now(),
      version = version + 1,
      updated_at = now()
    where id = v_signoff.id
    returning * into v_signoff;
  elsif v_attestation.sequence_no = 3 then
    update public.executive_governance_review_signoffs
    set
      status = 'completed',
      completed_at = now(),
      version = version + 1,
      updated_at = now()
    where id = v_signoff.id
    returning * into v_signoff;
  else
    update public.executive_governance_review_signoffs
    set
      version = version + 1,
      updated_at = now()
    where id = v_signoff.id
    returning * into v_signoff;
  end if;

  select * into v_review
  from public.executive_governance_reviews
  where id = v_attestation.review_id;

  v_project_id := public.projectflow_governance_notification_project(
    v_attestation.owner_user_id,
    v_review.source_window_meeting_ids
  );

  if v_project_id is not null
     and v_attestation.owner_user_id <> auth.uid()
  then
    perform public.enqueue_user_notification(
      v_attestation.owner_user_id,
      v_project_id,
      'governance_alert',
      auth.uid(),
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'event', case
          when p_decision = 'declined' then 'assurance_signoff_declined'
          when v_signoff.status = 'completed' then 'assurance_signoff_completed'
          else 'assurance_signoff_step_completed'
        end,
        'review_id', v_review.id,
        'review_period', v_review.period_label,
        'signoff_id', v_signoff.id,
        'role', v_attestation.role,
        'decision', p_decision
      ),
      'governance-assurance-signoff-result:' || v_attestation.id::text ||
        ':v' || v_attestation.version::text
    );
  end if;

  return public.projectflow_governance_signoff_json(v_signoff);
end;
$projectflow$;

revoke all on function public.act_on_executive_governance_attestation(
  uuid, bigint, text, text, text
) from public;
grant execute on function public.act_on_executive_governance_attestation(
  uuid, bigint, text, text, text
) to authenticated;

create or replace function public.list_executive_governance_review_signoffs()
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
    'owned', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'signoff', public.projectflow_governance_signoff_json(s),
          'review', public.projectflow_governance_review_json(r)
        )
        order by r.review_date desc, s.created_at desc
      )
      from public.executive_governance_review_signoffs s
      join public.executive_governance_reviews r on r.id = s.review_id
      where s.owner_user_id = auth.uid()
    ), '[]'::jsonb),
    'inbox', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'attestation',
            public.projectflow_governance_attestation_json(a),
          'signoff', public.projectflow_governance_signoff_json(s),
          'review', public.projectflow_governance_review_json(r),
          'can_act', (
            a.status = 'pending'
            and s.status = 'open'
            and not exists (
              select 1
              from public.executive_governance_review_attestations prior
              where prior.signoff_id = s.id
                and prior.sequence_no < a.sequence_no
                and prior.status not in (
                  'attested',
                  'attested_with_reservation'
                )
            )
          )
        )
        order by
          case when a.status = 'pending' then 0 else 1 end,
          r.review_date desc,
          a.sequence_no
      )
      from public.executive_governance_review_attestations a
      join public.executive_governance_review_signoffs s
        on s.id = a.signoff_id
      join public.executive_governance_reviews r
        on r.id = a.review_id
      where a.assignee_user_id = auth.uid()
    ), '[]'::jsonb)
  );
end;
$projectflow$;

revoke all on function public.list_executive_governance_review_signoffs()
  from public;
grant execute on function public.list_executive_governance_review_signoffs()
  to authenticated;
