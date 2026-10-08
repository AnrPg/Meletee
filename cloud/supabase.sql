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

-- 5) Buddy cards: a display name, an emoji and exactly what this person shares with accepted buddies.
--    share = {"streak","minutes","garden","focus"} → true/false (default: only the forgiving streak);
--    stats holds only the shared fields (the app never writes the others, and meletee_buddy_masked
--    filters again on the way out). compete = opt-in to friendly challenges.
create table if not exists public.meletee_buddy_profiles (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  emoji        text not null default '🌱' check (char_length(emoji) <= 16),
  share        jsonb not null default '{"streak": true}'::jsonb,
  compete      boolean not null default false,
  stats        jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 4000),
  updated_at   timestamptz not null default now()
);

-- 6) Invites: a single-use code (no public directory, no e-mail lookup), valid for 14 days.
create table if not exists public.meletee_buddy_invites (
  code       text primary key check (code ~ '^[A-HJKMNP-Z2-9]{8}$'),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_by    uuid references auth.users(id) on delete set null,
  used_at    timestamptz,
  outcome    text check (outcome in ('accepted', 'declined'))
);
create index if not exists meletee_buddy_invites_user on public.meletee_buddy_invites (user_id, created_at desc);

-- 7) Buddy links: one row per pair (user_a < user_b). 'blocked' rows are seen only by the person who blocked.
create table if not exists public.meletee_buddy_links (
  user_a     uuid not null references auth.users(id) on delete cascade,
  user_b     uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'accepted' check (status in ('accepted', 'blocked')),
  blocked_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b),
  check ((status = 'blocked') = (blocked_by is not null))
);
create index if not exists meletee_buddy_links_b on public.meletee_buddy_links (user_b);

-- 8) Cheers and nudges: preset message keys only (translated in the app), no free text.
create table if not exists public.meletee_buddy_cheers (
  id         bigint generated always as identity primary key,
  from_user  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_user    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('cheer', 'nudge')),
  message    text not null check (message ~ '^[a-z][A-Za-z0-9]{0,39}$'),
  created_at timestamptz not null default now(),
  seen_at    timestamptz
);
create index if not exists meletee_buddy_cheers_to on public.meletee_buddy_cheers (to_user, created_at desc);
create index if not exists meletee_buddy_cheers_from on public.meletee_buddy_cheers (from_user, to_user, created_at desc);

-- 9) Focus rooms (one per person, open to their accepted buddies) and who is in them.
--    timer = the shared Pomodoro: {"phase":"focus","minutes":25,"rest":5,"startedAt":ms,"endsAt":ms,"by":uuid,"v":ms} or {"phase":"idle","v":ms}
create table if not exists public.meletee_buddy_rooms (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  timer      jsonb not null default '{}'::jsonb check (pg_column_size(timer) < 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists meletee_buddy_rooms_owner on public.meletee_buddy_rooms (owner);
create table if not exists public.meletee_buddy_room_members (
  room_id   uuid not null references public.meletee_buddy_rooms(id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status    text not null default 'here' check (status in ('here', 'focus', 'break')),
  last_seen timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- 10) Weekly goals (Monday to Sunday, week = the Monday):
--     shared    = cooperation: each member does `target` (e.g. 5 sessions each)
--     team      = co-competition: all members together reach `target` (e.g. 20 sessions in total)
--     challenge = friendly competition (opt-in, no target): a light board that starts fresh every Monday
create table if not exists public.meletee_buddy_goals (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('shared', 'team', 'challenge')),
  metric     text not null check (metric in ('minutes', 'sessions', 'reviews')),
  target     integer check (target between 1 and 100000),
  week       date not null,
  created_at timestamptz not null default now(),
  check ((kind = 'challenge') = (target is null))
);
create index if not exists meletee_buddy_goals_owner_week on public.meletee_buddy_goals (owner, week);
create table if not exists public.meletee_buddy_goal_members (
  goal_id   uuid not null references public.meletee_buddy_goals(id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (goal_id, user_id)
);
create index if not exists meletee_buddy_goal_members_user on public.meletee_buddy_goal_members (user_id);

-- 11) Weekly contributions, computed by the app from its own study sessions and reviews and written
--     by each person for themselves only. Others see them only through goals they joined together.
create table if not exists public.meletee_buddy_contributions (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week       date not null,
  minutes    integer not null default 0 check (minutes between 0 and 10080),
  sessions   integer not null default 0 check (sessions between 0 and 1000),
  reviews    integer not null default 0 check (reviews between 0 and 100000),
  updated_at timestamptz not null default now(),
  primary key (user_id, week)
);

-- 12) Helpers (SECURITY DEFINER, each one checks auth.uid())
create or replace function public.meletee_buddy_with(p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.meletee_buddy_links
    where user_a = least(auth.uid(), p_other) and user_b = greatest(auth.uid(), p_other) and status = 'accepted');
$$;

create or replace function public.meletee_buddy_masked(p_share jsonb, p_stats jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, p_stats -> k), '{}'::jsonb)
  from unnest(array['streak', 'minutes', 'garden', 'focus']) as k
  where coalesce(p_share ->> k, 'false') = 'true' and p_stats ? k;
$$;

create or replace function public.meletee_buddy_room_ok(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.meletee_buddy_rooms r
    where r.id = p_room and (r.owner = auth.uid() or public.meletee_buddy_with(r.owner)));
$$;

create or replace function public.meletee_buddy_room_topic_ok(p_topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or p_topic is null or p_topic !~ '^meletee-room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return public.meletee_buddy_room_ok(substring(p_topic from 14)::uuid);
end $$;

create or replace function public.meletee_buddy_goal_ok(p_goal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.meletee_buddy_goals g
    where g.id = p_goal and (g.owner = auth.uid() or public.meletee_buddy_with(g.owner)
      or exists (select 1 from public.meletee_buddy_goal_members m where m.goal_id = g.id and m.user_id = auth.uid())));
$$;

-- 13) Row-level security: own rows, plus what accepted buddies may see. Everything that crosses
--     between people goes through the functions below.
alter table public.meletee_buddy_profiles      enable row level security;
alter table public.meletee_buddy_invites       enable row level security;
alter table public.meletee_buddy_links         enable row level security;
alter table public.meletee_buddy_cheers        enable row level security;
alter table public.meletee_buddy_rooms         enable row level security;
alter table public.meletee_buddy_room_members  enable row level security;
alter table public.meletee_buddy_goals         enable row level security;
alter table public.meletee_buddy_goal_members  enable row level security;
alter table public.meletee_buddy_contributions enable row level security;
drop policy if exists "own buddy profile"       on public.meletee_buddy_profiles;
drop policy if exists "own buddy invites"       on public.meletee_buddy_invites;
drop policy if exists "see own buddy links"     on public.meletee_buddy_links;
drop policy if exists "see own cheers"          on public.meletee_buddy_cheers;
drop policy if exists "see buddy rooms"         on public.meletee_buddy_rooms;
drop policy if exists "see buddy room members"  on public.meletee_buddy_room_members;
drop policy if exists "see buddy goals"         on public.meletee_buddy_goals;
drop policy if exists "see buddy goal members"  on public.meletee_buddy_goal_members;
drop policy if exists "own buddy contributions" on public.meletee_buddy_contributions;
create policy "own buddy profile"       on public.meletee_buddy_profiles      for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own buddy invites"       on public.meletee_buddy_invites       for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and used_by is null);
create policy "see own buddy links"     on public.meletee_buddy_links         for select to authenticated using ((select auth.uid()) in (user_a, user_b) and (status = 'accepted' or blocked_by = (select auth.uid())));
create policy "see own cheers"          on public.meletee_buddy_cheers        for select to authenticated using ((select auth.uid()) in (from_user, to_user));
create policy "see buddy rooms"         on public.meletee_buddy_rooms         for select to authenticated using (owner = (select auth.uid()) or public.meletee_buddy_with(owner));
create policy "see buddy room members"  on public.meletee_buddy_room_members  for select to authenticated using (public.meletee_buddy_room_ok(room_id));
create policy "see buddy goals"         on public.meletee_buddy_goals         for select to authenticated using (public.meletee_buddy_goal_ok(id));
create policy "see buddy goal members"  on public.meletee_buddy_goal_members  for select to authenticated using (public.meletee_buddy_goal_ok(goal_id));
create policy "own buddy contributions" on public.meletee_buddy_contributions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 14) Functions the app calls (POST /rest/v1/rpc/<name>). SECURITY DEFINER where RLS joins get awkward;
--     every one starts by checking auth.uid().
create or replace function public.meletee_buddy_me() returns uuid
language plpgsql stable set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return auth.uid();
end $$;

create or replace function public.meletee_buddy_invite_preview(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me(); i record;
begin
  select v.*, p.display_name, p.emoji into i
  from public.meletee_buddy_invites v left join public.meletee_buddy_profiles p on p.user_id = v.user_id
  where v.code = upper(p_code);
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if exists (select 1 from public.meletee_buddy_links where user_a = least(me, i.user_id) and user_b = greatest(me, i.user_id) and status = 'blocked')
    then return jsonb_build_object('status', 'invalid'); end if;
  if i.user_id = me then return jsonb_build_object('status', 'self'); end if;
  if public.meletee_buddy_with(i.user_id) then return jsonb_build_object('status', 'already', 'name', i.display_name, 'emoji', i.emoji); end if;
  if i.used_by is not null then return jsonb_build_object('status', 'used'); end if;
  if i.expires_at < now() then return jsonb_build_object('status', 'expired'); end if;
  return jsonb_build_object('status', 'ok', 'name', coalesce(i.display_name, '…'), 'emoji', coalesce(i.emoji, '🌱'));
end $$;

create or replace function public.meletee_buddy_accept_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me(); i record;
begin
  if not exists (select 1 from public.meletee_buddy_profiles where user_id = me) then raise exception 'make your buddy card first'; end if;
  select * into i from public.meletee_buddy_invites where code = upper(p_code) for update;
  if not found or i.user_id = me or i.used_by is not null or i.expires_at < now()
     or exists (select 1 from public.meletee_buddy_links where user_a = least(me, i.user_id) and user_b = greatest(me, i.user_id) and status = 'blocked')
    then raise exception 'invite not valid'; end if;
  insert into public.meletee_buddy_links (user_a, user_b) values (least(me, i.user_id), greatest(me, i.user_id)) on conflict do nothing;
  update public.meletee_buddy_invites set used_by = me, used_at = now(), outcome = 'accepted' where code = i.code;
  return jsonb_build_object('id', i.user_id);
end $$;

create or replace function public.meletee_buddy_decline_invite(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me();
begin
  update public.meletee_buddy_invites set used_by = me, used_at = now(), outcome = 'declined'
  where code = upper(p_code) and user_id <> me and used_by is null;
end $$;

create or replace function public.meletee_buddy_remove(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me();
begin
  delete from public.meletee_buddy_links where user_a = least(me, p_other) and user_b = greatest(me, p_other) and status = 'accepted';
end $$;

create or replace function public.meletee_buddy_block(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me();
begin
  if p_other = me then return; end if;
  insert into public.meletee_buddy_links (user_a, user_b, status, blocked_by) values (least(me, p_other), greatest(me, p_other), 'blocked', me)
  on conflict (user_a, user_b) do update set status = 'blocked', blocked_by = case when meletee_buddy_links.status = 'blocked' then meletee_buddy_links.blocked_by else me end;
  delete from public.meletee_buddy_room_members m using public.meletee_buddy_rooms r
    where m.room_id = r.id and ((r.owner = me and m.user_id = p_other) or (r.owner = p_other and m.user_id = me));
end $$;

create or replace function public.meletee_buddy_unblock(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me();
begin
  delete from public.meletee_buddy_links where user_a = least(me, p_other) and user_b = greatest(me, p_other) and status = 'blocked' and blocked_by = me;
end $$;

create or replace function public.meletee_buddy_cheer(p_to uuid, p_kind text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me();
begin
  if not public.meletee_buddy_with(p_to) then raise exception 'not your buddy'; end if;
  if (select count(*) from public.meletee_buddy_cheers where from_user = me and to_user = p_to and created_at > now() - interval '1 hour') >= 6
    then raise exception 'slow down'; end if;
  insert into public.meletee_buddy_cheers (from_user, to_user, kind, message) values (me, p_to, p_kind, p_message);
  delete from public.meletee_buddy_cheers where to_user = p_to and created_at < now() - interval '30 days';
end $$;

create or replace function public.meletee_buddy_cheers_seen() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me();
begin
  update public.meletee_buddy_cheers set seen_at = now() where to_user = me and seen_at is null;
end $$;

create or replace function public.meletee_buddy_room_open() returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me(); rid uuid;
begin
  insert into public.meletee_buddy_rooms (owner) values (me) on conflict (owner) do update set updated_at = now() returning id into rid;
  return rid;
end $$;

create or replace function public.meletee_buddy_room_state(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me();
begin
  if not public.meletee_buddy_room_ok(p_room) then raise exception 'room not available'; end if;
  return jsonb_build_object(
    'timer', (select timer from public.meletee_buddy_rooms where id = p_room),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(p.display_name, '…'), 'emoji', coalesce(p.emoji, '🌱'), 'status', m.status) order by p.display_name)
      from public.meletee_buddy_room_members m left join public.meletee_buddy_profiles p on p.user_id = m.user_id
      where m.room_id = p_room and m.last_seen > now() - interval '90 seconds'), '[]'::jsonb));
end $$;

create or replace function public.meletee_buddy_room_join(p_room uuid, p_status text default 'here') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me();
begin
  if not public.meletee_buddy_room_ok(p_room) then raise exception 'room not available'; end if;
  insert into public.meletee_buddy_room_members (room_id, user_id, status, last_seen)
  values (p_room, me, coalesce(nullif(p_status, ''), 'here'), now())
  on conflict (room_id, user_id) do update set status = excluded.status, last_seen = now();
  return public.meletee_buddy_room_state(p_room);
end $$;

create or replace function public.meletee_buddy_room_leave(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me();
begin
  delete from public.meletee_buddy_room_members where room_id = p_room and user_id = me;
end $$;

create or replace function public.meletee_buddy_room_timer(p_room uuid, p_timer jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me();
begin
  if not public.meletee_buddy_room_ok(p_room) then raise exception 'room not available'; end if;
  if jsonb_typeof(p_timer) <> 'object' or coalesce(p_timer ->> 'phase', '') not in ('focus', 'idle') then raise exception 'bad timer'; end if;
  update public.meletee_buddy_rooms set timer = p_timer || jsonb_build_object('by', me), updated_at = now()
  where id = p_room and coalesce((timer ->> 'v')::numeric, 0) <= coalesce((p_timer ->> 'v')::numeric, 0);
end $$;

create or replace function public.meletee_buddy_goal_create(p_kind text, p_metric text, p_target integer, p_week date) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me(); gid uuid;
begin
  if p_week is null or extract(isodow from p_week) <> 1 or abs(p_week - current_date) > 8 then raise exception 'bad week'; end if;
  if p_kind = 'challenge' and not coalesce((select compete from public.meletee_buddy_profiles where user_id = me), false)
    then raise exception 'challenges are opt-in'; end if;
  if (select count(*) from public.meletee_buddy_goals where owner = me and week = p_week) >= 10 then raise exception 'enough goals this week'; end if;
  insert into public.meletee_buddy_goals (owner, kind, metric, target, week)
  values (me, p_kind, p_metric, case when p_kind = 'challenge' then null else p_target end, p_week) returning id into gid;
  insert into public.meletee_buddy_goal_members (goal_id, user_id) values (gid, me);
  return gid;
end $$;

create or replace function public.meletee_buddy_goal_join(p_goal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me(); g record;
begin
  select * into g from public.meletee_buddy_goals where id = p_goal;
  if not found or not (g.owner = me or public.meletee_buddy_with(g.owner)) or g.week < current_date - 7 then raise exception 'goal not available'; end if;
  if g.kind = 'challenge' and not coalesce((select compete from public.meletee_buddy_profiles where user_id = me), false)
    then raise exception 'challenges are opt-in'; end if;
  insert into public.meletee_buddy_goal_members (goal_id, user_id) values (p_goal, me) on conflict do nothing;
end $$;

create or replace function public.meletee_buddy_goal_leave(p_goal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me();
begin
  delete from public.meletee_buddy_goal_members where goal_id = p_goal and user_id = me;
  delete from public.meletee_buddy_goals g where g.id = p_goal and g.owner = me
    and not exists (select 1 from public.meletee_buddy_goal_members m where m.goal_id = g.id);
end $$;

-- Everything the Buddies screens show, in one call. Buddies' cards are masked to what they share;
-- goals show each member's number for the goal's metric (joining a goal shares that number with
-- its members); challenges appear only for people who opted in.
create or replace function public.meletee_buddy_overview(p_week date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.meletee_buddy_me(); my_compete boolean;
begin
  select coalesce(compete, false) into my_compete from public.meletee_buddy_profiles where user_id = me;
  my_compete := coalesce(my_compete, false);
  return jsonb_build_object(
    'compete', my_compete,
    'buddies', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'since', b.since, 'name', coalesce(p.display_name, '…'), 'emoji', coalesce(p.emoji, '🌱'),
        'shared', public.meletee_buddy_masked(p.share, p.stats)) order by lower(coalesce(p.display_name, '')))
      from (select case when l.user_a = me then l.user_b else l.user_a end as id, l.created_at as since
            from public.meletee_buddy_links l where me in (l.user_a, l.user_b) and l.status = 'accepted') b
      left join public.meletee_buddy_profiles p on p.user_id = b.id), '[]'::jsonb),
    'blocked', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', coalesce(p.display_name, '…'), 'emoji', coalesce(p.emoji, '🌱')))
      from (select case when l.user_a = me then l.user_b else l.user_a end as id
            from public.meletee_buddy_links l where me in (l.user_a, l.user_b) and l.status = 'blocked' and l.blocked_by = me) o
      left join public.meletee_buddy_profiles p on p.user_id = o.id), '[]'::jsonb),
    'cheers', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'from', c.from_user, 'name', coalesce(p.display_name, '…'), 'emoji', coalesce(p.emoji, '🌱'),
        'kind', c.kind, 'message', c.message, 'at', c.created_at, 'seen', c.seen_at is not null) order by c.created_at desc)
      from (select * from public.meletee_buddy_cheers where to_user = me and created_at > now() - interval '14 days'
            and public.meletee_buddy_with(from_user) order by created_at desc limit 20) c
      left join public.meletee_buddy_profiles p on p.user_id = c.from_user), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'owner', g.owner, 'kind', g.kind, 'metric', g.metric, 'target', g.target, 'week', g.week,
        'joined', exists (select 1 from public.meletee_buddy_goal_members x where x.goal_id = g.id and x.user_id = me),
        'members', coalesce((
          select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(p.display_name, '…'), 'emoji', coalesce(p.emoji, '🌱'),
            'value', coalesce((to_jsonb(c) ->> g.metric)::int, 0)) order by m.joined_at)
          from public.meletee_buddy_goal_members m
          left join public.meletee_buddy_profiles p on p.user_id = m.user_id
          left join public.meletee_buddy_contributions c on c.user_id = m.user_id and c.week = g.week
          where m.goal_id = g.id
            and not exists (select 1 from public.meletee_buddy_links bl where bl.status = 'blocked'
              and bl.user_a = least(me, m.user_id) and bl.user_b = greatest(me, m.user_id))), '[]'::jsonb))
        order by g.created_at)
      from public.meletee_buddy_goals g
      where g.week in (p_week, p_week - 7)
        and (g.owner = me or public.meletee_buddy_with(g.owner)
             or exists (select 1 from public.meletee_buddy_goal_members x where x.goal_id = g.id and x.user_id = me))
        and (g.kind <> 'challenge' or my_compete)), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'owner', r.owner, 'name', coalesce(p.display_name, '…'), 'emoji', coalesce(p.emoji, '🌱'), 'timer', r.timer,
        'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(mp.display_name, '…'), 'emoji', coalesce(mp.emoji, '🌱'), 'status', m.status))
          from public.meletee_buddy_room_members m left join public.meletee_buddy_profiles mp on mp.user_id = m.user_id
          where m.room_id = r.id and m.last_seen > now() - interval '90 seconds'), '[]'::jsonb)))
      from public.meletee_buddy_rooms r left join public.meletee_buddy_profiles p on p.user_id = r.owner
      where r.owner = me or public.meletee_buddy_with(r.owner)), '[]'::jsonb));
end $$;

-- Only signed-in people may call the buddy functions.
do $$
declare f text;
begin
  foreach f in array array[
    'meletee_buddy_with(uuid)', 'meletee_buddy_room_ok(uuid)', 'meletee_buddy_room_topic_ok(text)', 'meletee_buddy_goal_ok(uuid)', 'meletee_buddy_me()',
    'meletee_buddy_invite_preview(text)', 'meletee_buddy_accept_invite(text)', 'meletee_buddy_decline_invite(text)',
    'meletee_buddy_remove(uuid)', 'meletee_buddy_block(uuid)', 'meletee_buddy_unblock(uuid)',
    'meletee_buddy_cheer(uuid, text, text)', 'meletee_buddy_cheers_seen()',
    'meletee_buddy_room_open()', 'meletee_buddy_room_state(uuid)', 'meletee_buddy_room_join(uuid, text)', 'meletee_buddy_room_leave(uuid)', 'meletee_buddy_room_timer(uuid, jsonb)',
    'meletee_buddy_goal_create(text, text, integer, date)', 'meletee_buddy_goal_join(uuid)', 'meletee_buddy_goal_leave(uuid)', 'meletee_buddy_overview(date)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 15) Realtime for the focus rooms: private channels 'meletee-room:<room id>' with presence (who is here)
--     and broadcast (the shared timer). Only people who may see the room can listen or send.
--     No table needs to join the supabase_realtime publication (no postgres_changes are used).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "meletee room members listen" on realtime.messages';
    execute 'drop policy if exists "meletee room members send" on realtime.messages';
    execute $p$create policy "meletee room members listen" on realtime.messages for select to authenticated
      using (realtime.messages.extension in ('broadcast', 'presence') and public.meletee_buddy_room_topic_ok((select realtime.topic())))$p$;
    execute $p$create policy "meletee room members send" on realtime.messages for insert to authenticated
      with check (realtime.messages.extension in ('broadcast', 'presence') and public.meletee_buddy_room_topic_ok((select realtime.topic())))$p$;
  else
    raise notice 'realtime.messages not found: enable Realtime on the project, then run this file again';
  end if;
end $$;

-- 16) Check: should list the meletee_buddy_ tables with rls_enabled = true
select tablename, rowsecurity as rls_enabled from pg_tables where schemaname = 'public' and tablename like 'meletee_buddy_%' order by 1;
