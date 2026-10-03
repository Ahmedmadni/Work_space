-- Phase 28: Decisions, Risks & Executive Action Center.

insert into public.projectflow_schema_versions (version, label)
values (19, 'decisions-risks-executive-action-center')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.project_risks (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  severity text not null default 'medium'
    check (severity in ('low','medium','high','critical')),
  status text not null default 'open'
    check (status in ('open','mitigating','accepted','closed')),
  owner_user_id uuid,
  mitigation text,
  due_date date,
  board_id text references public.boards(id) on delete set null,
  node_id text,
  version bigint not null default 1,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  title text not null,
  decision text not null,
  rationale text,
  status text not null default 'proposed'
    check (status in ('proposed','decided','superseded','cancelled')),
  owner_user_id uuid,
  decided_at timestamptz,
  board_id text references public.boards(id) on delete set null,
  node_id text,
  version bigint not null default 1,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_risks_project_status_idx
  on public.project_risks(project_id, status, severity, due_date);
create index if not exists project_risks_owner_idx
  on public.project_risks(project_id, owner_user_id);
create index if not exists project_decisions_project_status_idx
  on public.project_decisions(project_id, status, created_at desc);

alter table public.project_risks enable row level security;
alter table public.project_decisions enable row level security;

revoke all on table public.project_risks from anon, authenticated;
revoke all on table public.project_decisions from anon, authenticated;

create or replace function public.projectflow_validate_action_link(
  p_project_id text,
  p_board_id text,
  p_node_id text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
begin
  if p_board_id is null and p_node_id is null then
    return;
  end if;

  if p_board_id is null and p_node_id is not null then
    raise exception 'ACTION_NODE_REQUIRES_BOARD' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.boards b
    where b.id = p_board_id
      and b.project_id = p_project_id
  ) then
    raise exception 'ACTION_BOARD_NOT_IN_PROJECT' using errcode = '22023';
  end if;

  if p_node_id is not null and not exists (
    select 1
    from public.canvas_nodes n
    where n.id = p_node_id
      and n.board_id = p_board_id
  ) then
    raise exception 'ACTION_NODE_NOT_IN_BOARD' using errcode = '22023';
  end if;
end;
$projectflow$;

revoke all on function public.projectflow_validate_action_link(text, text, text)
  from public;

create or replace function public.projectflow_validate_action_owner(
  p_project_id text,
  p_owner_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
begin
  if p_owner_user_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        p.created_by = p_owner_user_id
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p_project_id
            and pm.user_id = p_owner_user_id
            and pm.role in ('owner','admin','editor')
        )
      )
  ) then
    raise exception 'ACTION_OWNER_NOT_IN_PROJECT' using errcode = '22023';
  end if;
end;
$projectflow$;

revoke all on function public.projectflow_validate_action_owner(text, uuid)
  from public;

create or replace function public.save_project_risk(
  p_project_id text,
  p_risk_id uuid,
  p_expected_version bigint,
  p_title text,
  p_description text,
  p_severity text,
  p_status text,
  p_owner_user_id uuid,
  p_mitigation text,
  p_due_date date,
  p_board_id text,
  p_node_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_id uuid := coalesce(p_risk_id, gen_random_uuid());
  v_old public.project_risks%rowtype;
  v_new public.project_risks%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_mitigation text := nullif(trim(coalesce(p_mitigation, '')), '');
begin
  if not public.can_edit_project(p_project_id) then
    raise exception 'RISK_EDIT_DENIED' using errcode = '42501';
  end if;

  if char_length(v_title) not between 1 and 200
     or char_length(coalesce(v_description, '')) > 4000
     or char_length(coalesce(v_mitigation, '')) > 4000
     or p_severity not in ('low','medium','high','critical')
     or p_status not in ('open','mitigating','accepted','closed')
  then
    raise exception 'RISK_INVALID_INPUT' using errcode = '22023';
  end if;

  perform public.projectflow_validate_action_owner(
    p_project_id,
    p_owner_user_id
  );
  perform public.projectflow_validate_action_link(
    p_project_id,
    p_board_id,
    p_node_id
  );

  if p_risk_id is null then
    insert into public.project_risks (
      id, project_id, title, description, severity, status,
      owner_user_id, mitigation, due_date, board_id, node_id, created_by
    )
    values (
      v_id, p_project_id, v_title, v_description, p_severity, p_status,
      p_owner_user_id, v_mitigation, p_due_date, p_board_id, p_node_id, auth.uid()
    )
    returning * into v_new;

    perform public.projectflow_append_audit_event(
      p_project_id,
      'project',
      'risk_created',
      'project_risk',
      v_id::text,
      null,
      jsonb_build_object(
        'title', v_new.title,
        'severity', v_new.severity,
        'status', v_new.status,
        'owner_user_id', v_new.owner_user_id,
        'due_date', v_new.due_date
      ),
      jsonb_build_object(
        'board_id', v_new.board_id,
        'node_id', v_new.node_id
      )
    );

    insert into public.project_activity (
      project_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    values (
      p_project_id, auth.uid(), 'risk_created', 'project_risk', v_id::text,
      jsonb_build_object('title', v_new.title, 'severity', v_new.severity)
    );
  else
    select * into v_old
    from public.project_risks
    where id = p_risk_id
      and project_id = p_project_id
    for update;

    if not found then
      raise exception 'RISK_NOT_FOUND' using errcode = 'P0002';
    end if;

    if p_expected_version is null or v_old.version <> p_expected_version then
      raise exception 'RISK_VERSION_MISMATCH' using errcode = '40001';
    end if;

    update public.project_risks
    set
      title = v_title,
      description = v_description,
      severity = p_severity,
      status = p_status,
      owner_user_id = p_owner_user_id,
      mitigation = v_mitigation,
      due_date = p_due_date,
      board_id = p_board_id,
      node_id = p_node_id,
      version = version + 1,
      updated_at = now()
    where id = p_risk_id
      and project_id = p_project_id
    returning * into v_new;

    perform public.projectflow_append_audit_event(
      p_project_id,
      'project',
      'risk_updated',
      'project_risk',
      v_new.id::text,
      jsonb_build_object(
        'title', v_old.title,
        'severity', v_old.severity,
        'status', v_old.status,
        'owner_user_id', v_old.owner_user_id,
        'due_date', v_old.due_date
      ),
      jsonb_build_object(
        'title', v_new.title,
        'severity', v_new.severity,
        'status', v_new.status,
        'owner_user_id', v_new.owner_user_id,
        'due_date', v_new.due_date
      ),
      jsonb_build_object(
        'board_id', v_new.board_id,
        'node_id', v_new.node_id
      )
    );

    insert into public.project_activity (
      project_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    values (
      p_project_id, auth.uid(), 'risk_updated', 'project_risk', v_new.id::text,
      jsonb_build_object(
        'title', v_new.title,
        'severity', v_new.severity,
        'status', v_new.status
      )
    );
  end if;

  return to_jsonb(v_new);
end;
$projectflow$;

revoke all on function public.save_project_risk(
  text, uuid, bigint, text, text, text, text, uuid, text, date, text, text
) from public;
grant execute on function public.save_project_risk(
  text, uuid, bigint, text, text, text, text, uuid, text, date, text, text
) to authenticated;

create or replace function public.save_project_decision(
  p_project_id text,
  p_decision_id uuid,
  p_expected_version bigint,
  p_title text,
  p_decision text,
  p_rationale text,
  p_status text,
  p_owner_user_id uuid,
  p_board_id text,
  p_node_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_id uuid := coalesce(p_decision_id, gen_random_uuid());
  v_old public.project_decisions%rowtype;
  v_new public.project_decisions%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_decision text := trim(coalesce(p_decision, ''));
  v_rationale text := nullif(trim(coalesce(p_rationale, '')), '');
begin
  if not public.can_edit_project(p_project_id) then
    raise exception 'DECISION_EDIT_DENIED' using errcode = '42501';
  end if;

  if char_length(v_title) not between 1 and 200
     or char_length(v_decision) not between 1 and 5000
     or char_length(coalesce(v_rationale, '')) > 5000
     or p_status not in ('proposed','decided','superseded','cancelled')
  then
    raise exception 'DECISION_INVALID_INPUT' using errcode = '22023';
  end if;

  perform public.projectflow_validate_action_owner(
    p_project_id,
    p_owner_user_id
  );
  perform public.projectflow_validate_action_link(
    p_project_id,
    p_board_id,
    p_node_id
  );

  if p_decision_id is null then
    insert into public.project_decisions (
      id, project_id, title, decision, rationale, status,
      owner_user_id, decided_at, board_id, node_id, created_by
    )
    values (
      v_id, p_project_id, v_title, v_decision, v_rationale, p_status,
      p_owner_user_id,
      case when p_status = 'decided' then now() else null end,
      p_board_id, p_node_id, auth.uid()
    )
    returning * into v_new;

    perform public.projectflow_append_audit_event(
      p_project_id,
      'project',
      'decision_created',
      'project_decision',
      v_id::text,
      null,
      jsonb_build_object(
        'title', v_new.title,
        'status', v_new.status,
        'owner_user_id', v_new.owner_user_id,
        'decided_at', v_new.decided_at
      ),
      jsonb_build_object(
        'board_id', v_new.board_id,
        'node_id', v_new.node_id
      )
    );

    insert into public.project_activity (
      project_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    values (
      p_project_id, auth.uid(), 'decision_created', 'project_decision', v_id::text,
      jsonb_build_object('title', v_new.title, 'status', v_new.status)
    );
  else
    select * into v_old
    from public.project_decisions
    where id = p_decision_id
      and project_id = p_project_id
    for update;

    if not found then
      raise exception 'DECISION_NOT_FOUND' using errcode = 'P0002';
    end if;

    if p_expected_version is null or v_old.version <> p_expected_version then
      raise exception 'DECISION_VERSION_MISMATCH' using errcode = '40001';
    end if;

    update public.project_decisions
    set
      title = v_title,
      decision = v_decision,
      rationale = v_rationale,
      status = p_status,
      owner_user_id = p_owner_user_id,
      decided_at = case
        when p_status = 'decided' and v_old.status <> 'decided' then now()
        when p_status = 'decided' then v_old.decided_at
        else v_old.decided_at
      end,
      board_id = p_board_id,
      node_id = p_node_id,
      version = version + 1,
      updated_at = now()
    where id = p_decision_id
      and project_id = p_project_id
    returning * into v_new;

    perform public.projectflow_append_audit_event(
      p_project_id,
      'project',
      'decision_updated',
      'project_decision',
      v_new.id::text,
      jsonb_build_object(
        'title', v_old.title,
        'status', v_old.status,
        'owner_user_id', v_old.owner_user_id,
        'decided_at', v_old.decided_at
      ),
      jsonb_build_object(
        'title', v_new.title,
        'status', v_new.status,
        'owner_user_id', v_new.owner_user_id,
        'decided_at', v_new.decided_at
      ),
      jsonb_build_object(
        'board_id', v_new.board_id,
        'node_id', v_new.node_id
      )
    );

    insert into public.project_activity (
      project_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    values (
      p_project_id, auth.uid(), 'decision_updated', 'project_decision', v_new.id::text,
      jsonb_build_object('title', v_new.title, 'status', v_new.status)
    );
  end if;

  return to_jsonb(v_new);
end;
$projectflow$;

revoke all on function public.save_project_decision(
  text, uuid, bigint, text, text, text, text, uuid, text, text
) from public;
grant execute on function public.save_project_decision(
  text, uuid, bigint, text, text, text, text, uuid, text, text
) to authenticated;

create or replace function public.list_project_action_center(
  p_project_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'ACTION_CENTER_LIST_DENIED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'risks',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'project_id', r.project_id,
          'title', r.title,
          'description', r.description,
          'severity', r.severity,
          'status', r.status,
          'owner_user_id', r.owner_user_id,
          'owner_name', case
            when r.owner_user_id is null then null
            else coalesce(
              nullif(pr.full_name, ''),
              nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
              'مستخدم'
            )
          end,
          'mitigation', r.mitigation,
          'due_date', r.due_date,
          'board_id', r.board_id,
          'board_name', b.name,
          'node_id', r.node_id,
          'node_title', n.title,
          'version', r.version,
          'created_at', r.created_at,
          'updated_at', r.updated_at
        )
        order by
          case r.status
            when 'open' then 0
            when 'mitigating' then 1
            when 'accepted' then 2
            else 3
          end,
          case r.severity
            when 'critical' then 0
            when 'high' then 1
            when 'medium' then 2
            else 3
          end,
          r.due_date nulls last,
          r.updated_at desc
      )
      from public.project_risks r
      left join auth.users u on u.id = r.owner_user_id
      left join public.profiles pr on pr.id = r.owner_user_id
      left join public.boards b on b.id = r.board_id
      left join public.canvas_nodes n
        on n.id = r.node_id
        and n.board_id = r.board_id
      where r.project_id = p_project_id
    ), '[]'::jsonb),
    'decisions',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'project_id', d.project_id,
          'title', d.title,
          'decision', d.decision,
          'rationale', d.rationale,
          'status', d.status,
          'owner_user_id', d.owner_user_id,
          'owner_name', case
            when d.owner_user_id is null then null
            else coalesce(
              nullif(pr.full_name, ''),
              nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
              'مستخدم'
            )
          end,
          'decided_at', d.decided_at,
          'board_id', d.board_id,
          'board_name', b.name,
          'node_id', d.node_id,
          'node_title', n.title,
          'version', d.version,
          'created_at', d.created_at,
          'updated_at', d.updated_at
        )
        order by
          case d.status
            when 'proposed' then 0
            when 'decided' then 1
            when 'superseded' then 2
            else 3
          end,
          coalesce(d.decided_at, d.created_at) desc
      )
      from public.project_decisions d
      left join auth.users u on u.id = d.owner_user_id
      left join public.profiles pr on pr.id = d.owner_user_id
      left join public.boards b on b.id = d.board_id
      left join public.canvas_nodes n
        on n.id = d.node_id
        and n.board_id = d.board_id
      where d.project_id = p_project_id
    ), '[]'::jsonb),
    'summary',
    jsonb_build_object(
      'active_risks', (
        select count(*)
        from public.project_risks r
        where r.project_id = p_project_id
          and r.status in ('open','mitigating')
      ),
      'critical_high_risks', (
        select count(*)
        from public.project_risks r
        where r.project_id = p_project_id
          and r.status in ('open','mitigating')
          and r.severity in ('critical','high')
      ),
      'overdue_mitigations', (
        select count(*)
        from public.project_risks r
        where r.project_id = p_project_id
          and r.status in ('open','mitigating')
          and r.due_date is not null
          and r.due_date < current_date
      ),
      'accepted_risks', (
        select count(*)
        from public.project_risks r
        where r.project_id = p_project_id
          and r.status = 'accepted'
      ),
      'pending_decisions', (
        select count(*)
        from public.project_decisions d
        where d.project_id = p_project_id
          and d.status = 'proposed'
      ),
      'decided_30d', (
        select count(*)
        from public.project_decisions d
        where d.project_id = p_project_id
          and d.status = 'decided'
          and d.decided_at >= now() - interval '30 days'
      )
    )
  );
end;
$projectflow$;

revoke all on function public.list_project_action_center(text) from public;
grant execute on function public.list_project_action_center(text)
  to authenticated;
