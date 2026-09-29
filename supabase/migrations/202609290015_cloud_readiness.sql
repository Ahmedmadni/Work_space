-- Phase 23: cloud backend readiness contract.
-- Provides a safe public probe that confirms the database has the feature set
-- required by the current frontend before VITE_DATA_BACKEND is switched on.

create table if not exists public.projectflow_schema_versions (
  version integer primary key check (version > 0),
  label text not null,
  applied_at timestamptz not null default now()
);

insert into public.projectflow_schema_versions (version, label)
values (15, 'cloud-readiness-contract')
on conflict (version) do update
set
  label = excluded.label,
  applied_at = excluded.applied_at;

revoke all on public.projectflow_schema_versions from anon, authenticated;

create or replace function public.get_projectflow_backend_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $projectflow$
declare
  v_version integer := 0;
  v_missing jsonb := '[]'::jsonb;
  v_present integer := 0;
  v_required integer := 0;
  v_item record;
begin
  select coalesce(max(version), 0)
  into v_version
  from public.projectflow_schema_versions;

  for v_item in
    select *
    from (
      values
        ('table:projects',
          to_regclass('public.projects') is not null),
        ('table:boards',
          to_regclass('public.boards') is not null),
        ('table:canvas_nodes',
          to_regclass('public.canvas_nodes') is not null),
        ('table:canvas_edges',
          to_regclass('public.canvas_edges') is not null),
        ('table:project_documents',
          to_regclass('public.project_documents') is not null),
        ('table:project_members',
          to_regclass('public.project_members') is not null),
        ('table:canvas_node_assignments',
          to_regclass('public.canvas_node_assignments') is not null),
        ('table:project_automation_rules',
          to_regclass('public.project_automation_rules') is not null),
        ('table:project_automation_runs',
          to_regclass('public.project_automation_runs') is not null),
        ('table:project_audit_events',
          to_regclass('public.project_audit_events') is not null),
        ('table:project_node_planning',
          to_regclass('public.project_node_planning') is not null),
        ('table:project_member_capacity',
          to_regclass('public.project_member_capacity') is not null),
        ('table:project_schedule_baselines',
          to_regclass('public.project_schedule_baselines') is not null),
        ('function:get_board_canvas',
          exists (
            select 1
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname = 'get_board_canvas'
          )),
        ('function:save_board_canvas',
          exists (
            select 1
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname = 'save_board_canvas'
          )),
        ('function:update_canvas_node_execution',
          exists (
            select 1
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname = 'update_canvas_node_execution'
          )),
        ('function:list_project_automation_rules',
          exists (
            select 1
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname = 'list_project_automation_rules'
          )),
        ('function:get_project_automation_health',
          exists (
            select 1
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname = 'get_project_automation_health'
          )),
        ('function:list_project_audit_events',
          exists (
            select 1
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname = 'list_project_audit_events'
          )),
        ('function:list_project_planning_data',
          exists (
            select 1
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname = 'list_project_planning_data'
          )),
        ('column:canvas_nodes.version',
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'canvas_nodes'
              and column_name = 'version'
          )),
        ('column:boards.canvas_revision',
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'boards'
              and column_name = 'canvas_revision'
          ))
    ) as checks(name, present)
  loop
    v_required := v_required + 1;
    if v_item.present then
      v_present := v_present + 1;
    else
      v_missing := v_missing || jsonb_build_array(v_item.name);
    end if;
  end loop;

  return jsonb_build_object(
    'ready',
      v_version >= 15
      and jsonb_array_length(v_missing) = 0,
    'schema_version', v_version,
    'expected_schema_version', 15,
    'checks_passed', v_present,
    'checks_total', v_required,
    'missing', v_missing,
    'checked_at', now(),
    'backend_contract', 'projectflow.cloud.v1'
  );
end;
$projectflow$;

revoke all on function public.get_projectflow_backend_readiness() from public;
grant execute on function public.get_projectflow_backend_readiness()
  to anon, authenticated;
