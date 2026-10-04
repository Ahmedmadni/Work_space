-- Phase 30: Portfolio Goals, OKRs & Strategic Alignment.

insert into public.projectflow_schema_versions (version, label)
values (21, 'portfolio-okrs-strategic-alignment')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

create table if not exists public.portfolio_objectives (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'active'
    check (status in ('draft','active','achieved','paused','cancelled')),
  owner_user_id uuid references auth.users(id) on delete set null,
  start_date date,
  due_date date,
  version bigint not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or due_date is null or start_date <= due_date)
);

create table if not exists public.objective_key_results (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.portfolio_objectives(id) on delete cascade,
  title text not null,
  unit text,
  direction text not null default 'increase'
    check (direction in ('increase','decrease')),
  baseline_value numeric not null default 0,
  target_value numeric not null,
  current_value numeric not null default 0,
  weight numeric not null default 1 check (weight > 0 and weight <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (direction = 'increase' and target_value >= baseline_value)
    or
    (direction = 'decrease' and target_value <= baseline_value)
  )
);

create table if not exists public.objective_project_links (
  objective_id uuid not null references public.portfolio_objectives(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (objective_id, project_id)
);

create table if not exists public.objective_milestone_links (
  objective_id uuid not null references public.portfolio_objectives(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  node_id text not null,
  created_at timestamptz not null default now(),
  primary key (objective_id, node_id)
);

create index if not exists portfolio_objectives_creator_idx
  on public.portfolio_objectives(created_by, status, due_date);
create index if not exists portfolio_objectives_owner_idx
  on public.portfolio_objectives(owner_user_id, status, due_date);
create index if not exists objective_project_links_project_idx
  on public.objective_project_links(project_id, objective_id);
create index if not exists objective_milestone_links_project_idx
  on public.objective_milestone_links(project_id, objective_id);

alter table public.portfolio_objectives enable row level security;
alter table public.objective_key_results enable row level security;
alter table public.objective_project_links enable row level security;
alter table public.objective_milestone_links enable row level security;

revoke all on table public.portfolio_objectives from anon, authenticated;
revoke all on table public.objective_key_results from anon, authenticated;
revoke all on table public.objective_project_links from anon, authenticated;
revoke all on table public.objective_milestone_links from anon, authenticated;

create or replace function public.projectflow_can_view_objective(
  p_objective_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $projectflow$
  select exists (
    select 1
    from public.portfolio_objectives o
    where o.id = p_objective_id
      and (
        o.created_by = auth.uid()
        or o.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.objective_project_links opl
          where opl.objective_id = o.id
            and public.can_access_project(opl.project_id)
        )
      )
  );
$projectflow$;

revoke all on function public.projectflow_can_view_objective(uuid) from public;

create or replace function public.projectflow_can_edit_objective(
  p_objective_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $projectflow$
  select exists (
    select 1
    from public.portfolio_objectives o
    where o.id = p_objective_id
      and (o.created_by = auth.uid() or o.owner_user_id = auth.uid())
  );
$projectflow$;

revoke all on function public.projectflow_can_edit_objective(uuid) from public;

create or replace function public.save_portfolio_objective(
  p_objective_id uuid,
  p_expected_version bigint,
  p_title text,
  p_description text,
  p_status text,
  p_owner_user_id uuid,
  p_start_date date,
  p_due_date date,
  p_key_results jsonb,
  p_project_ids jsonb,
  p_milestones jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_id uuid := coalesce(p_objective_id, gen_random_uuid());
  v_old public.portfolio_objectives%rowtype;
  v_new public.portfolio_objectives%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_row jsonb;
  v_project_id text;
  v_board_id text;
  v_node_id text;
  v_kr_id uuid;
  v_linked_projects text[] := array[]::text[];
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if char_length(v_title) not between 1 and 200
     or char_length(coalesce(v_description, '')) > 5000
     or p_status not in ('draft','active','achieved','paused','cancelled')
     or (p_start_date is not null and p_due_date is not null and p_start_date > p_due_date)
     or jsonb_typeof(coalesce(p_key_results, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_project_ids, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_milestones, '[]'::jsonb)) <> 'array'
  then
    raise exception 'OBJECTIVE_INVALID_INPUT' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_key_results, '[]'::jsonb)) > 30
     or jsonb_array_length(coalesce(p_project_ids, '[]'::jsonb)) > 100
     or jsonb_array_length(coalesce(p_milestones, '[]'::jsonb)) > 200
  then
    raise exception 'OBJECTIVE_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  for v_row in
    select value from jsonb_array_elements(coalesce(p_project_ids, '[]'::jsonb))
  loop
    v_project_id := trim(both '"' from v_row::text);
    if not public.can_access_project(v_project_id) then
      raise exception 'OBJECTIVE_PROJECT_ACCESS_DENIED:%', v_project_id
        using errcode = '42501';
    end if;
    if not (v_project_id = any(v_linked_projects)) then
      v_linked_projects := array_append(v_linked_projects, v_project_id);
    end if;
  end loop;

  for v_row in
    select value from jsonb_array_elements(coalesce(p_milestones, '[]'::jsonb))
  loop
    v_project_id := nullif(v_row->>'project_id', '');
    v_board_id := nullif(v_row->>'board_id', '');
    v_node_id := nullif(v_row->>'node_id', '');

    if v_project_id is null or v_board_id is null or v_node_id is null
       or not public.can_access_project(v_project_id)
       or not exists (
         select 1
         from public.canvas_nodes n
         join public.boards b on b.id = n.board_id
         where n.id = v_node_id
           and n.board_id = v_board_id
           and n.kind = 'milestone'
           and b.project_id = v_project_id
       )
    then
      raise exception 'OBJECTIVE_MILESTONE_INVALID:%', coalesce(v_node_id, '?')
        using errcode = '22023';
    end if;

    if not (v_project_id = any(v_linked_projects)) then
      v_linked_projects := array_append(v_linked_projects, v_project_id);
    end if;
  end loop;

  if p_owner_user_id is not null and p_owner_user_id <> auth.uid() then
    if coalesce(array_length(v_linked_projects, 1), 0) = 0
       or not exists (
         select 1
         from unnest(v_linked_projects) as linked(project_id)
         join public.projects p on p.id = linked.project_id
         where p.created_by = p_owner_user_id
            or exists (
              select 1
              from public.project_members pm
              where pm.project_id = linked.project_id
                and pm.user_id = p_owner_user_id
            )
       )
    then
      raise exception 'OBJECTIVE_OWNER_INVALID' using errcode = '22023';
    end if;
  end if;

  if p_objective_id is null then
    insert into public.portfolio_objectives (
      id, title, description, status, owner_user_id,
      start_date, due_date, created_by
    )
    values (
      v_id, v_title, v_description, p_status, p_owner_user_id,
      p_start_date, p_due_date, auth.uid()
    )
    returning * into v_new;
  else
    select * into v_old
    from public.portfolio_objectives
    where id = p_objective_id
    for update;

    if not found then
      raise exception 'OBJECTIVE_NOT_FOUND' using errcode = 'P0002';
    end if;

    if not public.projectflow_can_edit_objective(p_objective_id) then
      raise exception 'OBJECTIVE_EDIT_DENIED' using errcode = '42501';
    end if;

    if p_expected_version is null or v_old.version <> p_expected_version then
      raise exception 'OBJECTIVE_VERSION_MISMATCH' using errcode = '40001';
    end if;

    update public.portfolio_objectives
    set
      title = v_title,
      description = v_description,
      status = p_status,
      owner_user_id = p_owner_user_id,
      start_date = p_start_date,
      due_date = p_due_date,
      version = version + 1,
      updated_at = now()
    where id = p_objective_id
    returning * into v_new;
  end if;

  delete from public.objective_key_results where objective_id = v_id;
  for v_row in
    select value from jsonb_array_elements(coalesce(p_key_results, '[]'::jsonb))
  loop
    if char_length(trim(coalesce(v_row->>'title', ''))) not between 1 and 200
       or coalesce((v_row->>'weight')::numeric, 1) <= 0
       or coalesce((v_row->>'weight')::numeric, 1) > 1000
       or coalesce(v_row->>'direction', 'increase') not in ('increase','decrease')
    then
      raise exception 'KEY_RESULT_INVALID_INPUT' using errcode = '22023';
    end if;

    if coalesce(v_row->>'direction', 'increase') = 'increase'
       and (v_row->>'target_value')::numeric < (v_row->>'baseline_value')::numeric
    then
      raise exception 'KEY_RESULT_DIRECTION_MISMATCH' using errcode = '22023';
    end if;

    if coalesce(v_row->>'direction', 'increase') = 'decrease'
       and (v_row->>'target_value')::numeric > (v_row->>'baseline_value')::numeric
    then
      raise exception 'KEY_RESULT_DIRECTION_MISMATCH' using errcode = '22023';
    end if;

    begin
      v_kr_id := coalesce(nullif(v_row->>'id', '')::uuid, gen_random_uuid());
    exception when invalid_text_representation then
      v_kr_id := gen_random_uuid();
    end;

    insert into public.objective_key_results (
      id, objective_id, title, unit, direction,
      baseline_value, target_value, current_value, weight
    )
    values (
      v_kr_id,
      v_id,
      trim(v_row->>'title'),
      nullif(trim(coalesce(v_row->>'unit', '')), ''),
      coalesce(v_row->>'direction', 'increase'),
      (v_row->>'baseline_value')::numeric,
      (v_row->>'target_value')::numeric,
      (v_row->>'current_value')::numeric,
      coalesce((v_row->>'weight')::numeric, 1)
    );
  end loop;

  delete from public.objective_project_links where objective_id = v_id;
  foreach v_project_id in array v_linked_projects
  loop
    insert into public.objective_project_links (objective_id, project_id)
    values (v_id, v_project_id)
    on conflict do nothing;
  end loop;

  delete from public.objective_milestone_links where objective_id = v_id;
  for v_row in
    select value from jsonb_array_elements(coalesce(p_milestones, '[]'::jsonb))
  loop
    insert into public.objective_milestone_links (
      objective_id, project_id, board_id, node_id
    )
    values (
      v_id,
      v_row->>'project_id',
      v_row->>'board_id',
      v_row->>'node_id'
    )
    on conflict do nothing;
  end loop;

  foreach v_project_id in array v_linked_projects
  loop
    perform public.projectflow_append_audit_event(
      v_project_id,
      'project',
      case when p_objective_id is null
        then 'strategic_objective_linked'
        else 'strategic_objective_updated'
      end,
      'portfolio_objective',
      v_id::text,
      case when p_objective_id is null then null else
        jsonb_build_object(
          'title', v_old.title,
          'status', v_old.status,
          'owner_user_id', v_old.owner_user_id,
          'due_date', v_old.due_date
        )
      end,
      jsonb_build_object(
        'title', v_new.title,
        'status', v_new.status,
        'owner_user_id', v_new.owner_user_id,
        'due_date', v_new.due_date
      ),
      jsonb_build_object('source', 'portfolio_strategy')
    );

    insert into public.project_activity (
      project_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      v_project_id,
      auth.uid(),
      case when p_objective_id is null
        then 'strategic_objective_linked'
        else 'strategic_objective_updated'
      end,
      'portfolio_objective',
      v_id::text,
      jsonb_build_object(
        'title', v_new.title,
        'status', v_new.status,
        'due_date', v_new.due_date
      )
    );
  end loop;

  return jsonb_build_object(
    'id', v_new.id,
    'version', v_new.version
  );
end;
$projectflow$;

revoke all on function public.save_portfolio_objective(
  uuid, bigint, text, text, text, uuid, date, date, jsonb, jsonb, jsonb
) from public;
grant execute on function public.save_portfolio_objective(
  uuid, bigint, text, text, text, uuid, date, date, jsonb, jsonb, jsonb
) to authenticated;

create or replace function public.list_portfolio_strategy()
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
    'objectives',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'title', o.title,
          'description', o.description,
          'status', o.status,
          'owner_user_id', o.owner_user_id,
          'owner_name', case
            when o.owner_user_id is null then null
            else coalesce(
              nullif(pr.full_name, ''),
              nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
              'مستخدم'
            )
          end,
          'start_date', o.start_date,
          'due_date', o.due_date,
          'version', o.version,
          'created_by', o.created_by,
          'can_edit', (o.created_by = auth.uid() or o.owner_user_id = auth.uid()),
          'created_at', o.created_at,
          'updated_at', o.updated_at,
          'key_results', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', kr.id,
                'title', kr.title,
                'unit', kr.unit,
                'direction', kr.direction,
                'baseline_value', kr.baseline_value,
                'target_value', kr.target_value,
                'current_value', kr.current_value,
                'weight', kr.weight
              )
              order by kr.created_at, kr.id
            )
            from public.objective_key_results kr
            where kr.objective_id = o.id
          ), '[]'::jsonb),
          'project_ids', coalesce((
            select jsonb_agg(opl.project_id order by opl.project_id)
            from public.objective_project_links opl
            where opl.objective_id = o.id
          ), '[]'::jsonb),
          'milestones', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'project_id', oml.project_id,
                'board_id', oml.board_id,
                'node_id', oml.node_id,
                'board_name', b.name,
                'node_title', n.title,
                'status', n.status,
                'progress', n.progress,
                'due_date', n.due_date
              )
              order by p.name, b.name, n.title
            )
            from public.objective_milestone_links oml
            join public.projects p on p.id = oml.project_id
            join public.boards b on b.id = oml.board_id
            join public.canvas_nodes n
              on n.id = oml.node_id
              and n.board_id = oml.board_id
            where oml.objective_id = o.id
          ), '[]'::jsonb)
        )
        order by
          case o.status
            when 'active' then 0
            when 'draft' then 1
            when 'paused' then 2
            when 'achieved' then 3
            else 4
          end,
          o.due_date nulls last,
          o.updated_at desc
      )
      from public.portfolio_objectives o
      left join auth.users u on u.id = o.owner_user_id
      left join public.profiles pr on pr.id = o.owner_user_id
      where o.created_by = auth.uid()
         or o.owner_user_id = auth.uid()
         or exists (
           select 1
           from public.objective_project_links opl
           where opl.objective_id = o.id
             and public.can_access_project(opl.project_id)
         )
    ), '[]'::jsonb)
  );
end;
$projectflow$;

revoke all on function public.list_portfolio_strategy() from public;
grant execute on function public.list_portfolio_strategy() to authenticated;
