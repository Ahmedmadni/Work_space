-- Phase 11: secure project sharing, roles and pending invitations.

create table if not exists public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  email_normalized text not null,
  role text not null check (role in ('admin','editor','viewer')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  unique (project_id, email_normalized)
);

create index if not exists project_invitations_email_idx
  on public.project_invitations(email_normalized)
  where accepted_at is null and revoked_at is null;

-- Normalize historical memberships so the project creator is the only Owner.
update public.project_members pm
set role = 'admin'
from public.projects p
where p.id = pm.project_id
  and pm.role = 'owner'
  and pm.user_id <> p.created_by;

insert into public.project_members (project_id, user_id, role, created_at)
select p.id, p.created_by, 'owner', p.created_at
from public.projects p
on conflict (project_id, user_id) do update
set role = 'owner';

alter table public.project_invitations enable row level security;

create or replace function public.project_current_role(p_project_id text)
returns text
language sql
stable
security definer
set search_path = public
as $projectflow$
  select case
    when p.created_by = auth.uid() then 'owner'
    else (
      select pm.role
      from public.project_members pm
      where pm.project_id = p_project_id
        and pm.user_id = auth.uid()
      limit 1
    )
  end
  from public.projects p
  where p.id = p_project_id;
$projectflow$;

revoke all on function public.project_current_role(text) from public;
grant execute on function public.project_current_role(text) to authenticated;

-- Direct writes to memberships are restricted to the one bootstrap action used
-- immediately after creating a project. All collaboration changes go through
-- the RPCs below so admins cannot escalate themselves with raw REST calls.
drop policy if exists project_members_insert_manager on public.project_members;
drop policy if exists project_members_update_manager on public.project_members;
drop policy if exists project_members_delete_manager on public.project_members;

drop policy if exists project_members_insert_creator_owner on public.project_members;
create policy project_members_insert_creator_owner on public.project_members
for insert to authenticated
with check (
  user_id = auth.uid()
  and role = 'owner'
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.created_by = auth.uid()
  )
);

revoke update, delete on public.project_members from authenticated;

drop policy if exists project_invitations_select_manager on public.project_invitations;
create policy project_invitations_select_manager on public.project_invitations
for select to authenticated
using (public.can_manage_project(project_id));

revoke insert, update, delete on public.project_invitations from authenticated;
grant select on public.project_invitations to authenticated;

create or replace function public.list_project_collaborators(p_project_id text)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  joined_at timestamptz,
  is_creator boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $projectflow$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'PROJECT_ACCESS_DENIED' using errcode = '42501';
  end if;

  return query
  select
    pm.user_id,
    u.email::text,
    coalesce(nullif(pr.full_name, ''), split_part(coalesce(u.email, ''), '@', 1), 'مستخدم')::text,
    case when p.created_by = pm.user_id then 'owner' else pm.role end::text,
    pm.created_at,
    (p.created_by = pm.user_id)
  from public.project_members pm
  join public.projects p on p.id = pm.project_id
  join auth.users u on u.id = pm.user_id
  left join public.profiles pr on pr.id = pm.user_id
  where pm.project_id = p_project_id
  order by
    case when p.created_by = pm.user_id then 0 else 1 end,
    pm.created_at asc;
end;
$projectflow$;

create or replace function public.list_project_invitations(p_project_id text)
returns table (
  id uuid,
  email text,
  role text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $projectflow$
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'PROJECT_MANAGE_DENIED' using errcode = '42501';
  end if;

  return query
  select
    i.id,
    i.email_normalized,
    i.role,
    i.created_at
  from public.project_invitations i
  where i.project_id = p_project_id
    and i.accepted_at is null
    and i.revoked_at is null
  order by i.created_at desc;
end;
$projectflow$;

create or replace function public.invite_project_member(
  p_project_id text,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $projectflow$
declare
  v_actor_role text;
  v_email text;
  v_user_id uuid;
  v_creator_id uuid;
  v_target_role text;
  v_existing_role text;
  v_invitation_id uuid;
begin
  v_actor_role := public.project_current_role(p_project_id);
  v_email := lower(trim(coalesce(p_email, '')));
  v_target_role := lower(trim(coalesce(p_role, '')));

  if v_actor_role not in ('owner','admin') then
    raise exception 'PROJECT_MANAGE_DENIED' using errcode = '42501';
  end if;

  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'INVALID_INVITATION_EMAIL' using errcode = '22023';
  end if;

  if v_target_role not in ('admin','editor','viewer') then
    raise exception 'INVALID_PROJECT_ROLE' using errcode = '22023';
  end if;

  if v_actor_role = 'admin' and v_target_role = 'admin' then
    raise exception 'ADMIN_CANNOT_ASSIGN_ADMIN' using errcode = '42501';
  end if;

  select created_by into v_creator_id
  from public.projects
  where id = p_project_id;

  if v_creator_id is null then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(coalesce(u.email, '')) = v_email
  limit 1;

  if v_user_id = auth.uid() then
    raise exception 'CANNOT_INVITE_SELF' using errcode = '22023';
  end if;

  if v_user_id is not null then
    if v_user_id = v_creator_id then
      raise exception 'PROJECT_CREATOR_ROLE_IMMUTABLE' using errcode = '42501';
    end if;

    select pm.role into v_existing_role
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_user_id;

    if v_actor_role = 'admin' and v_existing_role = 'admin' then
      raise exception 'ADMIN_CANNOT_MANAGE_ADMIN' using errcode = '42501';
    end if;

    insert into public.project_members (project_id, user_id, role)
    values (p_project_id, v_user_id, v_target_role)
    on conflict (project_id, user_id) do update
    set role = excluded.role;

    delete from public.project_invitations
    where project_id = p_project_id
      and email_normalized = v_email;

    return jsonb_build_object(
      'status', 'added',
      'user_id', v_user_id,
      'email', v_email,
      'role', v_target_role
    );
  end if;

  insert into public.project_invitations (
    project_id,
    email_normalized,
    role,
    invited_by,
    accepted_at,
    revoked_at,
    created_at
  )
  values (
    p_project_id,
    v_email,
    v_target_role,
    auth.uid(),
    null,
    null,
    now()
  )
  on conflict (project_id, email_normalized) do update
  set
    role = excluded.role,
    invited_by = excluded.invited_by,
    accepted_at = null,
    revoked_at = null,
    created_at = now()
  returning id into v_invitation_id;

  return jsonb_build_object(
    'status', 'pending',
    'invitation_id', v_invitation_id,
    'email', v_email,
    'role', v_target_role
  );
end;
$projectflow$;

create or replace function public.update_project_member_role(
  p_project_id text,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_actor_role text;
  v_target_role text;
  v_current_target_role text;
  v_creator_id uuid;
begin
  v_actor_role := public.project_current_role(p_project_id);
  v_target_role := lower(trim(coalesce(p_role, '')));

  if v_actor_role not in ('owner','admin') then
    raise exception 'PROJECT_MANAGE_DENIED' using errcode = '42501';
  end if;

  if v_target_role not in ('admin','editor','viewer') then
    raise exception 'INVALID_PROJECT_ROLE' using errcode = '22023';
  end if;

  select created_by into v_creator_id
  from public.projects
  where id = p_project_id;

  if p_user_id = v_creator_id then
    raise exception 'PROJECT_CREATOR_ROLE_IMMUTABLE' using errcode = '42501';
  end if;

  select role into v_current_target_role
  from public.project_members
  where project_id = p_project_id
    and user_id = p_user_id;

  if v_current_target_role is null then
    raise exception 'PROJECT_MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_actor_role = 'admin' and (
    v_current_target_role = 'admin' or
    v_target_role = 'admin'
  ) then
    raise exception 'ADMIN_ROLE_CHANGE_DENIED' using errcode = '42501';
  end if;

  update public.project_members
  set role = v_target_role
  where project_id = p_project_id
    and user_id = p_user_id;
end;
$projectflow$;

create or replace function public.remove_project_member(
  p_project_id text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_actor_role text;
  v_target_role text;
  v_creator_id uuid;
begin
  v_actor_role := public.project_current_role(p_project_id);

  if v_actor_role not in ('owner','admin') then
    raise exception 'PROJECT_MANAGE_DENIED' using errcode = '42501';
  end if;

  select created_by into v_creator_id
  from public.projects
  where id = p_project_id;

  if p_user_id = v_creator_id then
    raise exception 'PROJECT_CREATOR_CANNOT_BE_REMOVED' using errcode = '42501';
  end if;

  select role into v_target_role
  from public.project_members
  where project_id = p_project_id
    and user_id = p_user_id;

  if v_target_role is null then
    return;
  end if;

  if v_actor_role = 'admin' and v_target_role = 'admin' then
    raise exception 'ADMIN_CANNOT_REMOVE_ADMIN' using errcode = '42501';
  end if;

  delete from public.project_members
  where project_id = p_project_id
    and user_id = p_user_id;
end;
$projectflow$;

create or replace function public.revoke_project_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  v_project_id text;
  v_invited_role text;
  v_actor_role text;
begin
  select project_id, role
    into v_project_id, v_invited_role
  from public.project_invitations
  where id = p_invitation_id
    and accepted_at is null
    and revoked_at is null;

  if v_project_id is null then
    return;
  end if;

  v_actor_role := public.project_current_role(v_project_id);

  if v_actor_role not in ('owner','admin') then
    raise exception 'PROJECT_MANAGE_DENIED' using errcode = '42501';
  end if;

  if v_actor_role = 'admin' and v_invited_role = 'admin' then
    raise exception 'ADMIN_CANNOT_REVOKE_ADMIN_INVITE' using errcode = '42501';
  end if;

  update public.project_invitations
  set revoked_at = now()
  where id = p_invitation_id;
end;
$projectflow$;

revoke all on function public.list_project_collaborators(text) from public;
revoke all on function public.list_project_invitations(text) from public;
revoke all on function public.invite_project_member(text, text, text) from public;
revoke all on function public.update_project_member_role(text, uuid, text) from public;
revoke all on function public.remove_project_member(text, uuid) from public;
revoke all on function public.revoke_project_invitation(uuid) from public;

grant execute on function public.list_project_collaborators(text) to authenticated;
grant execute on function public.list_project_invitations(text) to authenticated;
grant execute on function public.invite_project_member(text, text, text) to authenticated;
grant execute on function public.update_project_member_role(text, uuid, text) to authenticated;
grant execute on function public.remove_project_member(text, uuid) to authenticated;
grant execute on function public.revoke_project_invitation(uuid) to authenticated;

-- Extend the existing auth trigger so pending invitations are accepted
-- automatically when a matching email creates an account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $projectflow$
declare
  display_name text;
  normalized_email text;
begin
  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'مستخدم'
  );
  normalized_email := lower(trim(coalesce(new.email, '')));

  insert into public.profiles (id, full_name, initials)
  values (
    new.id,
    display_name,
    left(display_name, 1)
  )
  on conflict (id) do nothing;

  if normalized_email <> '' then
    insert into public.project_members (project_id, user_id, role, created_at)
    select
      i.project_id,
      new.id,
      i.role,
      now()
    from public.project_invitations i
    where i.email_normalized = normalized_email
      and i.accepted_at is null
      and i.revoked_at is null
    on conflict (project_id, user_id) do nothing;

    update public.project_invitations
    set accepted_at = now()
    where email_normalized = normalized_email
      and accepted_at is null
      and revoked_at is null;
  end if;

  return new;
end;
$projectflow$;
