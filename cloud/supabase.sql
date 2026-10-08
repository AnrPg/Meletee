-- =====================================================================================
-- Meletee — Supabase schema. Run in: Supabase dashboard → SQL Editor → New query → Run.
-- Same project as noema-lite (one account works in both apps). Idempotent: safe to run again at any time.
-- Multi-tenant by design: every row belongs to exactly one user (auth.uid()) and row-level security makes
-- other users' data invisible. This file only creates meletee_* objects: it never changes the definition of
-- noema-lite's noema_* tables (Meletee uses noema_kv read-only, noema_conversations exactly like noema-lite,
-- and appends to noema-lite's inbox keys only when noema-lite announces that it reads them — docs/NOEMA.md).
-- =====================================================================================

-- 1) Key/value mirror of Meletee's per-account storage (meletee1:<account>:a:<name> → key 'a:<name>'):
--    courses, sessions, plans, settings … Last write wins per key, using updated_at (like noema_kv).
--    Never synced: the device keys 'meletee-device:*' (AI keys), timers and caches.
create table if not exists public.meletee_kv (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null check (char_length(key) <= 300),
  value      text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 2) Restore points of the whole Meletee account: one automatic per day (the newest 30 are kept) + manual ones.
create table if not exists public.meletee_snapshots (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null default 'manual' check (kind in ('auto', 'manual')),
  label      text,
  data       jsonb not null,
  size_bytes integer,
  created_at timestamptz not null default now()
);
alter table public.meletee_snapshots add column if not exists kind text not null default 'manual';
create index if not exists meletee_snapshots_user_created on public.meletee_snapshots (user_id, created_at desc);

-- 3) Row-level security: each user sees and changes only their own rows
alter table public.meletee_kv        enable row level security;
alter table public.meletee_snapshots enable row level security;
drop policy if exists "own meletee kv"        on public.meletee_kv;
drop policy if exists "own meletee snapshots" on public.meletee_snapshots;
create policy "own meletee kv"        on public.meletee_kv        for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own meletee snapshots" on public.meletee_snapshots for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 4) Check: should list the meletee_ tables with rls_enabled = true
select tablename, rowsecurity as rls_enabled from pg_tables where schemaname = 'public' and tablename like 'meletee_%' order by 1;

-- =====================================================================================
-- PHASE 7 (buddies) — append the buddy tables, policies and Realtime setup below this line.
-- Keep the same style: idempotent statements, meletee_ prefix, row-level security on every table.
-- =====================================================================================
