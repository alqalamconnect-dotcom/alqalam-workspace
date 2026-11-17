do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.drive_trash_items'::regclass
      and conname = 'drive_trash_items_pkey'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (item_id)'
  ) then
    alter table public.drive_trash_items
      drop constraint drive_trash_items_pkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.drive_trash_items'::regclass
      and conname = 'drive_trash_items_pkey'
  ) then
    alter table public.drive_trash_items
      add constraint drive_trash_items_pkey primary key (operation_id, item_id);
  end if;
end
$$;

notify pgrst, 'reload schema';
