create table if not exists public.budget_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.budget_backups enable row level security;

drop policy if exists "Users can read their own budget backup" on public.budget_backups;
create policy "Users can read their own budget backup"
  on public.budget_backups for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own budget backup" on public.budget_backups;
create policy "Users can create their own budget backup"
  on public.budget_backups for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own budget backup" on public.budget_backups;
create policy "Users can update their own budget backup"
  on public.budget_backups for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.budget_backups to authenticated;

create or replace function public.save_budget_backup(
  p_data jsonb,
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required to save budget data';
  end if;

  insert into public.budget_backups (user_id, data, updated_at)
  values (auth.uid(), p_data, now())
  on conflict (user_id) do update
    set data = excluded.data, updated_at = excluded.updated_at
    where public.budget_backups.updated_at = p_expected_updated_at
  returning updated_at into saved_at;

  if saved_at is null then
    raise exception 'Budget changed on another device. Reload before saving again.';
  end if;

  return saved_at;
end;
$$;

grant execute on function public.save_budget_backup(jsonb, timestamptz) to authenticated;
