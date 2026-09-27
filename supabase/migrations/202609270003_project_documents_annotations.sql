-- Phase 10: project documents + per-page annotations

create table if not exists public.project_documents (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 220),
  mime_type text not null check (
    mime_type in (
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif'
    )
  ),
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 52428800),
  object_path text not null unique,
  page_count integer check (page_count is null or page_count > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_annotations (
  id text primary key,
  document_id text not null references public.project_documents(id) on delete cascade,
  page_number integer not null default 1 check (page_number > 0),
  kind text not null check (kind in ('pen','highlight','rectangle')),
  geometry jsonb not null default '{}'::jsonb,
  color text not null default '#111827',
  size double precision not null default 3 check (size > 0 and size <= 64),
  opacity double precision not null default 1 check (opacity >= 0 and opacity <= 1),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_documents_project_created_idx
  on public.project_documents(project_id, created_at desc);

create index if not exists document_annotations_document_page_idx
  on public.document_annotations(document_id, page_number, created_at);

drop trigger if exists project_documents_set_updated_at on public.project_documents;
create trigger project_documents_set_updated_at
before update on public.project_documents
for each row execute function public.set_updated_at();

drop trigger if exists document_annotations_set_updated_at on public.document_annotations;
create trigger document_annotations_set_updated_at
before update on public.document_annotations
for each row execute function public.set_updated_at();

alter table public.project_documents enable row level security;
alter table public.document_annotations enable row level security;

drop policy if exists project_documents_select_member on public.project_documents;
create policy project_documents_select_member on public.project_documents
for select to authenticated
using (public.can_access_project(project_id));

drop policy if exists project_documents_write_editor on public.project_documents;
create policy project_documents_write_editor on public.project_documents
for all to authenticated
using (public.can_edit_project(project_id))
with check (
  created_by = auth.uid()
  and public.can_edit_project(project_id)
);

drop policy if exists document_annotations_select_member on public.document_annotations;
create policy document_annotations_select_member on public.document_annotations
for select to authenticated
using (
  exists (
    select 1
    from public.project_documents d
    where d.id = document_id
      and public.can_access_project(d.project_id)
  )
);

drop policy if exists document_annotations_write_editor on public.document_annotations;
create policy document_annotations_write_editor on public.document_annotations
for all to authenticated
using (
  exists (
    select 1
    from public.project_documents d
    where d.id = document_id
      and public.can_edit_project(d.project_id)
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.project_documents d
    where d.id = document_id
      and public.can_edit_project(d.project_id)
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'project-documents',
  'project-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists project_documents_objects_select on storage.objects;
create policy project_documents_objects_select on storage.objects
for select to authenticated
using (
  bucket_id = 'project-documents'
  and public.can_access_project((storage.foldername(name))[1])
);

drop policy if exists project_documents_objects_insert on storage.objects;
create policy project_documents_objects_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'project-documents'
  and public.can_edit_project((storage.foldername(name))[1])
);

drop policy if exists project_documents_objects_update on storage.objects;
create policy project_documents_objects_update on storage.objects
for update to authenticated
using (
  bucket_id = 'project-documents'
  and public.can_edit_project((storage.foldername(name))[1])
)
with check (
  bucket_id = 'project-documents'
  and public.can_edit_project((storage.foldername(name))[1])
);

drop policy if exists project_documents_objects_delete on storage.objects;
create policy project_documents_objects_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'project-documents'
  and public.can_edit_project((storage.foldername(name))[1])
);

create or replace function public.save_document_annotations(
  p_document_id text,
  p_page_number integer,
  p_annotations jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  a jsonb;
begin
  if p_page_number < 1
    or jsonb_typeof(coalesce(p_annotations, '[]'::jsonb)) <> 'array'
  then
    raise exception 'INVALID_DOCUMENT_ANNOTATIONS_PAYLOAD' using errcode = '22023';
  end if;

  select project_id
    into v_project_id
  from public.project_documents
  where id = p_document_id;

  if v_project_id is null or not public.can_edit_project(v_project_id) then
    raise exception 'DOCUMENT_EDIT_DENIED' using errcode = '42501';
  end if;

  delete from public.document_annotations
  where document_id = p_document_id
    and page_number = p_page_number;

  for a in
    select value
    from jsonb_array_elements(coalesce(p_annotations, '[]'::jsonb))
  loop
    insert into public.document_annotations (
      id,
      document_id,
      page_number,
      kind,
      geometry,
      color,
      size,
      opacity,
      created_by,
      created_at,
      updated_at
    )
    values (
      a->>'id',
      p_document_id,
      p_page_number,
      a->>'kind',
      coalesce(a->'geometry', '{}'::jsonb),
      coalesce(nullif(a->>'color', ''), '#111827'),
      least(64, greatest(0.1, coalesce((a->>'size')::double precision, 3))),
      least(1, greatest(0, coalesce((a->>'opacity')::double precision, 1))),
      auth.uid(),
      coalesce(nullif(a->>'created_at', '')::timestamptz, now()),
      coalesce(nullif(a->>'updated_at', '')::timestamptz, now())
    );
  end loop;
end;
$projectflow$;

revoke all on function public.save_document_annotations(text, integer, jsonb) from public;
grant execute on function public.save_document_annotations(text, integer, jsonb) to authenticated;

grant select, insert, update, delete on public.project_documents to authenticated;
grant select, insert, update, delete on public.document_annotations to authenticated;
