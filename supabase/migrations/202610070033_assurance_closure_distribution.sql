-- Phase 48: Governance Assurance Closure & Distribution Register.

insert into public.projectflow_schema_versions (version, label)
values (33, 'assurance-closure-distribution-register')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.executive_governance_assurance_distributions (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique
    references public.executive_governance_reviews(id) on delete cascade,
  signoff_id uuid not null
    references public.executive_governance_review_signoffs(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft','distributed','closed')),
  distribution_note text,
  version bigint not null default 1,
  distributed_at timestamptz,
  closed_at timestamptz,
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.executive_governance_assurance_distribution_recipients (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid not null
    references public.executive_governance_assurance_distributions(id)
    on delete cascade,
  review_id uuid not null
    references public.executive_governance_reviews(id)
    on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_name_snapshot text not null,
  recipient_email_snapshot text,
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'acknowledged',
        'acknowledged_with_note'
      )
    ),
  acknowledgement_note text,
  acknowledged_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(distribution_id, recipient_user_id)
);

create table if not exists public.executive_governance_assurance_distribution_history (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid not null
    references public.executive_governance_assurance_distributions(id)
    on delete cascade,
  review_id uuid not null
    references public.executive_governance_reviews(id)
    on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  version bigint not null,
  event text not null
    check (
      event in (
        'plan_created',
        'plan_updated',
        'distributed',
        'recipient_acknowledged',
        'recipient_acknowledged_with_note',
        'closed'
      )
    ),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null
    check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique(distribution_id, version)
);

create index if not exists executive_governance_assurance_distributions_owner_idx
  on public.executive_governance_assurance_distributions(
    owner_user_id,
    status,
    updated_at desc
  );

create index if not exists executive_governance_assurance_distribution_recipient_idx
  on public.executive_governance_assurance_distribution_recipients(
    recipient_user_id,
    status,
    updated_at desc
  );

create index if not exists executive_governance_assurance_distribution_history_idx
  on public.executive_governance_assurance_distribution_history(
    owner_user_id,
    review_id,
    created_at desc
  );

alter table public.executive_governance_assurance_distributions enable row level security;
alter table public.executive_governance_assurance_distribution_recipients enable row level security;
alter table public.executive_governance_assurance_distribution_history enable row level security;

revoke all on table public.executive_governance_assurance_distributions
  from anon, authenticated;
revoke all on table public.executive_governance_assurance_distribution_recipients
  from anon, authenticated;
revoke all on table public.executive_governance_assurance_distribution_history
  from anon, authenticated;

create or replace function public.projectflow_governance_distribution_recipient_json(
  p_row public.executive_governance_assurance_distribution_recipients
)
returns jsonb
language sql
stable
as $projectflow$
  select jsonb_build_object(
    'id', p_row.id,
    'distribution_id', p_row.distribution_id,
    'review_id', p_row.review_id,
    'owner_user_id', p_row.owner_user_id,
    'recipient_user_id', p_row.recipient_user_id,
    'recipient_name_snapshot', p_row.recipient_name_snapshot,
    'recipient_email_snapshot', p_row.recipient_email_snapshot,
    'status', p_row.status,
    'acknowledgement_note', p_row.acknowledgement_note,
    'acknowledged_at', p_row.acknowledged_at,
    'version', p_row.version,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$projectflow$;

revoke all on function public.projectflow_governance_distribution_recipient_json(
  public.executive_governance_assurance_distribution_recipients
) from public;

create or replace function public.projectflow_governance_distribution_json(
  p_row public.executive_governance_assurance_distributions
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
    'signoff_id', p_row.signoff_id,
    'owner_user_id', p_row.owner_user_id,
    'status', p_row.status,
    'distribution_note', p_row.distribution_note,
    'version', p_row.version,
    'distributed_at', p_row.distributed_at,
    'closed_at', p_row.closed_at,
    'created_by', p_row.created_by,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at,
    'recipients', coalesce((
      select jsonb_agg(
        public.projectflow_governance_distribution_recipient_json(r)
        order by r.recipient_name_snapshot, r.recipient_user_id
      )
      from public.executive_governance_assurance_distribution_recipients r
      where r.distribution_id = p_row.id
    ), '[]'::jsonb)
  );
$projectflow$;

revoke all on function public.projectflow_governance_distribution_json(
  public.executive_governance_assurance_distributions
) from public;

create or replace function public.save_executive_governance_assurance_distribution_plan(
  p_review_id uuid,
  p_expected_distribution_version bigint,
  p_distribution_note text,
  p_recipients jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_review public.executive_governance_reviews%rowtype;
  v_signoff public.executive_governance_review_signoffs%rowtype;
  v_distribution public.executive_governance_assurance_distributions%rowtype;
  v_recipient jsonb;
  v_user_id uuid;
  v_auth_name text;
  v_auth_email text;
  v_name text;
  v_email text;
  v_count integer := 0;
  v_distinct_users integer;
  v_event text;
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
    raise exception 'DISTRIBUTION_REQUIRES_FINALIZED_REVIEW'
      using errcode = '55000';
  end if;

  select * into v_signoff
  from public.executive_governance_review_signoffs
  where review_id = p_review_id
    and owner_user_id = auth.uid()
    and status = 'completed';

  if not found then
    raise exception 'DISTRIBUTION_REQUIRES_COMPLETED_SIGNOFF'
      using errcode = '55000';
  end if;

  if char_length(coalesce(p_distribution_note, '')) > 8000
     or jsonb_typeof(coalesce(p_recipients, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_recipients) not between 1 and 100
  then
    raise exception 'DISTRIBUTION_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select count(distinct (value->>'recipient_user_id'))
  into v_distinct_users
  from jsonb_array_elements(p_recipients);

  if v_distinct_users <> jsonb_array_length(p_recipients) then
    raise exception 'DISTRIBUTION_DUPLICATE_RECIPIENT'
      using errcode = '22023';
  end if;

  select * into v_distribution
  from public.executive_governance_assurance_distributions
  where review_id = p_review_id
  for update;

  if found then
    if p_expected_distribution_version is null
       or v_distribution.version <> p_expected_distribution_version
    then
      raise exception 'DISTRIBUTION_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    if v_distribution.status <> 'draft' then
      raise exception 'DISTRIBUTION_RECIPIENTS_LOCKED'
        using errcode = '55000';
    end if;

    delete from public.executive_governance_assurance_distribution_recipients
    where distribution_id = v_distribution.id;

    v_event := 'plan_updated';

    update public.executive_governance_assurance_distributions
    set
      distribution_note =
        nullif(trim(coalesce(p_distribution_note, '')), ''),
      signoff_id = v_signoff.id,
      version = version + 1,
      updated_at = now()
    where id = v_distribution.id
    returning * into v_distribution;
  else
    if p_expected_distribution_version is not null then
      raise exception 'DISTRIBUTION_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    v_event := 'plan_created';

    insert into public.executive_governance_assurance_distributions (
      review_id,
      signoff_id,
      owner_user_id,
      status,
      distribution_note,
      created_by
    )
    values (
      v_review.id,
      v_signoff.id,
      auth.uid(),
      'draft',
      nullif(trim(coalesce(p_distribution_note, '')), ''),
      auth.uid()
    )
    returning * into v_distribution;
  end if;

  for v_recipient in
    select value from jsonb_array_elements(p_recipients)
  loop
    if char_length(trim(coalesce(v_recipient->>'recipient_name', '')))
         not between 1 and 180
       or char_length(coalesce(v_recipient->>'recipient_email', '')) > 320
    then
      raise exception 'DISTRIBUTION_INVALID_RECIPIENT'
        using errcode = '22023';
    end if;

    begin
      v_user_id := (v_recipient->>'recipient_user_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'DISTRIBUTION_INVALID_RECIPIENT'
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
      raise exception 'DISTRIBUTION_RECIPIENT_NOT_FOUND'
        using errcode = '22023';
    end if;

    v_name := coalesce(
      v_auth_name,
      trim(v_recipient->>'recipient_name')
    );
    v_email := coalesce(
      v_auth_email,
      nullif(trim(coalesce(v_recipient->>'recipient_email', '')), '')
    );

    insert into public.executive_governance_assurance_distribution_recipients (
      distribution_id,
      review_id,
      owner_user_id,
      recipient_user_id,
      recipient_name_snapshot,
      recipient_email_snapshot
    )
    values (
      v_distribution.id,
      v_review.id,
      auth.uid(),
      v_user_id,
      v_name,
      v_email
    );

    v_count := v_count + 1;
  end loop;

  if v_count <> jsonb_array_length(p_recipients) then
    raise exception 'DISTRIBUTION_RECIPIENT_COUNT_MISMATCH'
      using errcode = '22023';
  end if;

  insert into public.executive_governance_assurance_distribution_history (
    distribution_id,
    review_id,
    owner_user_id,
    version,
    event,
    actor_user_id,
    snapshot
  )
  values (
    v_distribution.id,
    v_review.id,
    v_distribution.owner_user_id,
    v_distribution.version,
    v_event,
    auth.uid(),
    public.projectflow_governance_distribution_json(v_distribution)
  );

  return public.projectflow_governance_distribution_json(v_distribution);
end;
$projectflow$;

revoke all on function public.save_executive_governance_assurance_distribution_plan(
  uuid, bigint, text, jsonb
) from public;
grant execute on function public.save_executive_governance_assurance_distribution_plan(
  uuid, bigint, text, jsonb
) to authenticated;

create or replace function public.distribute_executive_governance_assurance_pack(
  p_distribution_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_distribution public.executive_governance_assurance_distributions%rowtype;
  v_review public.executive_governance_reviews%rowtype;
  v_recipient public.executive_governance_assurance_distribution_recipients%rowtype;
  v_project_id text;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_distribution
  from public.executive_governance_assurance_distributions
  where id = p_distribution_id
    and owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'DISTRIBUTION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_distribution.status <> 'draft' then
    raise exception 'DISTRIBUTION_NOT_DRAFT'
      using errcode = '55000';
  end if;

  if p_expected_version is null
     or v_distribution.version <> p_expected_version
  then
    raise exception 'DISTRIBUTION_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  if not exists (
    select 1
    from public.executive_governance_review_signoffs s
    where s.id = v_distribution.signoff_id
      and s.review_id = v_distribution.review_id
      and s.status = 'completed'
  ) then
    raise exception 'DISTRIBUTION_REQUIRES_COMPLETED_SIGNOFF'
      using errcode = '55000';
  end if;

  select count(*)
  into v_count
  from public.executive_governance_assurance_distribution_recipients
  where distribution_id = v_distribution.id;

  if v_count < 1 then
    raise exception 'DISTRIBUTION_REQUIRES_RECIPIENT'
      using errcode = '22023';
  end if;

  update public.executive_governance_assurance_distributions
  set
    status = 'distributed',
    distributed_at = now(),
    version = version + 1,
    updated_at = now()
  where id = v_distribution.id
  returning * into v_distribution;

  select * into v_review
  from public.executive_governance_reviews
  where id = v_distribution.review_id;

  for v_recipient in
    select *
    from public.executive_governance_assurance_distribution_recipients
    where distribution_id = v_distribution.id
  loop
    v_project_id := public.projectflow_governance_notification_project(
      v_recipient.recipient_user_id,
      v_review.source_window_meeting_ids
    );

    if v_project_id is not null
       and v_recipient.recipient_user_id <> auth.uid()
    then
      perform public.enqueue_user_notification(
        v_recipient.recipient_user_id,
        v_project_id,
        'governance_alert',
        auth.uid(),
        null,
        null,
        null,
        null,
        jsonb_build_object(
          'event', 'assurance_distribution_assigned',
          'review_id', v_review.id,
          'review_period', v_review.period_label,
          'review_date', v_review.review_date,
          'distribution_id', v_distribution.id
        ),
        'governance-assurance-distribution:' ||
          v_distribution.id::text || ':' ||
          v_recipient.recipient_user_id::text || ':v' ||
          v_distribution.version::text
      );
    end if;
  end loop;

  insert into public.executive_governance_assurance_distribution_history (
    distribution_id,
    review_id,
    owner_user_id,
    version,
    event,
    actor_user_id,
    snapshot
  )
  values (
    v_distribution.id,
    v_distribution.review_id,
    v_distribution.owner_user_id,
    v_distribution.version,
    'distributed',
    auth.uid(),
    public.projectflow_governance_distribution_json(v_distribution)
  );

  return public.projectflow_governance_distribution_json(v_distribution);
end;
$projectflow$;

revoke all on function public.distribute_executive_governance_assurance_pack(
  uuid, bigint
) from public;
grant execute on function public.distribute_executive_governance_assurance_pack(
  uuid, bigint
) to authenticated;

create or replace function public.acknowledge_executive_governance_assurance_distribution(
  p_recipient_id uuid,
  p_expected_version bigint,
  p_decision text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_recipient public.executive_governance_assurance_distribution_recipients%rowtype;
  v_distribution public.executive_governance_assurance_distributions%rowtype;
  v_review public.executive_governance_reviews%rowtype;
  v_project_id text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_decision not in ('acknowledged','acknowledged_with_note')
     or char_length(coalesce(p_note, '')) > 8000
     or (
       p_decision = 'acknowledged_with_note'
       and nullif(trim(coalesce(p_note, '')), '') is null
     )
  then
    raise exception 'DISTRIBUTION_ACK_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_recipient
  from public.executive_governance_assurance_distribution_recipients
  where id = p_recipient_id
    and recipient_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'DISTRIBUTION_RECIPIENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_recipient.status <> 'pending' then
    raise exception 'DISTRIBUTION_ALREADY_ACKNOWLEDGED'
      using errcode = '55000';
  end if;

  if p_expected_version is null
     or v_recipient.version <> p_expected_version
  then
    raise exception 'DISTRIBUTION_RECIPIENT_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  select * into v_distribution
  from public.executive_governance_assurance_distributions
  where id = v_recipient.distribution_id
  for update;

  if v_distribution.status <> 'distributed' then
    raise exception 'DISTRIBUTION_NOT_OPEN_FOR_ACK'
      using errcode = '55000';
  end if;

  update public.executive_governance_assurance_distribution_recipients
  set
    status = p_decision,
    acknowledgement_note =
      nullif(trim(coalesce(p_note, '')), ''),
    acknowledged_at = now(),
    version = version + 1,
    updated_at = now()
  where id = v_recipient.id
  returning * into v_recipient;

  update public.executive_governance_assurance_distributions
  set
    version = version + 1,
    updated_at = now()
  where id = v_distribution.id
  returning * into v_distribution;

  select * into v_review
  from public.executive_governance_reviews
  where id = v_distribution.review_id;

  v_project_id := public.projectflow_governance_notification_project(
    v_distribution.owner_user_id,
    v_review.source_window_meeting_ids
  );

  if v_project_id is not null
     and v_distribution.owner_user_id <> auth.uid()
  then
    perform public.enqueue_user_notification(
      v_distribution.owner_user_id,
      v_project_id,
      'governance_alert',
      auth.uid(),
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'event', 'assurance_distribution_acknowledged',
        'review_id', v_review.id,
        'review_period', v_review.period_label,
        'distribution_id', v_distribution.id,
        'recipient_id', v_recipient.id,
        'decision', p_decision
      ),
      'governance-assurance-distribution-ack:' ||
        v_recipient.id::text || ':v' || v_recipient.version::text
    );
  end if;

  insert into public.executive_governance_assurance_distribution_history (
    distribution_id,
    review_id,
    owner_user_id,
    version,
    event,
    actor_user_id,
    snapshot
  )
  values (
    v_distribution.id,
    v_distribution.review_id,
    v_distribution.owner_user_id,
    v_distribution.version,
    case
      when p_decision = 'acknowledged_with_note'
        then 'recipient_acknowledged_with_note'
      else 'recipient_acknowledged'
    end,
    auth.uid(),
    public.projectflow_governance_distribution_json(v_distribution)
  );

  return public.projectflow_governance_distribution_json(v_distribution);
end;
$projectflow$;

revoke all on function public.acknowledge_executive_governance_assurance_distribution(
  uuid, bigint, text, text
) from public;
grant execute on function public.acknowledge_executive_governance_assurance_distribution(
  uuid, bigint, text, text
) to authenticated;

create or replace function public.close_executive_governance_assurance_distribution(
  p_distribution_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_distribution public.executive_governance_assurance_distributions%rowtype;
  v_pending integer;
  v_review public.executive_governance_reviews%rowtype;
  v_recipient public.executive_governance_assurance_distribution_recipients%rowtype;
  v_project_id text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_distribution
  from public.executive_governance_assurance_distributions
  where id = p_distribution_id
    and owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'DISTRIBUTION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_distribution.status <> 'distributed' then
    raise exception 'DISTRIBUTION_NOT_DISTRIBUTED'
      using errcode = '55000';
  end if;

  if p_expected_version is null
     or v_distribution.version <> p_expected_version
  then
    raise exception 'DISTRIBUTION_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  select count(*)
  into v_pending
  from public.executive_governance_assurance_distribution_recipients
  where distribution_id = v_distribution.id
    and status = 'pending';

  if v_pending > 0 then
    raise exception 'DISTRIBUTION_PENDING_ACKNOWLEDGEMENTS'
      using errcode = '55000';
  end if;

  update public.executive_governance_assurance_distributions
  set
    status = 'closed',
    closed_at = now(),
    version = version + 1,
    updated_at = now()
  where id = v_distribution.id
  returning * into v_distribution;

  select * into v_review
  from public.executive_governance_reviews
  where id = v_distribution.review_id;

  for v_recipient in
    select *
    from public.executive_governance_assurance_distribution_recipients
    where distribution_id = v_distribution.id
  loop
    v_project_id := public.projectflow_governance_notification_project(
      v_recipient.recipient_user_id,
      v_review.source_window_meeting_ids
    );

    if v_project_id is not null
       and v_recipient.recipient_user_id <> auth.uid()
    then
      perform public.enqueue_user_notification(
        v_recipient.recipient_user_id,
        v_project_id,
        'governance_alert',
        auth.uid(),
        null,
        null,
        null,
        null,
        jsonb_build_object(
          'event', 'assurance_distribution_closed',
          'review_id', v_review.id,
          'review_period', v_review.period_label,
          'distribution_id', v_distribution.id
        ),
        'governance-assurance-distribution-closed:' ||
          v_distribution.id::text || ':' ||
          v_recipient.recipient_user_id::text || ':v' ||
          v_distribution.version::text
      );
    end if;
  end loop;

  insert into public.executive_governance_assurance_distribution_history (
    distribution_id,
    review_id,
    owner_user_id,
    version,
    event,
    actor_user_id,
    snapshot
  )
  values (
    v_distribution.id,
    v_distribution.review_id,
    v_distribution.owner_user_id,
    v_distribution.version,
    'closed',
    auth.uid(),
    public.projectflow_governance_distribution_json(v_distribution)
  );

  return public.projectflow_governance_distribution_json(v_distribution);
end;
$projectflow$;

revoke all on function public.close_executive_governance_assurance_distribution(
  uuid, bigint
) from public;
grant execute on function public.close_executive_governance_assurance_distribution(
  uuid, bigint
) to authenticated;

create or replace function public.list_executive_governance_assurance_distributions()
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
          'distribution',
            public.projectflow_governance_distribution_json(d),
          'review', public.projectflow_governance_review_json(r),
          'signoff', public.projectflow_governance_signoff_json(s)
        )
        order by r.review_date desc, d.created_at desc
      )
      from public.executive_governance_assurance_distributions d
      join public.executive_governance_reviews r on r.id = d.review_id
      join public.executive_governance_review_signoffs s
        on s.id = d.signoff_id
      where d.owner_user_id = auth.uid()
    ), '[]'::jsonb),
    'inbox', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'recipient',
            public.projectflow_governance_distribution_recipient_json(rr),
          'distribution',
            public.projectflow_governance_distribution_json(d),
          'review', public.projectflow_governance_review_json(r),
          'signoff', public.projectflow_governance_signoff_json(s),
          'can_acknowledge', (
            rr.status = 'pending'
            and d.status = 'distributed'
          )
        )
        order by
          case when rr.status = 'pending' then 0 else 1 end,
          r.review_date desc,
          rr.updated_at desc
      )
      from public.executive_governance_assurance_distribution_recipients rr
      join public.executive_governance_assurance_distributions d
        on d.id = rr.distribution_id
      join public.executive_governance_reviews r
        on r.id = rr.review_id
      join public.executive_governance_review_signoffs s
        on s.id = d.signoff_id
      where rr.recipient_user_id = auth.uid()
    ), '[]'::jsonb)
  );
end;
$projectflow$;

revoke all on function public.list_executive_governance_assurance_distributions()
  from public;
grant execute on function public.list_executive_governance_assurance_distributions()
  to authenticated;
