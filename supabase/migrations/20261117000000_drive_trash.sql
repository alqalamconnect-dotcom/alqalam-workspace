create table if not exists public.drive_trash_items (
  item_id text primary key,
  operation_id uuid not null,
  item_name text not null,
  item_type text not null check (item_type in ('file', 'folder')),
  parent_id text,
  is_root boolean not null default false,
  deleted_by uuid not null references auth.users(id) on delete cascade,
  deleted_at timestamptz not null default now()
);

create index if not exists drive_trash_items_operation
  on public.drive_trash_items (operation_id);

create index if not exists drive_trash_items_deleted_by
  on public.drive_trash_items (deleted_by, deleted_at desc)
  where is_root = true;

alter table public.drive_trash_items enable row level security;
revoke all on public.drive_trash_items from public, anon, authenticated;
grant all on public.drive_trash_items to service_role;
