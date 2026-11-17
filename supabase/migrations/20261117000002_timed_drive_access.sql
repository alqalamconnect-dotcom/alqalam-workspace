alter table public.drive_access_requests
  add column if not exists expires_at timestamptz;

alter table public.drive_access_requests
  drop constraint if exists drive_access_requests_status_check;

alter table public.drive_access_requests
  add constraint drive_access_requests_status_check
  check (status in ('pending', 'approved', 'denied', 'revoked'));

create index if not exists drive_access_requests_expiration
  on public.drive_access_requests (item_id, expires_at)
  where status = 'approved';

notify pgrst, 'reload schema';
