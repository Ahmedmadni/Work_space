-- Phase 35: Executive Strategy Calendar & Review Cadence.

insert into public.projectflow_schema_versions (version, label)
values (24, 'executive-strategy-calendar-review-cadence')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.objective_strategy_cadence (
  objective_id uuid primary key references public.portfolio_objectives(id) on delete cascade,
  review_interval_days integer not null check (review_interval_days between 1 and 366),
  kr_update_interval_days integer not null check (kr_update_interval_days between 1 and 366),
  reminder_days_before integer not null default 7 check (reminder_days_before between 0 and 60),
  review_anchor_date date not null,
  kr_anchor_date date not null,
  last_kr_checkin_date date,
  is_enabled boolean not null default true,
  version bigint not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recovery_checkpoint_cadence (
  plan_id uuid primary key references public.objective_recovery_plans(id) on delete cascade,
  checkpoint_interval_days integer not null check (checkpoint_interval_days between 1 and 180),
  reminder_days_before integer not null default 3 check (reminder_days_before between 0 and 60),
  anchor_date date not null,
  is_enabled boolean not null default true,
  version bigint not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recovery_plan_checkpoints (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.objective_recovery_plans(id) on delete cascade,
  checkpoint_date date not null default current_date,
  assessment text not null
    check (assessment in ('on_track','at_risk','off_track','recovered')),
  note text,
  objective_progress_snapshot numeric,
  daily_progress_rate_snapshot numeric,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists objective_strategy_cadence_enabled_idx
  on public.objective_strategy_cadence(is_enabled, review_anchor_date, kr_anchor_date);
create index if not exists recovery_checkpoint_cadence_enabled_idx
  on public.recovery_checkpoint_cadence(is_enabled, anchor_date);
create index if not exists recovery_plan_checkpoints_plan_date_idx
  on public.recovery_plan_checkpoints(plan_id, checkpoint_date desc, created_at desc);

alter table public.objective_strategy_cadence enable row level security;
alter table public.recovery_checkpoint_cadence enable row level security;
alter table public.recovery_plan_checkpoints enable row level security;

revoke all on table public.objective_strategy_cadence from anon, authenticated;
revoke all on table public.recovery_checkpoint_cadence from anon, authenticated;
revoke all on table public.recovery_plan_checkpoints from anon, authenticated;

create or replace function public.save_objective_strategy_cadence(
  p_objective_id uuid,
  p_expected_version bigint,
  p_review_interval_days integer,
  p_kr_update_interval_days integer,
  p_reminder_days_before integer,
  p_review_anchor_date date,
  p_kr_anchor_date date,
  p_is_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_old public.objective_strategy_cadence%rowtype;
  v_new public.objective_strategy_cadence%rowtype;
  v_project_id text;
begin
  if not public.projectflow_can_edit_objective(p_objective_id) then
    raise exception 'STRATEGY_CADENCE_EDIT_DENIED' using errcode = '42501';
  end if;

  if p_review_interval_days not between 1 and 366
     or p_kr_update_interval_days not between 1 and 366
     or p_reminder_days_before not between 0 and 60
     or p_review_anchor_date is null
     or p_kr_anchor_date is null
  then
    raise exception 'STRATEGY_CADENCE_INVALID_INPUT' using errcode = '22023';
  end if;

  select * into v_old
  from public.objective_strategy_cadence
  where objective_id = p_objective_id
  for update;

  if found then
    if p_expected_version is null or v_old.version <> p_expected_version then
      raise exception 'STRATEGY_CADENCE_VERSION_MISMATCH' using errcode = '40001';
    end if;

    update public.objective_strategy_cadence
    set
      review_interval_days = p_review_interval_days,
      kr_update_interval_days = p_kr_update_interval_days,
      reminder_days_before = p_reminder_days_before,
      review_anchor_date = p_review_anchor_date,
      kr_anchor_date = p_kr_anchor_date,
      is_enabled = coalesce(p_is_enabled, true),
      version = version + 1,
      updated_at = now()
    where objective_id = p_objective_id
    returning * into v_new;
  else
    insert into public.objective_strategy_cadence (
      objective_id,
      review_interval_days,
      kr_update_interval_days,
      reminder_days_before,
      review_anchor_date,
      kr_anchor_date,
      is_enabled,
      created_by
    )
    values (
      p_objective_id,
      p_review_interval_days,
      p_kr_update_interval_days,
      p_reminder_days_before,
      p_review_anchor_date,
      p_kr_anchor_date,
      coalesce(p_is_enabled, true),
      auth.uid()
    )
    returning * into v_new;
  end if;

  for v_project_id in
    select project_id
    from public.objective_project_links
    where objective_id = p_objective_id
  loop
    perform public.projectflow_append_audit_event(
      v_project_id,
      'project',
      'strategy_cadence_updated',
      'objective_strategy_cadence',
      p_objective_id::text,
      case when v_old.objective_id is null then null else
        jsonb_build_object(
          'review_interval_days', v_old.review_interval_days,
          'kr_update_interval_days', v_old.kr_update_interval_days,
          'reminder_days_before', v_old.reminder_days_before,
          'is_enabled', v_old.is_enabled
        )
      end,
      jsonb_build_object(
        'review_interval_days', v_new.review_interval_days,
        'kr_update_interval_days', v_new.kr_update_interval_days,
        'reminder_days_before', v_new.reminder_days_before,
        'is_enabled', v_new.is_enabled
      ),
      jsonb_build_object(
        'objective_id', p_objective_id,
        'source', 'strategy_calendar'
      )
    );

    insert into public.project_activity (
      project_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    values (
      v_project_id,
      auth.uid(),
      'strategy_cadence_updated',
      'objective_strategy_cadence',
      p_objective_id::text,
      jsonb_build_object(
        'review_interval_days', v_new.review_interval_days,
        'kr_update_interval_days', v_new.kr_update_interval_days,
        'reminder_days_before', v_new.reminder_days_before,
        'is_enabled', v_new.is_enabled
      )
    );
  end loop;

  return to_jsonb(v_new);
end;
$projectflow$;

revoke all on function public.save_objective_strategy_cadence(
  uuid, bigint, integer, integer, integer, date, date, boolean
) from public;
grant execute on function public.save_objective_strategy_cadence(
  uuid, bigint, integer, integer, integer, date, date, boolean
) to authenticated;

create or replace function public.acknowledge_objective_kr_checkin(
  p_objective_id uuid,
  p_checkin_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_row public.objective_strategy_cadence%rowtype;
  v_project_id text;
begin
  if not public.projectflow_can_edit_objective(p_objective_id) then
    raise exception 'STRATEGY_CADENCE_EDIT_DENIED' using errcode = '42501';
  end if;

  if p_checkin_date is null or p_checkin_date > current_date then
    raise exception 'KR_CHECKIN_INVALID_DATE' using errcode = '22023';
  end if;

  update public.objective_strategy_cadence
  set
    last_kr_checkin_date = p_checkin_date,
    version = version + 1,
    updated_at = now()
  where objective_id = p_objective_id
  returning * into v_row;

  if not found then
    raise exception 'STRATEGY_CADENCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  for v_project_id in
    select project_id
    from public.objective_project_links
    where objective_id = p_objective_id
  loop
    perform public.projectflow_append_audit_event(
      v_project_id,
      'project',
      'strategy_kr_checkin_recorded',
      'objective_strategy_cadence',
      p_objective_id::text,
      null,
      jsonb_build_object(
        'checkin_date', p_checkin_date
      ),
      jsonb_build_object(
        'objective_id', p_objective_id,
        'source', 'strategy_calendar'
      )
    );

    insert into public.project_activity (
      project_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    values (
      v_project_id,
      auth.uid(),
      'strategy_kr_checkin_recorded',
      'objective_strategy_cadence',
      p_objective_id::text,
      jsonb_build_object('checkin_date', p_checkin_date)
    );
  end loop;

  return to_jsonb(v_row);
end;
$projectflow$;

revoke all on function public.acknowledge_objective_kr_checkin(uuid, date)
  from public;
grant execute on function public.acknowledge_objective_kr_checkin(uuid, date)
  to authenticated;

create or replace function public.save_recovery_checkpoint_cadence(
  p_plan_id uuid,
  p_expected_version bigint,
  p_checkpoint_interval_days integer,
  p_reminder_days_before integer,
  p_anchor_date date,
  p_is_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_plan public.objective_recovery_plans%rowtype;
  v_old public.recovery_checkpoint_cadence%rowtype;
  v_new public.recovery_checkpoint_cadence%rowtype;
  v_project_id text;
begin
  select * into v_plan
  from public.objective_recovery_plans
  where id = p_plan_id;

  if not found then
    raise exception 'RECOVERY_PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.projectflow_can_edit_objective(v_plan.objective_id) then
    raise exception 'RECOVERY_CHECKPOINT_CADENCE_DENIED' using errcode = '42501';
  end if;

  if p_checkpoint_interval_days not between 1 and 180
     or p_reminder_days_before not between 0 and 60
     or p_anchor_date is null
  then
    raise exception 'RECOVERY_CHECKPOINT_CADENCE_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select * into v_old
  from public.recovery_checkpoint_cadence
  where plan_id = p_plan_id
  for update;

  if found then
    if p_expected_version is null or v_old.version <> p_expected_version then
      raise exception 'RECOVERY_CHECKPOINT_CADENCE_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    update public.recovery_checkpoint_cadence
    set
      checkpoint_interval_days = p_checkpoint_interval_days,
      reminder_days_before = p_reminder_days_before,
      anchor_date = p_anchor_date,
      is_enabled = coalesce(p_is_enabled, true),
      version = version + 1,
      updated_at = now()
    where plan_id = p_plan_id
    returning * into v_new;
  else
    insert into public.recovery_checkpoint_cadence (
      plan_id,
      checkpoint_interval_days,
      reminder_days_before,
      anchor_date,
      is_enabled,
      created_by
    )
    values (
      p_plan_id,
      p_checkpoint_interval_days,
      p_reminder_days_before,
      p_anchor_date,
      coalesce(p_is_enabled, true),
      auth.uid()
    )
    returning * into v_new;
  end if;

  for v_project_id in
    select project_id
    from public.objective_project_links
    where objective_id = v_plan.objective_id
  loop
    perform public.projectflow_append_audit_event(
      v_project_id,
      'project',
      'recovery_checkpoint_cadence_updated',
      'recovery_checkpoint_cadence',
      p_plan_id::text,
      case when v_old.plan_id is null then null else
        jsonb_build_object(
          'checkpoint_interval_days', v_old.checkpoint_interval_days,
          'reminder_days_before', v_old.reminder_days_before,
          'is_enabled', v_old.is_enabled
        )
      end,
      jsonb_build_object(
        'checkpoint_interval_days', v_new.checkpoint_interval_days,
        'reminder_days_before', v_new.reminder_days_before,
        'is_enabled', v_new.is_enabled
      ),
      jsonb_build_object(
        'objective_id', v_plan.objective_id,
        'source', 'strategy_calendar'
      )
    );

    insert into public.project_activity (
      project_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    values (
      v_project_id,
      auth.uid(),
      'recovery_checkpoint_cadence_updated',
      'recovery_checkpoint_cadence',
      p_plan_id::text,
      jsonb_build_object(
        'objective_id', v_plan.objective_id,
        'checkpoint_interval_days', v_new.checkpoint_interval_days,
        'reminder_days_before', v_new.reminder_days_before,
        'is_enabled', v_new.is_enabled
      )
    );
  end loop;

  return to_jsonb(v_new);
end;
$projectflow$;

revoke all on function public.save_recovery_checkpoint_cadence(
  uuid, bigint, integer, integer, date, boolean
) from public;
grant execute on function public.save_recovery_checkpoint_cadence(
  uuid, bigint, integer, integer, date, boolean
) to authenticated;

create or replace function public.record_recovery_checkpoint(
  p_plan_id uuid,
  p_assessment text,
  p_note text,
  p_checkpoint_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_plan public.objective_recovery_plans%rowtype;
  v_checkpoint public.recovery_plan_checkpoints%rowtype;
  v_project_id text;
begin
  select * into v_plan
  from public.objective_recovery_plans
  where id = p_plan_id;

  if not found then
    raise exception 'RECOVERY_PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.projectflow_can_edit_objective(v_plan.objective_id) then
    raise exception 'RECOVERY_CHECKPOINT_DENIED' using errcode = '42501';
  end if;

  if p_assessment not in ('on_track','at_risk','off_track','recovered')
     or char_length(coalesce(p_note, '')) > 5000
     or p_checkpoint_date is null
     or p_checkpoint_date > current_date
  then
    raise exception 'RECOVERY_CHECKPOINT_INVALID_INPUT' using errcode = '22023';
  end if;

  insert into public.recovery_plan_checkpoints (
    plan_id,
    checkpoint_date,
    assessment,
    note,
    objective_progress_snapshot,
    daily_progress_rate_snapshot,
    created_by
  )
  values (
    p_plan_id,
    p_checkpoint_date,
    p_assessment,
    nullif(trim(coalesce(p_note, '')), ''),
    public.projectflow_objective_progress(v_plan.objective_id),
    public.projectflow_objective_trend_rate(v_plan.objective_id),
    auth.uid()
  )
  returning * into v_checkpoint;

  for v_project_id in
    select project_id
    from public.objective_project_links
    where objective_id = v_plan.objective_id
  loop
    perform public.projectflow_append_audit_event(
      v_project_id,
      'project',
      'recovery_checkpoint_recorded',
      'recovery_plan_checkpoint',
      v_checkpoint.id::text,
      null,
      jsonb_build_object(
        'checkpoint_date', v_checkpoint.checkpoint_date,
        'assessment', v_checkpoint.assessment,
        'objective_progress_snapshot', v_checkpoint.objective_progress_snapshot,
        'daily_progress_rate_snapshot', v_checkpoint.daily_progress_rate_snapshot
      ),
      jsonb_build_object(
        'objective_id', v_plan.objective_id,
        'plan_id', p_plan_id,
        'source', 'strategy_calendar'
      )
    );

    insert into public.project_activity (
      project_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    values (
      v_project_id,
      auth.uid(),
      'recovery_checkpoint_recorded',
      'recovery_plan_checkpoint',
      v_checkpoint.id::text,
      jsonb_build_object(
        'objective_id', v_plan.objective_id,
        'plan_id', p_plan_id,
        'checkpoint_date', v_checkpoint.checkpoint_date,
        'assessment', v_checkpoint.assessment
      )
    );
  end loop;

  return to_jsonb(v_checkpoint);
end;
$projectflow$;

revoke all on function public.record_recovery_checkpoint(
  uuid, text, text, date
) from public;
grant execute on function public.record_recovery_checkpoint(
  uuid, text, text, date
) to authenticated;

create or replace function public.projectflow_strategy_calendar_events()
returns table (
  event_type text,
  source_id uuid,
  objective_id uuid,
  objective_title text,
  project_id text,
  title text,
  due_date date,
  primary_owner_user_id uuid,
  reminder_days_before integer,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public
as $projectflow$
  with objective_project as (
    select
      o.id as objective_id,
      min(opl.project_id) as project_id
    from public.portfolio_objectives o
    left join public.objective_project_links opl
      on opl.objective_id = o.id
    group by o.id
  ),
  latest_review as (
    select
      r.objective_id,
      max(r.review_date) as last_review_date
    from public.objective_strategy_reviews r
    group by r.objective_id
  ),
  latest_checkpoint as (
    select
      rp.id as plan_id,
      max(c.checkpoint_date) as last_checkpoint_date
    from public.objective_recovery_plans rp
    left join public.recovery_plan_checkpoints c
      on c.plan_id = rp.id
    group by rp.id
  )
  select
    'strategy_review'::text,
    o.id,
    o.id,
    o.title,
    op.project_id,
    'مراجعة استراتيجية — ' || o.title,
    greatest(
      c.review_anchor_date,
      coalesce(lr.last_review_date, c.review_anchor_date)
    ) + c.review_interval_days,
    o.owner_user_id,
    c.reminder_days_before,
    jsonb_build_object(
      'cadence_version', c.version,
      'interval_days', c.review_interval_days
    )
  from public.objective_strategy_cadence c
  join public.portfolio_objectives o on o.id = c.objective_id
  left join objective_project op on op.objective_id = o.id
  left join latest_review lr on lr.objective_id = o.id
  where c.is_enabled
    and o.status in ('draft','active','paused')

  union all

  select
    'kr_update'::text,
    o.id,
    o.id,
    o.title,
    op.project_id,
    'تحديث Key Results — ' || o.title,
    greatest(
      c.kr_anchor_date,
      coalesce(c.last_kr_checkin_date, c.kr_anchor_date)
    ) + c.kr_update_interval_days,
    o.owner_user_id,
    c.reminder_days_before,
    jsonb_build_object(
      'cadence_version', c.version,
      'interval_days', c.kr_update_interval_days,
      'last_checkin_date', c.last_kr_checkin_date
    )
  from public.objective_strategy_cadence c
  join public.portfolio_objectives o on o.id = c.objective_id
  left join objective_project op on op.objective_id = o.id
  where c.is_enabled
    and o.status in ('draft','active','paused')

  union all

  select
    'benefit_review'::text,
    b.id,
    b.objective_id,
    o.title,
    op.project_id,
    'مراجعة Benefit — ' || b.title,
    b.target_date,
    b.owner_user_id,
    coalesce(c.reminder_days_before, 0),
    jsonb_build_object(
      'benefit_title', b.title,
      'benefit_status', b.status
    )
  from public.objective_benefits b
  join public.portfolio_objectives o on o.id = b.objective_id
  left join public.objective_strategy_cadence c
    on c.objective_id = b.objective_id
   and c.is_enabled
  left join objective_project op on op.objective_id = b.objective_id
  where b.target_date is not null
    and b.status in ('planned','realizing')

  union all

  select
    'recovery_checkpoint'::text,
    rp.id,
    rp.objective_id,
    o.title,
    op.project_id,
    'Recovery Checkpoint — ' || rp.title,
    greatest(
      rc.anchor_date,
      coalesce(lc.last_checkpoint_date, rc.anchor_date)
    ) + rc.checkpoint_interval_days,
    rp.owner_user_id,
    rc.reminder_days_before,
    jsonb_build_object(
      'plan_title', rp.title,
      'plan_status', rp.status,
      'cadence_version', rc.version,
      'interval_days', rc.checkpoint_interval_days
    )
  from public.recovery_checkpoint_cadence rc
  join public.objective_recovery_plans rp on rp.id = rc.plan_id
  join public.portfolio_objectives o on o.id = rp.objective_id
  left join latest_checkpoint lc on lc.plan_id = rp.id
  left join objective_project op on op.objective_id = rp.objective_id
  where rc.is_enabled
    and rp.status = 'active'

  union all

  select
    'recovery_commitment'::text,
    cm.id,
    rp.objective_id,
    o.title,
    op.project_id,
    'Recovery Commitment — ' || cm.title,
    cm.due_date,
    cm.owner_user_id,
    coalesce(rc.reminder_days_before, 0),
    jsonb_build_object(
      'plan_id', rp.id,
      'plan_title', rp.title,
      'commitment_title', cm.title,
      'commitment_status', cm.status
    )
  from public.recovery_commitments cm
  join public.objective_recovery_plans rp on rp.id = cm.plan_id
  join public.portfolio_objectives o on o.id = rp.objective_id
  left join public.recovery_checkpoint_cadence rc
    on rc.plan_id = rp.id
   and rc.is_enabled
  left join objective_project op on op.objective_id = rp.objective_id
  where cm.due_date is not null
    and cm.status in ('open','in_progress')
    and rp.status = 'active';
$projectflow$;

revoke all on function public.projectflow_strategy_calendar_events() from public;

create or replace function public.list_strategy_calendar()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'events',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'event_type', e.event_type,
          'source_id', e.source_id,
          'objective_id', e.objective_id,
          'objective_title', e.objective_title,
          'project_id', e.project_id,
          'title', e.title,
          'due_date', e.due_date,
          'primary_owner_user_id', e.primary_owner_user_id,
          'reminder_days_before', e.reminder_days_before,
          'status', case
            when e.due_date < current_date then 'overdue'
            when e.due_date <= current_date + e.reminder_days_before then 'due_soon'
            else 'upcoming'
          end,
          'metadata', e.metadata
        )
        order by e.due_date, e.event_type, e.title
      )
      from public.projectflow_strategy_calendar_events() e
      where public.projectflow_can_view_objective(e.objective_id)
    ), '[]'::jsonb),
    'objective_cadences',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'objective_id', c.objective_id,
          'review_interval_days', c.review_interval_days,
          'kr_update_interval_days', c.kr_update_interval_days,
          'reminder_days_before', c.reminder_days_before,
          'review_anchor_date', c.review_anchor_date,
          'kr_anchor_date', c.kr_anchor_date,
          'last_kr_checkin_date', c.last_kr_checkin_date,
          'is_enabled', c.is_enabled,
          'version', c.version,
          'created_at', c.created_at,
          'updated_at', c.updated_at
        )
        order by c.updated_at desc
      )
      from public.objective_strategy_cadence c
      where public.projectflow_can_view_objective(c.objective_id)
    ), '[]'::jsonb),
    'recovery_cadences',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'plan_id', rc.plan_id,
          'objective_id', rp.objective_id,
          'checkpoint_interval_days', rc.checkpoint_interval_days,
          'reminder_days_before', rc.reminder_days_before,
          'anchor_date', rc.anchor_date,
          'is_enabled', rc.is_enabled,
          'version', rc.version,
          'created_at', rc.created_at,
          'updated_at', rc.updated_at
        )
        order by rc.updated_at desc
      )
      from public.recovery_checkpoint_cadence rc
      join public.objective_recovery_plans rp on rp.id = rc.plan_id
      where public.projectflow_can_view_objective(rp.objective_id)
    ), '[]'::jsonb),
    'recovery_checkpoints',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cp.id,
          'plan_id', cp.plan_id,
          'objective_id', rp.objective_id,
          'checkpoint_date', cp.checkpoint_date,
          'assessment', cp.assessment,
          'note', cp.note,
          'objective_progress_snapshot', cp.objective_progress_snapshot,
          'daily_progress_rate_snapshot', cp.daily_progress_rate_snapshot,
          'created_by', cp.created_by,
          'created_at', cp.created_at
        )
        order by cp.checkpoint_date desc, cp.created_at desc
      )
      from public.recovery_plan_checkpoints cp
      join public.objective_recovery_plans rp on rp.id = cp.plan_id
      where public.projectflow_can_view_objective(rp.objective_id)
    ), '[]'::jsonb)
  );
end;
$projectflow$;

revoke all on function public.list_strategy_calendar() from public;
grant execute on function public.list_strategy_calendar() to authenticated;

-- Extend notifications with strategy schedule reminders/escalations.
alter table public.user_notifications
  drop constraint if exists user_notifications_kind_check;
alter table public.user_notifications
  add constraint user_notifications_kind_check
  check (
    kind in (
      'mention',
      'reply',
      'project_added',
      'role_changed',
      'project_removed',
      'task_assigned',
      'task_status',
      'task_due',
      'risk_escalation',
      'strategy_schedule'
    )
  );

create or replace function public.enqueue_user_notification(
  p_recipient_user_id uuid,
  p_project_id text,
  p_kind text,
  p_actor_user_id uuid default null,
  p_comment_id uuid default null,
  p_board_id text default null,
  p_document_id text default null,
  p_page_number integer default null,
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_id uuid;
begin
  if p_recipient_user_id is null
    or p_project_id is null
    or p_kind not in (
      'mention',
      'reply',
      'project_added',
      'role_changed',
      'project_removed',
      'task_assigned',
      'task_status',
      'task_due',
      'risk_escalation',
      'strategy_schedule'
    )
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
  then
    raise exception 'INVALID_NOTIFICATION_PAYLOAD' using errcode = '22023';
  end if;

  if p_page_number is not null and p_page_number < 1 then
    raise exception 'INVALID_NOTIFICATION_PAGE' using errcode = '22023';
  end if;

  insert into public.user_notifications (
    recipient_user_id,
    project_id,
    kind,
    actor_user_id,
    comment_id,
    board_id,
    document_id,
    page_number,
    metadata,
    dedupe_key
  )
  values (
    p_recipient_user_id,
    p_project_id,
    p_kind,
    p_actor_user_id,
    p_comment_id,
    p_board_id,
    p_document_id,
    p_page_number,
    coalesce(p_metadata, '{}'::jsonb),
    p_dedupe_key
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$projectflow$;

revoke all on function public.enqueue_user_notification(
  uuid, text, text, uuid, uuid, text, text, integer, jsonb, text
) from public;

create or replace function public.projectflow_is_strategy_event_recipient(
  p_user_id uuid,
  p_objective_id uuid,
  p_primary_owner_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $projectflow$
  select p_user_id is not null and (
    p_user_id = p_primary_owner_user_id
    or exists (
      select 1
      from public.portfolio_objectives o
      where o.id = p_objective_id
        and (o.created_by = p_user_id or o.owner_user_id = p_user_id)
    )
    or exists (
      select 1
      from public.objective_project_links opl
      join public.projects p on p.id = opl.project_id
      where opl.objective_id = p_objective_id
        and (
          p.created_by = p_user_id
          or exists (
            select 1
            from public.project_members pm
            where pm.project_id = opl.project_id
              and pm.user_id = p_user_id
              and pm.role in ('owner','admin')
          )
        )
    )
  );
$projectflow$;

revoke all on function public.projectflow_is_strategy_event_recipient(
  uuid, uuid, uuid
) from public;

create or replace function public.refresh_strategy_schedule_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_event record;
  v_event_state text;
  v_id uuid;
  v_inserted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  for v_event in
    select *
    from public.projectflow_strategy_calendar_events() e
    where e.project_id is not null
      and e.due_date <= current_date + e.reminder_days_before
      and public.projectflow_can_view_objective(e.objective_id)
      and public.projectflow_is_strategy_event_recipient(
        auth.uid(),
        e.objective_id,
        e.primary_owner_user_id
      )
  loop
    v_event_state :=
      case when v_event.due_date < current_date then 'overdue' else 'due_soon' end;

    v_id := public.enqueue_user_notification(
      auth.uid(),
      v_event.project_id,
      'strategy_schedule',
      null,
      null,
      null,
      null,
      null,
      v_event.metadata || jsonb_build_object(
        'event', v_event_state,
        'event_type', v_event.event_type,
        'source_id', v_event.source_id,
        'objective_id', v_event.objective_id,
        'objective_title', v_event.objective_title,
        'title', v_event.title,
        'due_date', v_event.due_date
      ),
      'strategy:' || v_event.event_type || ':' ||
        v_event.source_id::text || ':' ||
        v_event.due_date::text || ':' ||
        v_event_state || ':' || auth.uid()::text
    );

    if v_id is not null then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$projectflow$;

revoke all on function public.refresh_strategy_schedule_notifications()
  from public;
grant execute on function public.refresh_strategy_schedule_notifications()
  to authenticated;

create or replace function public.refresh_all_strategy_schedule_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_event record;
  v_recipient uuid;
  v_event_state text;
  v_id uuid;
  v_inserted integer := 0;
begin
  for v_event in
    select *
    from public.projectflow_strategy_calendar_events() e
    where e.project_id is not null
      and e.due_date <= current_date + e.reminder_days_before
  loop
    v_event_state :=
      case when v_event.due_date < current_date then 'overdue' else 'due_soon' end;

    for v_recipient in
      select distinct recipient
      from (
        select v_event.primary_owner_user_id as recipient

        union

        select o.created_by
        from public.portfolio_objectives o
        where o.id = v_event.objective_id

        union

        select o.owner_user_id
        from public.portfolio_objectives o
        where o.id = v_event.objective_id

        union

        select p.created_by
        from public.objective_project_links opl
        join public.projects p on p.id = opl.project_id
        where opl.objective_id = v_event.objective_id

        union

        select pm.user_id
        from public.objective_project_links opl
        join public.project_members pm on pm.project_id = opl.project_id
        where opl.objective_id = v_event.objective_id
          and pm.role in ('owner','admin')
      ) recipients
      where recipient is not null
    loop
      v_id := public.enqueue_user_notification(
        v_recipient,
        v_event.project_id,
        'strategy_schedule',
        null,
        null,
        null,
        null,
        null,
        v_event.metadata || jsonb_build_object(
          'event', v_event_state,
          'event_type', v_event.event_type,
          'source_id', v_event.source_id,
          'objective_id', v_event.objective_id,
          'objective_title', v_event.objective_title,
          'title', v_event.title,
          'due_date', v_event.due_date,
          'source', 'server_scheduler'
        ),
        'strategy:' || v_event.event_type || ':' ||
          v_event.source_id::text || ':' ||
          v_event.due_date::text || ':' ||
          v_event_state || ':' || v_recipient::text
      );

      if v_id is not null then
        v_inserted := v_inserted + 1;
      end if;
    end loop;
  end loop;

  return v_inserted;
end;
$projectflow$;

revoke all on function public.refresh_all_strategy_schedule_notifications()
  from public;

create or replace function public.list_user_notifications(
  p_filter text default 'all',
  p_limit integer default 60
)
returns table (
  id uuid,
  project_id text,
  project_name text,
  kind text,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  comment_id uuid,
  board_id text,
  board_name text,
  document_id text,
  document_name text,
  page_number integer,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_filter not in ('all','unread','mentions','tasks','risks','strategy') then
    raise exception 'INVALID_NOTIFICATION_FILTER' using errcode = '22023';
  end if;

  return query
  select
    n.id,
    n.project_id,
    coalesce(p.name, 'المشروع')::text,
    n.kind,
    n.actor_user_id,
    coalesce(
      nullif(pr.full_name, ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'النظام'
    )::text,
    coalesce(u.email, '')::text,
    n.comment_id,
    n.board_id,
    b.name,
    n.document_id,
    d.file_name,
    n.page_number,
    n.metadata,
    n.read_at,
    n.created_at
  from public.user_notifications n
  left join public.projects p on p.id = n.project_id
  left join auth.users u on u.id = n.actor_user_id
  left join public.profiles pr on pr.id = n.actor_user_id
  left join public.boards b on b.id = n.board_id
  left join public.project_documents d on d.id = n.document_id
  where n.recipient_user_id = auth.uid()
    and (p_filter <> 'unread' or n.read_at is null)
    and (
      p_filter <> 'mentions'
      or n.kind in ('mention','reply')
    )
    and (
      p_filter <> 'tasks'
      or n.kind in ('task_assigned','task_status','task_due')
    )
    and (
      p_filter <> 'risks'
      or n.kind = 'risk_escalation'
    )
    and (
      p_filter <> 'strategy'
      or n.kind = 'strategy_schedule'
    )
  order by n.created_at desc
  limit least(150, greatest(1, coalesce(p_limit, 60)));
end;
$projectflow$;

revoke all on function public.list_user_notifications(text, integer) from public;
grant execute on function public.list_user_notifications(text, integer)
  to authenticated;

-- Best-effort server-side cadence reminders. App refresh remains the fallback.
do $projectflow$
declare
  v_job_id bigint;
  v_installed boolean := false;
begin
  begin
    if exists (
      select 1
      from pg_available_extensions
      where name = 'pg_cron'
    ) and not exists (
      select 1
      from pg_extension
      where extname = 'pg_cron'
    ) then
      execute 'create extension if not exists pg_cron';
    end if;
  exception when others then
    null;
  end;

  select exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) into v_installed;

  if v_installed and to_regnamespace('cron') is not null then
    begin
      for v_job_id in
        execute 'select jobid from cron.job where jobname = ''projectflow-strategy-calendar'''
      loop
        execute 'select cron.unschedule($1)' using v_job_id;
      end loop;

      execute 'select cron.schedule($1, $2, $3)'
        into v_job_id
        using
          'projectflow-strategy-calendar',
          '25 * * * *',
          'select public.refresh_all_strategy_schedule_notifications();';
    exception when others then
      null;
    end;
  end if;
end;
$projectflow$;
