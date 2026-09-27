-- ProjectFlow persistent backend foundation
-- Supabase/PostgreSQL migration. Designed for the visible Project -> Boards model.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  initials text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  status text not null default 'planning'
    check (status in ('planning','active','on_hold','completed','archived')),
  previous_status text
    check (previous_status is null or previous_status in ('planning','active','on_hold','completed')),
  icon text not null default 'م',
  color text not null default 'brand',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.project_members (
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.boards (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  board_type text not null default 'blank',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  is_favorite boolean not null default false,
  last_opened_at timestamptz,
  viewport jsonb not null default '{"x":0,"y":0,"zoom":1}'::jsonb
);

create table if not exists public.canvas_nodes (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  kind text not null,
  x double precision not null default 0,
  y double precision not null default 0,
  width double precision not null default 220,
  height double precision not null default 140,
  title text not null default '',
  description text,
  status text not null default 'idea'
    check (status in ('idea','planned','in_progress','done','blocked')),
  priority text check (priority is null or priority in ('critical','high','medium','low')),
  progress integer not null default 0 check (progress between 0 and 100),
  start_date date,
  due_date date,
  owner_label text,
  tags text[] not null default '{}',
  asset_id text,
  style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.canvas_edges (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  source_node_id text not null references public.canvas_nodes(id) on delete cascade,
  target_node_id text not null references public.canvas_nodes(id) on delete cascade,
  kind text not null default 'relationship'
    check (kind in ('relationship','dependency')),
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_node_id <> target_node_id)
);

create table if not exists public.canvas_strokes (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  tool text not null check (tool in ('pen','highlighter')),
  points jsonb not null default '[]'::jsonb,
  size double precision not null default 3 check (size > 0 and size <= 48),
  color text not null default 'ink',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_versions (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  reason text not null check (reason in ('auto','manual','before_restore','import')),
  label text,
  snapshot jsonb not null,
  node_count integer not null default 0,
  edge_count integer not null default 0,
  stroke_count integer not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.canvas_assets (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  object_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 10485760),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists project_members_user_idx on public.project_members(user_id);
create index if not exists boards_project_idx on public.boards(project_id);
create index if not exists canvas_nodes_board_idx on public.canvas_nodes(board_id);
create index if not exists canvas_nodes_status_idx on public.canvas_nodes(board_id, status);
create index if not exists canvas_nodes_due_idx on public.canvas_nodes(board_id, due_date);
create index if not exists canvas_edges_board_idx on public.canvas_edges(board_id);
create index if not exists canvas_strokes_board_idx on public.canvas_strokes(board_id);
create index if not exists board_versions_board_created_idx
  on public.board_versions(board_id, created_at desc);
create index if not exists canvas_assets_board_idx on public.canvas_assets(board_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists boards_set_updated_at on public.boards;
create trigger boards_set_updated_at
before update on public.boards
for each row execute function public.set_updated_at();

drop trigger if exists canvas_nodes_set_updated_at on public.canvas_nodes;
create trigger canvas_nodes_set_updated_at
before update on public.canvas_nodes
for each row execute function public.set_updated_at();

drop trigger if exists canvas_edges_set_updated_at on public.canvas_edges;
create trigger canvas_edges_set_updated_at
before update on public.canvas_edges
for each row execute function public.set_updated_at();

drop trigger if exists canvas_strokes_set_updated_at on public.canvas_strokes;
create trigger canvas_strokes_set_updated_at
before update on public.canvas_strokes
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'مستخدم'
  );

  insert into public.profiles (id, full_name, initials)
  values (
    new.id,
    display_name,
    left(display_name, 1)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.can_access_project(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        p.created_by = auth.uid()
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p_project_id
            and pm.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_edit_project(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        p.created_by = auth.uid()
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p_project_id
            and pm.user_id = auth.uid()
            and pm.role in ('owner','admin','editor')
        )
      )
  );
$$;

create or replace function public.can_manage_project(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        p.created_by = auth.uid()
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p_project_id
            and pm.user_id = auth.uid()
            and pm.role in ('owner','admin')
        )
      )
  );
$$;

revoke all on function public.can_access_project(text) from public;
revoke all on function public.can_edit_project(text) from public;
revoke all on function public.can_manage_project(text) from public;
grant execute on function public.can_access_project(text) to authenticated;
grant execute on function public.can_edit_project(text) to authenticated;
grant execute on function public.can_manage_project(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.boards enable row level security;
alter table public.canvas_nodes enable row level security;
alter table public.canvas_edges enable row level security;
alter table public.canvas_strokes enable row level security;
alter table public.board_versions enable row level security;
alter table public.canvas_assets enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists projects_select_member on public.projects;
create policy projects_select_member on public.projects
for select to authenticated
using (public.can_access_project(id));

drop policy if exists projects_insert_owner on public.projects;
create policy projects_insert_owner on public.projects
for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists projects_update_editor on public.projects;
create policy projects_update_editor on public.projects
for update to authenticated
using (public.can_edit_project(id))
with check (public.can_edit_project(id));

drop policy if exists projects_delete_manager on public.projects;
create policy projects_delete_manager on public.projects
for delete to authenticated
using (public.can_manage_project(id));

drop policy if exists project_members_select_member on public.project_members;
create policy project_members_select_member on public.project_members
for select to authenticated
using (public.can_access_project(project_id));

drop policy if exists project_members_insert_manager on public.project_members;
create policy project_members_insert_manager on public.project_members
for insert to authenticated
with check (
  public.can_manage_project(project_id)
  or exists (
    select 1 from public.projects p
    where p.id = project_id and p.created_by = auth.uid() and user_id = auth.uid() and role = 'owner'
  )
);

drop policy if exists project_members_update_manager on public.project_members;
create policy project_members_update_manager on public.project_members
for update to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));

drop policy if exists project_members_delete_manager on public.project_members;
create policy project_members_delete_manager on public.project_members
for delete to authenticated
using (public.can_manage_project(project_id));

drop policy if exists boards_select_member on public.boards;
create policy boards_select_member on public.boards
for select to authenticated
using (public.can_access_project(project_id));

drop policy if exists boards_insert_editor on public.boards;
create policy boards_insert_editor on public.boards
for insert to authenticated
with check (created_by = auth.uid() and public.can_edit_project(project_id));

drop policy if exists boards_update_editor on public.boards;
create policy boards_update_editor on public.boards
for update to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

drop policy if exists boards_delete_editor on public.boards;
create policy boards_delete_editor on public.boards
for delete to authenticated
using (public.can_edit_project(project_id));

drop policy if exists canvas_nodes_select_member on public.canvas_nodes;
create policy canvas_nodes_select_member on public.canvas_nodes
for select to authenticated
using (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_access_project(b.project_id)
  )
);

drop policy if exists canvas_nodes_write_editor on public.canvas_nodes;
create policy canvas_nodes_write_editor on public.canvas_nodes
for all to authenticated
using (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_edit_project(b.project_id)
  )
)
with check (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_edit_project(b.project_id)
  )
);

drop policy if exists canvas_edges_select_member on public.canvas_edges;
create policy canvas_edges_select_member on public.canvas_edges
for select to authenticated
using (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_access_project(b.project_id)
  )
);

drop policy if exists canvas_edges_write_editor on public.canvas_edges;
create policy canvas_edges_write_editor on public.canvas_edges
for all to authenticated
using (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_edit_project(b.project_id)
  )
)
with check (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_edit_project(b.project_id)
  )
);

drop policy if exists canvas_strokes_select_member on public.canvas_strokes;
create policy canvas_strokes_select_member on public.canvas_strokes
for select to authenticated
using (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_access_project(b.project_id)
  )
);

drop policy if exists canvas_strokes_write_editor on public.canvas_strokes;
create policy canvas_strokes_write_editor on public.canvas_strokes
for all to authenticated
using (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_edit_project(b.project_id)
  )
)
with check (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_edit_project(b.project_id)
  )
);

drop policy if exists board_versions_select_member on public.board_versions;
create policy board_versions_select_member on public.board_versions
for select to authenticated
using (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_access_project(b.project_id)
  )
);

drop policy if exists board_versions_write_editor on public.board_versions;
create policy board_versions_write_editor on public.board_versions
for all to authenticated
using (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_edit_project(b.project_id)
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_edit_project(b.project_id)
  )
);

drop policy if exists canvas_assets_select_member on public.canvas_assets;
create policy canvas_assets_select_member on public.canvas_assets
for select to authenticated
using (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_access_project(b.project_id)
  )
);

drop policy if exists canvas_assets_write_editor on public.canvas_assets;
create policy canvas_assets_write_editor on public.canvas_assets
for all to authenticated
using (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_edit_project(b.project_id)
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.boards b
    where b.id = board_id and public.can_edit_project(b.project_id)
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'canvas-assets',
  'canvas-assets',
  false,
  10485760,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists canvas_assets_objects_select on storage.objects;
create policy canvas_assets_objects_select on storage.objects
for select to authenticated
using (
  bucket_id = 'canvas-assets'
  and public.can_access_project((storage.foldername(name))[1])
);

drop policy if exists canvas_assets_objects_insert on storage.objects;
create policy canvas_assets_objects_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'canvas-assets'
  and public.can_edit_project((storage.foldername(name))[1])
);

drop policy if exists canvas_assets_objects_update on storage.objects;
create policy canvas_assets_objects_update on storage.objects
for update to authenticated
using (
  bucket_id = 'canvas-assets'
  and public.can_edit_project((storage.foldername(name))[1])
)
with check (
  bucket_id = 'canvas-assets'
  and public.can_edit_project((storage.foldername(name))[1])
);

drop policy if exists canvas_assets_objects_delete on storage.objects;
create policy canvas_assets_objects_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'canvas-assets'
  and public.can_edit_project((storage.foldername(name))[1])
);



create or replace function public.get_board_canvas(p_board_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $
declare
  v_project_id text;
  v_viewport jsonb;
  v_updated_at timestamptz;
begin
  select project_id, viewport, updated_at
    into v_project_id, v_viewport, v_updated_at
  from public.boards
  where id = p_board_id;

  if v_project_id is null or not public.can_access_project(v_project_id) then
    raise exception 'BOARD_ACCESS_DENIED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'board_id', p_board_id,
    'nodes', coalesce((
      select jsonb_agg(to_jsonb(n) - 'owner_label' || jsonb_build_object('owner', n.owner_label)
        order by n.created_at, n.id)
      from public.canvas_nodes n
      where n.board_id = p_board_id
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
      from public.canvas_edges e
      where e.board_id = p_board_id
    ), '[]'::jsonb),
    'strokes', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at, s.id)
      from public.canvas_strokes s
      where s.board_id = p_board_id
    ), '[]'::jsonb),
    'viewport', coalesce(v_viewport, '{"x":0,"y":0,"zoom":1}'::jsonb),
    'updated_at', v_updated_at
  );
end;
$;

create or replace function public.save_board_canvas(
  p_board_id text,
  p_nodes jsonb,
  p_edges jsonb,
  p_strokes jsonb,
  p_viewport jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $
declare
  v_project_id text;
  n jsonb;
  e jsonb;
  s jsonb;
begin
  select project_id into v_project_id
  from public.boards
  where id = p_board_id;

  if v_project_id is null or not public.can_edit_project(v_project_id) then
    raise exception 'BOARD_EDIT_DENIED' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_nodes, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_edges, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_strokes, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_viewport, '{}'::jsonb)) <> 'object'
  then
    raise exception 'INVALID_CANVAS_PAYLOAD' using errcode = '22023';
  end if;

  delete from public.canvas_edges where board_id = p_board_id;
  delete from public.canvas_strokes where board_id = p_board_id;
  delete from public.canvas_nodes where board_id = p_board_id;

  for n in select value from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb))
  loop
    insert into public.canvas_nodes (
      id, board_id, kind, x, y, width, height, title, description,
      status, priority, progress, start_date, due_date, owner_label,
      tags, asset_id, style, created_at, updated_at
    )
    values (
      n->>'id',
      p_board_id,
      coalesce(nullif(n->>'kind',''), 'idea'),
      coalesce((n->>'x')::double precision, 0),
      coalesce((n->>'y')::double precision, 0),
      greatest(1, coalesce((n->>'width')::double precision, 220)),
      greatest(1, coalesce((n->>'height')::double precision, 140)),
      coalesce(n->>'title', ''),
      nullif(n->>'description',''),
      coalesce(nullif(n->>'status',''), 'idea'),
      nullif(n->>'priority',''),
      least(100, greatest(0, coalesce((n->>'progress')::integer, 0))),
      nullif(n->>'start_date','')::date,
      nullif(n->>'due_date','')::date,
      nullif(n->>'owner',''),
      coalesce(array(select jsonb_array_elements_text(coalesce(n->'tags','[]'::jsonb))), '{}'::text[]),
      nullif(n->>'asset_id',''),
      coalesce(n->'style', '{}'::jsonb),
      coalesce(nullif(n->>'created_at','')::timestamptz, now()),
      coalesce(nullif(n->>'updated_at','')::timestamptz, now())
    );
  end loop;

  for e in select value from jsonb_array_elements(coalesce(p_edges, '[]'::jsonb))
  loop
    insert into public.canvas_edges (
      id, board_id, source_node_id, target_node_id, kind, label, created_at, updated_at
    )
    values (
      e->>'id',
      p_board_id,
      e->>'source_node_id',
      e->>'target_node_id',
      coalesce(nullif(e->>'kind',''), 'relationship'),
      nullif(e->>'label',''),
      coalesce(nullif(e->>'created_at','')::timestamptz, now()),
      coalesce(nullif(e->>'updated_at','')::timestamptz, now())
    );
  end loop;

  for s in select value from jsonb_array_elements(coalesce(p_strokes, '[]'::jsonb))
  loop
    insert into public.canvas_strokes (
      id, board_id, tool, points, size, color, created_at, updated_at
    )
    values (
      s->>'id',
      p_board_id,
      coalesce(nullif(s->>'tool',''), 'pen'),
      coalesce(s->'points', '[]'::jsonb),
      least(48, greatest(0.1, coalesce((s->>'size')::double precision, 3))),
      coalesce(nullif(s->>'color',''), 'ink'),
      coalesce(nullif(s->>'created_at','')::timestamptz, now()),
      coalesce(nullif(s->>'updated_at','')::timestamptz, now())
    );
  end loop;

  update public.boards
  set
    viewport = jsonb_build_object(
      'x', coalesce((p_viewport->>'x')::double precision, 0),
      'y', coalesce((p_viewport->>'y')::double precision, 0),
      'zoom', least(2.5, greatest(0.25, coalesce((p_viewport->>'zoom')::double precision, 1)))
    ),
    updated_at = now()
  where id = p_board_id;
end;
$;

revoke all on function public.get_board_canvas(text) from public;
revoke all on function public.save_board_canvas(text, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.get_board_canvas(text) to authenticated;
grant execute on function public.save_board_canvas(text, jsonb, jsonb, jsonb, jsonb) to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.boards to authenticated;
grant select, insert, update, delete on public.canvas_nodes to authenticated;
grant select, insert, update, delete on public.canvas_edges to authenticated;
grant select, insert, update, delete on public.canvas_strokes to authenticated;
grant select, insert, update, delete on public.board_versions to authenticated;
grant select, insert, update, delete on public.canvas_assets to authenticated;
