create table if not exists public.drive_item_access_controls (
  item_id text primary key,
  item_name text not null,
  item_type text not null check (item_type in ('file', 'folder')),
  owner_id uuid not null references auth.users(id) on delete cascade,
  parent_id text,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drive_access_requests (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.drive_item_access_controls(item_id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_name text not null,
  requested_access text not null check (requested_access in ('view', 'edit')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  granted_access text check (granted_access in ('view', 'edit')),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'approved' and granted_access is not null)
    or (status <> 'approved' and granted_access is null)
  )
);

create unique index if not exists drive_access_requests_one_pending_per_user
  on public.drive_access_requests (item_id, requester_id)
  where status = 'pending';

create index if not exists drive_access_requests_requester_status
  on public.drive_access_requests (requester_id, status);

insert into public.drive_item_access_controls (
  item_id, item_name, item_type, owner_id, parent_id, is_locked
)
select
  drive_file_id,
  file_name,
  'file',
  uploaded_by_id,
  folder_id,
  false
from public.file_metadata
where drive_file_id is not null
  and uploaded_by_id is not null
on conflict (item_id) do nothing;

alter table public.drive_item_access_controls enable row level security;
alter table public.drive_access_requests enable row level security;

revoke all on public.drive_item_access_controls from public, anon, authenticated;
revoke all on public.drive_access_requests from public, anon, authenticated;
grant all on public.drive_item_access_controls to service_role;
grant all on public.drive_access_requests to service_role;
