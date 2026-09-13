create table public.user_openrouter_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nonce text not null,
  ciphertext text not null,
  last4 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_openrouter_keys enable row level security;

create policy user_openrouter_keys_select_own
  on public.user_openrouter_keys
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy user_openrouter_keys_insert_own
  on public.user_openrouter_keys
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_openrouter_keys_update_own
  on public.user_openrouter_keys
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_openrouter_keys_delete_own
  on public.user_openrouter_keys
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_openrouter_keys from anon, public;
grant select, insert, update, delete on table public.user_openrouter_keys to authenticated;
