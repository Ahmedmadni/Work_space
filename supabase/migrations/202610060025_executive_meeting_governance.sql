-- Phase 37: Executive Decision Governance & Meeting Outcomes.
-- Governance rules are enforced server-side; UI validation is advisory only.

insert into public.projectflow_schema_versions (version, label)
values (25, 'executive-decision-governance-meeting-outcomes')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.executive_strategy_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_date date not null,
  period_label text,
  status text not null default 'draft'
    check (status in ('draft','in_progress','completed','cancelled')),
  chair_user_id uuid references auth.users(id) on delete set null,
  summary text,
  next_meeting_date date,
  board_pack_generated_at timestamptz,
  finalized_at timestamptz,
  version bigint not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.executive_meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.executive_strategy_meetings(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  email_snapshot text,
  role_label text,
  attendance_status text not null default 'invited'
    check (attendance_status in ('invited','attended','absent','excused')),
  created_at timestamptz not null default now()
);

create table if not exists public.executive_meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.executive_strategy_meetings(id) on delete cascade,
  source_decision_id uuid references public.project_decisions(id) on delete set null,
  source_decision_version bigint,
  objective_id uuid references public.portfolio_objectives(id) on delete set null,
  project_id text references public.projects(id) on delete set null,
  title text not null,
  outcome text not null default 'deferred'
    check (outcome in ('decided','deferred','rejected')),
  decision_text text,
  rationale text,
  owner_user_id uuid references auth.users(id) on delete set null,
  follow_up_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.executive_meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.executive_strategy_meetings(id) on delete cascade,
  decision_id uuid references public.executive_meeting_decisions(id) on delete set null,
  objective_id uuid references public.portfolio_objectives(id) on delete set null,
  project_id text references public.projects(id) on delete set null,
  title text not null,
  description text,
  owner_user_id uuid references auth.users(id) on delete set null,
  due_date date,
  status text not null default 'open'
    check (status in ('open','in_progress','done','cancelled')),
  completed_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists executive_strategy_meetings_status_date_idx
  on public.executive_strategy_meetings(status, meeting_date desc);
create index if not exists executive_meeting_attendees_meeting_idx
  on public.executive_meeting_attendees(meeting_id, attendance_status);
create index if not exists executive_meeting_decisions_meeting_idx
  on public.executive_meeting_decisions(meeting_id, outcome);
create unique index if not exists executive_meeting_decisions_source_unique_idx
  on public.executive_meeting_decisions(meeting_id, source_decision_id)
  where source_decision_id is not null;
create index if not exists executive_meeting_actions_meeting_status_idx
  on public.executive_meeting_action_items(meeting_id, status, due_date);
create index if not exists executive_meeting_actions_owner_status_idx
  on public.executive_meeting_action_items(owner_user_id, status, due_date);

alter table public.executive_strategy_meetings enable row level security;
alter table public.executive_meeting_attendees enable row level security;
alter table public.executive_meeting_decisions enable row level security;
alter table public.executive_meeting_action_items enable row level security;

revoke all on table public.executive_strategy_meetings from anon, authenticated;
revoke all on table public.executive_meeting_attendees from anon, authenticated;
revoke all on table public.executive_meeting_decisions from anon, authenticated;
revoke all on table public.executive_meeting_action_items from anon, authenticated;

create or replace function public.projectflow_meeting_linked_projects(
  p_meeting_id uuid
)
returns table(project_id text)
language sql
stable
security definer
set search_path = public
as $projectflow$
  select distinct linked.project_id
  from (
    select d.project_id
    from public.executive_meeting_decisions d
    where d.meeting_id = p_meeting_id
      and d.project_id is not null

    union

    select a.project_id
    from public.executive_meeting_action_items a
    where a.meeting_id = p_meeting_id
      and a.project_id is not null

    union

    select opl.project_id
    from public.executive_meeting_decisions d
    join public.objective_project_links opl
      on opl.objective_id = d.objective_id
    where d.meeting_id = p_meeting_id
      and d.objective_id is not null

    union

    select opl.project_id
    from public.executive_meeting_action_items a
    join public.objective_project_links opl
      on opl.objective_id = a.objective_id
    where a.meeting_id = p_meeting_id
      and a.objective_id is not null
  ) linked
  where linked.project_id is not null;
$projectflow$;

revoke all on function public.projectflow_meeting_linked_projects(uuid)
  from public;

create or replace function public.projectflow_can_view_executive_meeting(
  p_meeting_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $projectflow$
  select auth.uid() is not null and exists (
    select 1
    from public.executive_strategy_meetings m
    where m.id = p_meeting_id
      and (
        m.created_by = auth.uid()
        or m.chair_user_id = auth.uid()
        or exists (
          select 1
          from public.executive_meeting_attendees a
          where a.meeting_id = m.id
            and a.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.projectflow_meeting_linked_projects(m.id) lp
          where public.can_access_project(lp.project_id)
        )
      )
  );
$projectflow$;

revoke all on function public.projectflow_can_view_executive_meeting(uuid)
  from public;

create or replace function public.projectflow_can_manage_executive_meeting(
  p_meeting_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $projectflow$
  select auth.uid() is not null and exists (
    select 1
    from public.executive_strategy_meetings m
    where m.id = p_meeting_id
      and (
        m.created_by = auth.uid()
        or m.chair_user_id = auth.uid()
        or exists (
          select 1
          from public.projectflow_meeting_linked_projects(m.id) lp
          join public.projects p on p.id = lp.project_id
          where p.created_by = auth.uid()
             or exists (
               select 1
               from public.project_members pm
               where pm.project_id = lp.project_id
                 and pm.user_id = auth.uid()
                 and pm.role in ('owner','admin')
             )
        )
      )
  );
$projectflow$;

revoke all on function public.projectflow_can_manage_executive_meeting(uuid)
  from public;

create or replace function public.projectflow_validate_meeting_link(
  p_objective_id uuid,
  p_project_id text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
begin
  if p_objective_id is not null
     and not public.projectflow_can_view_objective(p_objective_id)
  then
    raise exception 'MEETING_OBJECTIVE_LINK_DENIED' using errcode = '42501';
  end if;

  if p_project_id is not null
     and not public.can_access_project(p_project_id)
  then
    raise exception 'MEETING_PROJECT_LINK_DENIED' using errcode = '42501';
  end if;

  if p_objective_id is not null
     and p_project_id is not null
     and not exists (
       select 1
       from public.objective_project_links opl
       where opl.objective_id = p_objective_id
         and opl.project_id = p_project_id
     )
  then
    raise exception 'MEETING_PROJECT_NOT_LINKED_TO_OBJECTIVE'
      using errcode = '22023';
  end if;
end;
$projectflow$;

revoke all on function public.projectflow_validate_meeting_link(uuid, text)
  from public;

create or replace function public.projectflow_meeting_participant_allowed(
  p_meeting_id uuid,
  p_user_id uuid,
  p_objective_id uuid,
  p_project_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $projectflow$
  select p_user_id is null
    or exists (
      select 1
      from public.executive_strategy_meetings m
      where m.id = p_meeting_id
        and (
          m.created_by = p_user_id
          or m.chair_user_id = p_user_id
          or exists (
            select 1
            from public.executive_meeting_attendees a
            where a.meeting_id = m.id
              and a.user_id = p_user_id
          )
          or (
            p_project_id is not null
            and exists (
              select 1
              from public.projects p
              where p.id = p_project_id
                and (
                  p.created_by = p_user_id
                  or exists (
                    select 1
                    from public.project_members pm
                    where pm.project_id = p_project_id
                      and pm.user_id = p_user_id
                      and pm.role in ('owner','admin','editor')
                  )
                )
            )
          )
          or (
            p_objective_id is not null
            and exists (
              select 1
              from public.portfolio_objectives o
              where o.id = p_objective_id
                and (
                  o.created_by = p_user_id
                  or o.owner_user_id = p_user_id
                  or exists (
                    select 1
                    from public.objective_project_links opl
                    join public.projects p on p.id = opl.project_id
                    where opl.objective_id = o.id
                      and (
                        p.created_by = p_user_id
                        or exists (
                          select 1
                          from public.project_members pm
                          where pm.project_id = p.id
                            and pm.user_id = p_user_id
                            and pm.role in ('owner','admin','editor')
                        )
                      )
                  )
                )
            )
          )
        )
    );
$projectflow$;

revoke all on function public.projectflow_meeting_participant_allowed(
  uuid, uuid, uuid, text
) from public;

create or replace function public.save_executive_strategy_meeting(
  p_meeting_id uuid,
  p_expected_version bigint,
  p_title text,
  p_meeting_date date,
  p_period_label text,
  p_status text,
  p_chair_user_id uuid,
  p_summary text,
  p_next_meeting_date date,
  p_board_pack_generated_at timestamptz,
  p_attendees jsonb,
  p_decisions jsonb,
  p_action_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $projectflow$
declare
  v_id uuid := coalesce(p_meeting_id, gen_random_uuid());
  v_old public.executive_strategy_meetings%rowtype;
  v_new public.executive_strategy_meetings%rowtype;
  v_row jsonb;
  v_attendee_id uuid;
  v_user_id uuid;
  v_display_name text;
  v_email text;
  v_decision_id uuid;
  v_source_id uuid;
  v_source_version bigint;
  v_source public.project_decisions%rowtype;
  v_objective_id uuid;
  v_project_id text;
  v_owner_id uuid;
  v_action_id uuid;
  v_linked_decision uuid;
  v_meeting_decision public.executive_meeting_decisions%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_period_label text := nullif(trim(coalesce(p_period_label, '')), '');
  v_summary text := nullif(trim(coalesce(p_summary, '')), '');
  v_project text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if char_length(v_title) not between 1 and 200
     or char_length(coalesce(v_period_label, '')) > 120
     or char_length(coalesce(v_summary, '')) > 12000
     or p_meeting_date is null
     or p_status not in ('draft','in_progress')
     or jsonb_typeof(coalesce(p_attendees, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_decisions, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_action_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_attendees, '[]'::jsonb)) > 150
     or jsonb_array_length(coalesce(p_decisions, '[]'::jsonb)) > 150
     or jsonb_array_length(coalesce(p_action_items, '[]'::jsonb)) > 250
  then
    raise exception 'EXECUTIVE_MEETING_INVALID_INPUT' using errcode = '22023';
  end if;

  if p_next_meeting_date is not null and p_next_meeting_date < p_meeting_date then
    raise exception 'NEXT_MEETING_BEFORE_CURRENT' using errcode = '22023';
  end if;

  if p_meeting_id is null then
    insert into public.executive_strategy_meetings (
      id, title, meeting_date, period_label, status, chair_user_id,
      summary, next_meeting_date, board_pack_generated_at, created_by
    )
    values (
      v_id, v_title, p_meeting_date, v_period_label, p_status, p_chair_user_id,
      v_summary, p_next_meeting_date, p_board_pack_generated_at, auth.uid()
    )
    returning * into v_new;
  else
    select * into v_old
    from public.executive_strategy_meetings
    where id = p_meeting_id
    for update;

    if not found then
      raise exception 'EXECUTIVE_MEETING_NOT_FOUND' using errcode = 'P0002';
    end if;

    if not public.projectflow_can_manage_executive_meeting(p_meeting_id) then
      raise exception 'EXECUTIVE_MEETING_EDIT_DENIED' using errcode = '42501';
    end if;

    if v_old.status in ('completed','cancelled') then
      raise exception 'EXECUTIVE_MEETING_LOCKED' using errcode = '55000';
    end if;

    if p_expected_version is null or v_old.version <> p_expected_version then
      raise exception 'EXECUTIVE_MEETING_VERSION_MISMATCH' using errcode = '40001';
    end if;

    update public.executive_strategy_meetings
    set
      title = v_title,
      meeting_date = p_meeting_date,
      period_label = v_period_label,
      status = p_status,
      chair_user_id = p_chair_user_id,
      summary = v_summary,
      next_meeting_date = p_next_meeting_date,
      board_pack_generated_at = p_board_pack_generated_at,
      version = version + 1,
      updated_at = now()
    where id = p_meeting_id
    returning * into v_new;
  end if;

  delete from public.executive_meeting_attendees
  where meeting_id = v_id;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(p_attendees, '[]'::jsonb))
  loop
    begin
      v_attendee_id := coalesce(nullif(v_row->>'id', '')::uuid, gen_random_uuid());
      v_user_id := nullif(v_row->>'user_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'EXECUTIVE_MEETING_ATTENDEE_INVALID_ID' using errcode = '22023';
    end;

    v_display_name := trim(coalesce(v_row->>'display_name', ''));
    v_email := nullif(trim(coalesce(v_row->>'email_snapshot', '')), '');

    if char_length(v_display_name) not between 1 and 180
       or char_length(coalesce(v_email, '')) > 320
       or char_length(coalesce(v_row->>'role_label', '')) > 120
       or coalesce(v_row->>'attendance_status', 'invited')
          not in ('invited','attended','absent','excused')
    then
      raise exception 'EXECUTIVE_MEETING_ATTENDEE_INVALID_INPUT'
        using errcode = '22023';
    end if;

    if v_user_id is not null
       and not exists (select 1 from auth.users u where u.id = v_user_id)
    then
      raise exception 'EXECUTIVE_MEETING_ATTENDEE_UNKNOWN_USER'
        using errcode = '22023';
    end if;

    if v_user_id is not null
       and exists (
         select 1
         from public.executive_meeting_attendees a
         where a.meeting_id = v_id
           and a.user_id = v_user_id
       )
    then
      raise exception 'EXECUTIVE_MEETING_ATTENDEE_DUPLICATE'
        using errcode = '22023';
    end if;

    insert into public.executive_meeting_attendees (
      id, meeting_id, user_id, display_name, email_snapshot,
      role_label, attendance_status
    )
    values (
      v_attendee_id, v_id, v_user_id, v_display_name, v_email,
      nullif(trim(coalesce(v_row->>'role_label', '')), ''),
      coalesce(v_row->>'attendance_status', 'invited')
    );
  end loop;

  if p_chair_user_id is not null
     and p_chair_user_id <> auth.uid()
     and not exists (
       select 1
       from public.executive_meeting_attendees a
       where a.meeting_id = v_id
         and a.user_id = p_chair_user_id
     )
  then
    raise exception 'EXECUTIVE_MEETING_CHAIR_NOT_ATTENDEE'
      using errcode = '22023';
  end if;

  delete from public.executive_meeting_action_items
  where meeting_id = v_id;

  delete from public.executive_meeting_decisions
  where meeting_id = v_id;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb))
  loop
    begin
      v_decision_id := coalesce(nullif(v_row->>'id', '')::uuid, gen_random_uuid());
      v_objective_id := nullif(v_row->>'objective_id', '')::uuid;
      v_source_id := nullif(v_row->>'source_decision_id', '')::uuid;
      v_source_version := nullif(v_row->>'source_decision_version', '')::bigint;
      v_owner_id := nullif(v_row->>'owner_user_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'EXECUTIVE_MEETING_DECISION_INVALID_ID'
        using errcode = '22023';
    end;

    v_project_id := nullif(v_row->>'project_id', '');

    perform public.projectflow_validate_meeting_link(
      v_objective_id,
      v_project_id
    );

    if char_length(trim(coalesce(v_row->>'title', ''))) not between 1 and 240
       or char_length(coalesce(v_row->>'decision_text', '')) > 8000
       or char_length(coalesce(v_row->>'rationale', '')) > 6000
       or coalesce(v_row->>'outcome', 'deferred')
          not in ('decided','deferred','rejected')
    then
      raise exception 'EXECUTIVE_MEETING_DECISION_INVALID_INPUT'
        using errcode = '22023';
    end if;

    if v_source_id is not null then
      select * into v_source
      from public.project_decisions d
      where d.id = v_source_id;

      if not found or not public.can_access_project(v_source.project_id) then
        raise exception 'EXECUTIVE_MEETING_SOURCE_DECISION_DENIED'
          using errcode = '42501';
      end if;

      if v_source_version is null
         or v_source.version <> v_source_version
      then
        raise exception 'MEETING_SOURCE_DECISION_VERSION_MISMATCH'
          using errcode = '40001';
      end if;

      if v_project_id is null then
        v_project_id := v_source.project_id;
      elsif v_project_id <> v_source.project_id then
        raise exception 'EXECUTIVE_MEETING_SOURCE_DECISION_PROJECT_MISMATCH'
          using errcode = '22023';
      end if;
    else
      v_source_version := null;
    end if;

    -- Source decisions may supply the project after the first validation.
    -- Revalidate the final Objective/Project pair to prevent mismatched links.
    perform public.projectflow_validate_meeting_link(
      v_objective_id,
      v_project_id
    );

    if not public.projectflow_meeting_participant_allowed(
      v_id,
      v_owner_id,
      v_objective_id,
      v_project_id
    ) then
      raise exception 'EXECUTIVE_MEETING_DECISION_OWNER_INVALID'
        using errcode = '22023';
    end if;

    insert into public.executive_meeting_decisions (
      id, meeting_id, source_decision_id, source_decision_version,
      objective_id, project_id, title, outcome, decision_text,
      rationale, owner_user_id, follow_up_date
    )
    values (
      v_decision_id,
      v_id,
      v_source_id,
      v_source_version,
      v_objective_id,
      v_project_id,
      trim(v_row->>'title'),
      coalesce(v_row->>'outcome', 'deferred'),
      nullif(trim(coalesce(v_row->>'decision_text', '')), ''),
      nullif(trim(coalesce(v_row->>'rationale', '')), ''),
      v_owner_id,
      case
        when nullif(v_row->>'follow_up_date', '') is null then null
        else (v_row->>'follow_up_date')::date
      end
    );
  end loop;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(p_action_items, '[]'::jsonb))
  loop
    begin
      v_action_id := coalesce(nullif(v_row->>'id', '')::uuid, gen_random_uuid());
      v_linked_decision := nullif(v_row->>'decision_id', '')::uuid;
      v_objective_id := nullif(v_row->>'objective_id', '')::uuid;
      v_owner_id := nullif(v_row->>'owner_user_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'EXECUTIVE_MEETING_ACTION_INVALID_ID'
        using errcode = '22023';
    end;

    v_project_id := nullif(v_row->>'project_id', '');

    perform public.projectflow_validate_meeting_link(
      v_objective_id,
      v_project_id
    );

    if char_length(trim(coalesce(v_row->>'title', ''))) not between 1 and 240
       or char_length(coalesce(v_row->>'description', '')) > 6000
       or coalesce(v_row->>'status', 'open')
          not in ('open','in_progress','done','cancelled')
    then
      raise exception 'EXECUTIVE_MEETING_ACTION_INVALID_INPUT'
        using errcode = '22023';
    end if;

    if v_linked_decision is not null then
      select * into v_meeting_decision
      from public.executive_meeting_decisions d
      where d.id = v_linked_decision
        and d.meeting_id = v_id;

      if not found then
        raise exception 'EXECUTIVE_MEETING_ACTION_DECISION_MISMATCH'
          using errcode = '22023';
      end if;

      if v_objective_id is null then
        v_objective_id := v_meeting_decision.objective_id;
      elsif v_meeting_decision.objective_id is not null
         and v_objective_id <> v_meeting_decision.objective_id
      then
        raise exception 'EXECUTIVE_MEETING_ACTION_OBJECTIVE_MISMATCH'
          using errcode = '22023';
      end if;

      if v_project_id is null then
        v_project_id := v_meeting_decision.project_id;
      elsif v_meeting_decision.project_id is not null
         and v_project_id <> v_meeting_decision.project_id
      then
        raise exception 'EXECUTIVE_MEETING_ACTION_PROJECT_MISMATCH'
          using errcode = '22023';
      end if;

      perform public.projectflow_validate_meeting_link(
        v_objective_id,
        v_project_id
      );
    end if;

    if not public.projectflow_meeting_participant_allowed(
      v_id,
      v_owner_id,
      v_objective_id,
      v_project_id
    ) then
      raise exception 'EXECUTIVE_MEETING_ACTION_OWNER_INVALID'
        using errcode = '22023';
    end if;

    insert into public.executive_meeting_action_items (
      id, meeting_id, decision_id, objective_id, project_id,
      title, description, owner_user_id, due_date, status, completed_at
    )
    values (
      v_action_id,
      v_id,
      v_linked_decision,
      v_objective_id,
      v_project_id,
      trim(v_row->>'title'),
      nullif(trim(coalesce(v_row->>'description', '')), ''),
      v_owner_id,
      case
        when nullif(v_row->>'due_date', '') is null then null
        else (v_row->>'due_date')::date
      end,
      coalesce(v_row->>'status', 'open'),
      case
        when coalesce(v_row->>'status', 'open') = 'done' then now()
        else null
      end
    );
  end loop;

  for v_project in
    select project_id
    from public.projectflow_meeting_linked_projects(v_id)
  loop
    perform public.projectflow_append_audit_event(
      v_project,
      'project',
      case when p_meeting_id is null
        then 'executive_meeting_created'
        else 'executive_meeting_updated'
      end,
      'executive_strategy_meeting',
      v_id::text,
      case when p_meeting_id is null then null else
        jsonb_build_object(
          'title', v_old.title,
          'meeting_date', v_old.meeting_date,
          'status', v_old.status,
          'version', v_old.version
        )
      end,
      jsonb_build_object(
        'title', v_new.title,
        'meeting_date', v_new.meeting_date,
        'status', v_new.status,
        'version', v_new.version,
        'attendee_count', jsonb_array_length(coalesce(p_attendees, '[]'::jsonb)),
        'decision_count', jsonb_array_length(coalesce(p_decisions, '[]'::jsonb)),
        'action_count', jsonb_array_length(coalesce(p_action_items, '[]'::jsonb))
      ),
      jsonb_build_object('source', 'executive_meeting')
    );

    insert into public.project_activity (
      project_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    values (
      v_project,
      auth.uid(),
      case when p_meeting_id is null
        then 'executive_meeting_created'
        else 'executive_meeting_updated'
      end,
      'executive_strategy_meeting',
      v_id::text,
      jsonb_build_object(
        'title', v_new.title,
        'meeting_date', v_new.meeting_date,
        'status', v_new.status
      )
    );
  end loop;

  return jsonb_build_object(
    'id', v_new.id,
    'version', v_new.version
  );
end;
$projectflow$;

revoke all on function public.save_executive_strategy_meeting(
  uuid, bigint, text, date, text, text, uuid, text, date, timestamptz,
  jsonb, jsonb, jsonb
) from public;
grant execute on function public.save_executive_strategy_meeting(
  uuid, bigint, text, date, text, text, uuid, text, date, timestamptz,
  jsonb, jsonb, jsonb
) to authenticated;

create or replace function public.finalize_executive_strategy_meeting(
  p_meeting_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_meeting public.executive_strategy_meetings%rowtype;
  v_decision public.executive_meeting_decisions%rowtype;
  v_source_old public.project_decisions%rowtype;
  v_source_new public.project_decisions%rowtype;
  v_project text;
begin
  if not public.projectflow_can_manage_executive_meeting(p_meeting_id) then
    raise exception 'EXECUTIVE_MEETING_FINALIZE_DENIED' using errcode = '42501';
  end if;

  select * into v_meeting
  from public.executive_strategy_meetings
  where id = p_meeting_id
  for update;

  if not found then
    raise exception 'EXECUTIVE_MEETING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_meeting.status in ('completed','cancelled') then
    raise exception 'EXECUTIVE_MEETING_LOCKED' using errcode = '55000';
  end if;

  if p_expected_version is null or v_meeting.version <> p_expected_version then
    raise exception 'EXECUTIVE_MEETING_VERSION_MISMATCH' using errcode = '40001';
  end if;

  if v_meeting.meeting_date > current_date then
    raise exception 'EXECUTIVE_MEETING_FUTURE_FINALIZE' using errcode = '22023';
  end if;

  for v_decision in
    select *
    from public.executive_meeting_decisions d
    where d.meeting_id = p_meeting_id
      and d.source_decision_id is not null
      and d.outcome in ('decided','rejected')
  loop
    select * into v_source_old
    from public.project_decisions d
    where d.id = v_decision.source_decision_id
    for update;

    if not found then
      raise exception 'EXECUTIVE_MEETING_SOURCE_DECISION_NOT_FOUND'
        using errcode = 'P0002';
    end if;

    if v_decision.source_decision_version is null
       or v_source_old.version <> v_decision.source_decision_version
    then
      raise exception 'MEETING_SOURCE_DECISION_VERSION_MISMATCH'
        using errcode = '40001';
    end if;

    update public.project_decisions
    set
      decision = coalesce(
        nullif(trim(coalesce(v_decision.decision_text, '')), ''),
        decision
      ),
      rationale = coalesce(
        nullif(trim(coalesce(v_decision.rationale, '')), ''),
        rationale
      ),
      status = case
        when v_decision.outcome = 'decided' then 'decided'
        else 'cancelled'
      end,
      owner_user_id = coalesce(v_decision.owner_user_id, owner_user_id),
      decided_at = case
        when v_decision.outcome = 'decided' then coalesce(decided_at, now())
        else decided_at
      end,
      version = version + 1,
      updated_at = now()
    where id = v_source_old.id
    returning * into v_source_new;

    perform public.projectflow_append_audit_event(
      v_source_old.project_id,
      'project',
      'decision_updated',
      'project_decision',
      v_source_new.id::text,
      jsonb_build_object(
        'title', v_source_old.title,
        'status', v_source_old.status,
        'version', v_source_old.version
      ),
      jsonb_build_object(
        'title', v_source_new.title,
        'status', v_source_new.status,
        'version', v_source_new.version
      ),
      jsonb_build_object(
        'source', 'executive_meeting',
        'meeting_id', p_meeting_id,
        'meeting_decision_id', v_decision.id
      )
    );

    insert into public.project_activity (
      project_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    values (
      v_source_old.project_id,
      auth.uid(),
      'decision_updated',
      'project_decision',
      v_source_new.id::text,
      jsonb_build_object(
        'status', v_source_new.status,
        'source', 'executive_meeting',
        'meeting_id', p_meeting_id
      )
    );
  end loop;

  update public.executive_strategy_meetings
  set
    status = 'completed',
    finalized_at = now(),
    version = version + 1,
    updated_at = now()
  where id = p_meeting_id
  returning * into v_meeting;

  for v_project in
    select project_id
    from public.projectflow_meeting_linked_projects(p_meeting_id)
  loop
    perform public.projectflow_append_audit_event(
      v_project,
      'project',
      'executive_meeting_finalized',
      'executive_strategy_meeting',
      p_meeting_id::text,
      null,
      jsonb_build_object(
        'title', v_meeting.title,
        'meeting_date', v_meeting.meeting_date,
        'finalized_at', v_meeting.finalized_at,
        'decision_count', (
          select count(*)
          from public.executive_meeting_decisions d
          where d.meeting_id = p_meeting_id
        ),
        'action_count', (
          select count(*)
          from public.executive_meeting_action_items a
          where a.meeting_id = p_meeting_id
        )
      ),
      jsonb_build_object('source', 'executive_meeting')
    );

    insert into public.project_activity (
      project_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    values (
      v_project,
      auth.uid(),
      'executive_meeting_finalized',
      'executive_strategy_meeting',
      p_meeting_id::text,
      jsonb_build_object(
        'title', v_meeting.title,
        'meeting_date', v_meeting.meeting_date
      )
    );
  end loop;

  return jsonb_build_object(
    'id', v_meeting.id,
    'version', v_meeting.version,
    'status', v_meeting.status,
    'finalized_at', v_meeting.finalized_at
  );
end;
$projectflow$;

revoke all on function public.finalize_executive_strategy_meeting(uuid, bigint)
  from public;
grant execute on function public.finalize_executive_strategy_meeting(uuid, bigint)
  to authenticated;

create or replace function public.update_executive_meeting_action_item(
  p_action_item_id uuid,
  p_expected_version bigint,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_old public.executive_meeting_action_items%rowtype;
  v_new public.executive_meeting_action_items%rowtype;
  v_meeting public.executive_strategy_meetings%rowtype;
  v_project text;
begin
  if p_status not in ('open','in_progress','done','cancelled') then
    raise exception 'EXECUTIVE_MEETING_ACTION_INVALID_STATUS'
      using errcode = '22023';
  end if;

  select * into v_old
  from public.executive_meeting_action_items
  where id = p_action_item_id
  for update;

  if not found then
    raise exception 'EXECUTIVE_MEETING_ACTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_meeting
  from public.executive_strategy_meetings
  where id = v_old.meeting_id;

  if not (
    v_old.owner_user_id = auth.uid()
    or public.projectflow_can_manage_executive_meeting(v_old.meeting_id)
  ) then
    raise exception 'EXECUTIVE_MEETING_ACTION_UPDATE_DENIED'
      using errcode = '42501';
  end if;

  if p_expected_version is null or v_old.version <> p_expected_version then
    raise exception 'EXECUTIVE_MEETING_ACTION_VERSION_MISMATCH'
      using errcode = '40001';
  end if;

  update public.executive_meeting_action_items
  set
    status = p_status,
    completed_at = case
      when p_status = 'done' and v_old.status <> 'done' then now()
      when p_status = 'done' then v_old.completed_at
      when p_status in ('open','in_progress') then null
      else v_old.completed_at
    end,
    version = version + 1,
    updated_at = now()
  where id = p_action_item_id
  returning * into v_new;

  for v_project in
    select project_id
    from public.projectflow_meeting_linked_projects(v_old.meeting_id)
  loop
    perform public.projectflow_append_audit_event(
      v_project,
      'project',
      'executive_meeting_action_updated',
      'executive_meeting_action_item',
      v_new.id::text,
      jsonb_build_object(
        'status', v_old.status,
        'version', v_old.version
      ),
      jsonb_build_object(
        'status', v_new.status,
        'version', v_new.version,
        'completed_at', v_new.completed_at
      ),
      jsonb_build_object(
        'meeting_id', v_old.meeting_id,
        'source', 'executive_meeting'
      )
    );

    insert into public.project_activity (
      project_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    values (
      v_project,
      auth.uid(),
      'executive_meeting_action_updated',
      'executive_meeting_action_item',
      v_new.id::text,
      jsonb_build_object(
        'meeting_id', v_old.meeting_id,
        'title', v_new.title,
        'status', v_new.status
      )
    );
  end loop;

  return to_jsonb(v_new);
end;
$projectflow$;

revoke all on function public.update_executive_meeting_action_item(
  uuid, bigint, text
) from public;
grant execute on function public.update_executive_meeting_action_item(
  uuid, bigint, text
) to authenticated;

create or replace function public.list_executive_strategy_meetings()
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
    'meetings',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'title', m.title,
          'meeting_date', m.meeting_date,
          'period_label', m.period_label,
          'status', m.status,
          'chair_user_id', m.chair_user_id,
          'chair_name', case
            when m.chair_user_id is null then null
            else coalesce(
              nullif(cpr.full_name, ''),
              nullif(split_part(coalesce(cu.email, ''), '@', 1), ''),
              'مستخدم'
            )
          end,
          'summary', m.summary,
          'next_meeting_date', m.next_meeting_date,
          'board_pack_generated_at', m.board_pack_generated_at,
          'finalized_at', m.finalized_at,
          'version', m.version,
          'created_by', m.created_by,
          'created_at', m.created_at,
          'updated_at', m.updated_at,
          'can_edit',
            m.status in ('draft','in_progress')
            and public.projectflow_can_manage_executive_meeting(m.id),
          'attendees', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'user_id', a.user_id,
                'display_name', a.display_name,
                'email_snapshot', a.email_snapshot,
                'role_label', a.role_label,
                'attendance_status', a.attendance_status,
                'created_at', a.created_at
              )
              order by
                case a.attendance_status
                  when 'attended' then 0
                  when 'invited' then 1
                  when 'excused' then 2
                  else 3
                end,
                a.display_name
            )
            from public.executive_meeting_attendees a
            where a.meeting_id = m.id
          ), '[]'::jsonb),
          'decisions', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', d.id,
                'source_decision_id', d.source_decision_id,
                'source_decision_version', d.source_decision_version,
                'objective_id', d.objective_id,
                'objective_title', o.title,
                'project_id', d.project_id,
                'project_name', p.name,
                'title', d.title,
                'outcome', d.outcome,
                'decision_text', d.decision_text,
                'rationale', d.rationale,
                'owner_user_id', d.owner_user_id,
                'owner_name', case
                  when d.owner_user_id is null then null
                  else coalesce(
                    nullif(dpr.full_name, ''),
                    nullif(split_part(coalesce(du.email, ''), '@', 1), ''),
                    'مستخدم'
                  )
                end,
                'follow_up_date', d.follow_up_date,
                'created_at', d.created_at
              )
              order by
                case d.outcome
                  when 'deferred' then 0
                  when 'decided' then 1
                  else 2
                end,
                d.created_at
            )
            from public.executive_meeting_decisions d
            left join public.portfolio_objectives o on o.id = d.objective_id
            left join public.projects p on p.id = d.project_id
            left join auth.users du on du.id = d.owner_user_id
            left join public.profiles dpr on dpr.id = d.owner_user_id
            where d.meeting_id = m.id
          ), '[]'::jsonb),
          'action_items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'decision_id', a.decision_id,
                'objective_id', a.objective_id,
                'objective_title', o.title,
                'project_id', a.project_id,
                'project_name', p.name,
                'title', a.title,
                'description', a.description,
                'owner_user_id', a.owner_user_id,
                'owner_name', case
                  when a.owner_user_id is null then null
                  else coalesce(
                    nullif(apr.full_name, ''),
                    nullif(split_part(coalesce(au.email, ''), '@', 1), ''),
                    'مستخدم'
                  )
                end,
                'due_date', a.due_date,
                'status', a.status,
                'completed_at', a.completed_at,
                'version', a.version,
                'can_update',
                  a.owner_user_id = auth.uid()
                  or public.projectflow_can_manage_executive_meeting(m.id),
                'created_at', a.created_at,
                'updated_at', a.updated_at
              )
              order by
                case a.status
                  when 'in_progress' then 0
                  when 'open' then 1
                  when 'done' then 2
                  else 3
                end,
                a.due_date nulls last,
                a.created_at
            )
            from public.executive_meeting_action_items a
            left join public.portfolio_objectives o on o.id = a.objective_id
            left join public.projects p on p.id = a.project_id
            left join auth.users au on au.id = a.owner_user_id
            left join public.profiles apr on apr.id = a.owner_user_id
            where a.meeting_id = m.id
          ), '[]'::jsonb)
        )
        order by
          case m.status
            when 'in_progress' then 0
            when 'draft' then 1
            when 'completed' then 2
            else 3
          end,
          m.meeting_date desc,
          m.updated_at desc
      )
      from public.executive_strategy_meetings m
      left join auth.users cu on cu.id = m.chair_user_id
      left join public.profiles cpr on cpr.id = m.chair_user_id
      where public.projectflow_can_view_executive_meeting(m.id)
    ), '[]'::jsonb)
  );
end;
$projectflow$;

revoke all on function public.list_executive_strategy_meetings() from public;
grant execute on function public.list_executive_strategy_meetings()
  to authenticated;
