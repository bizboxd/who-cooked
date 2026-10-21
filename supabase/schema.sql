-- Who Cooked · Supabase schema
-- Run this whole file once in your Supabase project's SQL editor.

-- ============ Profiles (one per account) ============
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text not null,
  avatar_url text,
  color text not null default '#c6ff3d',
  -- false until a Google / phone user picks their username on first login
  onboarded boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists onboarded boolean not null default true;

alter table public.profiles enable row level security;

-- Readable before login too, so sign-up can check whether a username is taken.
create policy "profiles are public"
  on public.profiles for select to anon, authenticated using (true);
create policy "you can create your own profile"
  on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "you can edit your own profile"
  on public.profiles for update to authenticated using (id = auth.uid());

-- Create the profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  picked text := meta->>'username';
  base text;
begin
  -- Email sign-ups choose a username up front. Google and phone sign-ups get a
  -- temporary unique one and pick their real username on first login.
  if picked is null then
    base := lower(regexp_replace(coalesce(split_part(new.email, '@', 1), ''), '[^a-zA-Z0-9_.]', '', 'g'));
    if length(base) < 3 then base := 'player'; end if;
    picked := left(base, 14) || '_' || substr(replace(new.id::text, '-', ''), 1, 5);
  end if;

  insert into public.profiles (id, username, display_name, avatar_url, onboarded, color)
  values (
    new.id,
    picked,
    coalesce(meta->>'display_name', meta->>'full_name', meta->>'name', meta->>'username', 'Player'),
    meta->>'avatar_url',
    meta ? 'username',
    (array['#c6ff3d','#38bdf8','#f97316','#a78bfa','#f472b6','#facc15','#2dd4bf','#fb7185','#818cf8','#4ade80'])[1 + floor(random() * 10)::int]
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ Games ============
-- team_a / team_b JSON: { captainId, name, playerIds[], formation, gk, slots{}, positions{}, score }
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  sport text not null,
  played_on date not null,
  kickoff time,
  location text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'ready', 'final')),
  team_a jsonb not null,
  team_b jsonb,
  ref jsonb,
  stats jsonb not null default '{}'::jsonb,
  final_at timestamptz,    -- full-time whistle; starts the 24h voting window
  claimed_at timestamptz,  -- when the second captain locked the game in
  created_at timestamptz not null default now()
);
alter table public.games add column if not exists final_at timestamptz;
alter table public.games add column if not exists claimed_at timestamptz;

alter table public.games enable row level security;

create policy "games are visible to signed-in users"
  on public.games for select to authenticated using (true);

create policy "creator captains team A"
  on public.games for insert to authenticated
  with check (created_by = auth.uid() and team_a->>'captainId' = auth.uid()::text and team_b is null);

-- Captains can edit their game; anyone can claim an open side as the second captain.
create policy "captains edit, anyone can claim the open side"
  on public.games for update to authenticated
  using (
    team_a->>'captainId' = auth.uid()::text
    or team_b->>'captainId' = auth.uid()::text
    or team_b is null
  )
  with check (
    team_a->>'captainId' = auth.uid()::text
    or team_b->>'captainId' = auth.uid()::text
  );

create policy "creator can delete"
  on public.games for delete to authenticated using (created_by = auth.uid());

-- ============ Ratings ============
-- target = a teammate's profile id, or 'ref'
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  target text not null,
  score numeric(3,1) not null check (score >= 0.1 and score <= 10),
  note text,
  created_at timestamptz not null default now(),
  unique (game_id, rater_id, target)
);

-- Older installs allowed 1.0 minimum; ratings now go down to 0.1.
alter table public.ratings drop constraint if exists ratings_score_check;
alter table public.ratings add constraint ratings_score_check check (score >= 0.1 and score <= 10);

alter table public.ratings enable row level security;

-- Ratings stay hidden until the reveal: 24 hours after full time, or as soon as
-- every eligible vote is in. Before that you only see the votes you cast.
create or replace function public.game_revealed(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select g.status = 'final' and g.final_at is not null and (
    g.final_at <= now() - interval '24 hours'
    or (
      select count(*) from public.ratings r
      where r.game_id = g.id and (
        r.target = 'ref'
        or ((g.team_a->'playerIds') ? r.rater_id::text and (g.team_a->'playerIds') ? r.target)
        or ((g.team_b->'playerIds') ? r.rater_id::text and (g.team_b->'playerIds') ? r.target)
      )
    ) >= (
      coalesce(jsonb_array_length(g.team_a->'playerIds'), 0) * (coalesce(jsonb_array_length(g.team_a->'playerIds'), 0) - 1)
      + coalesce(jsonb_array_length(g.team_b->'playerIds'), 0) * (coalesce(jsonb_array_length(g.team_b->'playerIds'), 0) - 1)
      + case when g.ref is not null
          then coalesce(jsonb_array_length(g.team_a->'playerIds'), 0) + coalesce(jsonb_array_length(g.team_b->'playerIds'), 0)
          else 0 end
    )
  )
  from public.games g where g.id = gid;
$$;

create policy "see your own votes, everyone's after the reveal"
  on public.ratings for select to authenticated
  using (rater_id = auth.uid() or public.game_revealed(game_id));

-- The core rule: you rate your teammates (never yourself) plus the ref, only after the
-- final whistle. Rating the other team is a Pro extra, shown separately in the app.
create or replace function public.can_rate(g public.games, rater uuid, tgt text)
returns boolean language sql stable as $$
  select g.status = 'final' and not public.game_revealed(g.id) and (
    (g.team_a->'playerIds') ? rater::text or (g.team_b->'playerIds') ? rater::text
  ) and (
    (tgt = 'ref' and g.ref is not null and coalesce(g.ref->>'userId', '') <> rater::text)
    or (tgt <> 'ref' and tgt <> rater::text
        and ((g.team_a->'playerIds') ? tgt or (g.team_b->'playerIds') ? tgt))
  );
$$;

create policy "rate your teammates and the ref"
  on public.ratings for insert to authenticated
  with check (
    rater_id = auth.uid()
    and exists (select 1 from public.games g where g.id = game_id and public.can_rate(g, auth.uid(), target))
  );

create policy "change your own ratings"
  on public.ratings for update to authenticated
  using (rater_id = auth.uid())
  with check (
    rater_id = auth.uid()
    and exists (select 1 from public.games g where g.id = game_id and public.can_rate(g, auth.uid(), target))
  );

-- ============ RSVPs ============
create table if not exists public.rsvps (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('in', 'out')),
  created_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
alter table public.rsvps enable row level security;
create policy "rsvps are visible to signed-in users" on public.rsvps for select to authenticated using (true);
create policy "rsvp for yourself" on public.rsvps for insert to authenticated with check (user_id = auth.uid());
create policy "change your rsvp" on public.rsvps for update to authenticated using (user_id = auth.uid());
create policy "withdraw your rsvp" on public.rsvps for delete to authenticated using (user_id = auth.uid());

-- ============ Comments ============
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 500),
  parent_id uuid references public.comments(id) on delete cascade,  -- the comment this replies to
  created_at timestamptz not null default now()
);
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
alter table public.comments enable row level security;
create policy "comments are visible to signed-in users" on public.comments for select to authenticated using (true);
create policy "post as yourself" on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy "delete your own comments" on public.comments for delete to authenticated using (user_id = auth.uid());

-- ============ Player stats ============
-- Each player enters only their own line (goals, assists, points...) for games they played in.
-- Stats lock when voting closes.
create table if not exists public.player_stats (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
alter table public.player_stats enable row level security;

create or replace function public.played_in(gid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.games g where g.id = gid and g.status = 'final'
      and ((g.team_a->'playerIds') ? uid::text or (g.team_b->'playerIds') ? uid::text)
  );
$$;

create policy "stats are visible to signed-in users" on public.player_stats for select to authenticated using (true);
create policy "enter your own stats" on public.player_stats for insert to authenticated
  with check (user_id = auth.uid() and public.played_in(game_id, auth.uid()) and not public.game_revealed(game_id));
create policy "edit your own stats" on public.player_stats for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.played_in(game_id, auth.uid()) and not public.game_revealed(game_id));

-- ============ Friends ============
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
-- One friendship per pair, whichever direction it was sent in.
create unique index if not exists friendships_pair
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;

create policy "see your own friendships"
  on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
create policy "send a friend request"
  on public.friendships for insert to authenticated
  with check (requester = auth.uid() and status = 'pending');
create policy "accept a request sent to you"
  on public.friendships for update to authenticated
  using (addressee = auth.uid()) with check (addressee = auth.uid());
create policy "remove or decline a friendship"
  on public.friendships for delete to authenticated
  using (auth.uid() in (requester, addressee));

-- ============ Profile pictures ============
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "anyone can view avatars"
  on storage.objects for select using (bucket_id = 'avatars');
create policy "upload your own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace your own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete your own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============ Account deletion ============
-- Apple requires that people can delete their account from inside the app.
-- Deleting the auth user cascades to their profile, ratings, comments, RSVPs, stats and friendships.
-- (The app removes their profile pictures through the Storage API first.)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Who Cooked: reporting and blocking (App Store guideline 1.2 for user-generated content).

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('comment', 'user')),
  target_id text not null,
  reason text not null default '',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "file a report" on public.reports;
create policy "file a report" on public.reports for insert to authenticated with check (reporter = auth.uid());
-- No select policy: reports are only visible in the Supabase dashboard (Table Editor > reports).

create table if not exists public.blocks (
  blocker uuid not null references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
drop policy if exists "see your blocks" on public.blocks;
drop policy if exists "block someone" on public.blocks;
drop policy if exists "unblock someone" on public.blocks;
create policy "see your blocks" on public.blocks for select to authenticated using (blocker = auth.uid());
create policy "block someone" on public.blocks for insert to authenticated with check (blocker = auth.uid());
create policy "unblock someone" on public.blocks for delete to authenticated using (blocker = auth.uid());

-- Who Cooked: reserved usernames (exact match, case-insensitive).
-- "messi" is reserved; "messi10" or "leo.messi" are allowed. Same list as reserved.js.

create table if not exists public.reserved_usernames (name text primary key);
alter table public.reserved_usernames enable row level security;
-- No policies: only reachable through the function below.

insert into public.reserved_usernames (name) values
  ('aaronjudge'),
  ('admin'),
  ('administrator'),
  ('ajawilson'),
  ('alexmorgan'),
  ('alisson'),
  ('alphonsodavies'),
  ('angelreese'),
  ('anonymous'),
  ('antman'),
  ('barkley'),
  ('beckham'),
  ('bellingham'),
  ('benzema'),
  ('bizboxd'),
  ('bonmati'),
  ('booker'),
  ('boskovic'),
  ('brady'),
  ('breannastewart'),
  ('bronny'),
  ('brunson'),
  ('buffon'),
  ('caitlinclark'),
  ('casillas'),
  ('colepalmer'),
  ('courtois'),
  ('cr7'),
  ('cristiano'),
  ('cristianoronaldo'),
  ('cruyff'),
  ('curry'),
  ('dame'),
  ('damianlillard'),
  ('debruyne'),
  ('dembele'),
  ('devinbooker'),
  ('djokovic'),
  ('doncic'),
  ('drogba'),
  ('duncan'),
  ('durant'),
  ('dwyanewade'),
  ('earvinngapeth'),
  ('edenhazard'),
  ('egonu'),
  ('embiid'),
  ('erlinghaaland'),
  ('everyone'),
  ('federer'),
  ('figo'),
  ('foden'),
  ('garnett'),
  ('gavi'),
  ('gerrard'),
  ('giannis'),
  ('giba'),
  ('griezmann'),
  ('haaland'),
  ('haliburton'),
  ('harden'),
  ('harrykane'),
  ('hazard'),
  ('help'),
  ('ibrahimovic'),
  ('iniesta'),
  ('irving'),
  ('iverson'),
  ('jamesharden'),
  ('jamorant'),
  ('jaysontatum'),
  ('jimmybutler'),
  ('jokic'),
  ('jordan'),
  ('julianalvarez'),
  ('kaka'),
  ('kante'),
  ('karch'),
  ('karchkiraly'),
  ('kareem'),
  ('kawhi'),
  ('kd'),
  ('kdb'),
  ('kevindurant'),
  ('kingjames'),
  ('kirakaraly'),
  ('kobe'),
  ('kobebryant'),
  ('kurek'),
  ('kvaratskhelia'),
  ('kylianmbappe'),
  ('kyrie'),
  ('lamineyamal'),
  ('lampard'),
  ('larrybird'),
  ('lautaro'),
  ('lebron'),
  ('lebronjames'),
  ('leomessi'),
  ('lewandowski'),
  ('lillard'),
  ('lionelmessi'),
  ('luissuarez'),
  ('luka'),
  ('lukadoncic'),
  ('magicjohnson'),
  ('mahomes'),
  ('maradona'),
  ('martinelli'),
  ('mbappe'),
  ('mcgregor'),
  ('mckennie'),
  ('melissavargas'),
  ('messi'),
  ('michaeljordan'),
  ('mj'),
  ('mod'),
  ('moderator'),
  ('modric'),
  ('morant'),
  ('mosalah'),
  ('musiala'),
  ('nadal'),
  ('neuer'),
  ('neymar'),
  ('neymarjr'),
  ('ngapeth'),
  ('nowitzki'),
  ('null'),
  ('odegaard'),
  ('official'),
  ('ohtani'),
  ('olajuwon'),
  ('osimhen'),
  ('paolaegonu'),
  ('patrickmahomes'),
  ('pedri'),
  ('pele'),
  ('phelps'),
  ('pippen'),
  ('pirlo'),
  ('pogba'),
  ('pulisic'),
  ('putellas'),
  ('puyol'),
  ('rapinoe'),
  ('rashford'),
  ('ref'),
  ('referee'),
  ('rivaldo'),
  ('rodman'),
  ('rodri'),
  ('ronaldinho'),
  ('ronaldo'),
  ('rooney'),
  ('root'),
  ('sadiomane'),
  ('saka'),
  ('salah'),
  ('serena'),
  ('serenawilliams'),
  ('sergioramos'),
  ('sga'),
  ('shai'),
  ('shaq'),
  ('shaquille'),
  ('simonebiles'),
  ('sonheungmin'),
  ('sportsboxd'),
  ('staff'),
  ('stephcurry'),
  ('stephencurry'),
  ('suarez'),
  ('support'),
  ('system'),
  ('tatum'),
  ('taurasi'),
  ('team'),
  ('thierryhenry'),
  ('tigerwoods'),
  ('timduncan'),
  ('tombrady'),
  ('totti'),
  ('undefined'),
  ('usainbolt'),
  ('valverde'),
  ('vandijk'),
  ('vini'),
  ('vinicius'),
  ('viniciusjr'),
  ('wembanyama'),
  ('wemby'),
  ('westbrook'),
  ('who_cooked'),
  ('whocooked'),
  ('whocookedapp'),
  ('wilfredoleon'),
  ('wilt'),
  ('wirtz'),
  ('xavi'),
  ('yamal'),
  ('zaytsev'),
  ('zhuting'),
  ('zidane'),
  ('zion'),
  ('zlatan')
on conflict do nothing;

create or replace function public.username_reserved(u text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reserved_usernames where name = lower(trim(u)));
$$;
grant execute on function public.username_reserved(text) to anon, authenticated;

-- Block picking a reserved username (temporary Google/phone usernames are never exact matches).
create or replace function public.block_reserved_username()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT' or new.username is distinct from old.username) and public.username_reserved(new.username) then
    raise exception 'That username is taken.' using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists profiles_reserved_username on public.profiles;
create trigger profiles_reserved_username before insert or update of username on public.profiles
  for each row execute function public.block_reserved_username();

-- Email sign-up with a reserved name: give a temporary username instead of failing the sign-up;
-- the player then picks a real one on first login.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  picked text := meta->>'username';
  chose boolean := meta ? 'username';
  base text;
begin
  if picked is not null and public.username_reserved(picked) then
    picked := null;
    chose := false;
  end if;
  -- Email sign-ups choose a username up front. Google and phone sign-ups get a
  -- temporary unique one and pick their real username on first login.
  if picked is null then
    base := lower(regexp_replace(coalesce(split_part(new.email, '@', 1), ''), '[^a-zA-Z0-9_.]', '', 'g'));
    if length(base) < 3 then base := 'player'; end if;
    picked := left(base, 14) || '_' || substr(replace(new.id::text, '-', ''), 1, 5);
  end if;

  insert into public.profiles (id, username, display_name, avatar_url, onboarded, color)
  values (
    new.id,
    picked,
    coalesce(meta->>'display_name', meta->>'full_name', meta->>'name', meta->>'username', 'Player'),
    meta->>'avatar_url',
    chose,
    (array['#c6ff3d','#38bdf8','#f97316','#a78bfa','#f472b6','#facc15','#2dd4bf','#fb7185','#818cf8','#4ade80'])[1 + floor(random() * 10)::int]
  )
  on conflict (id) do nothing;
  return new;
end $$;
-- Player cap (set by the game's creator), public games on the nearby map, and "maybe" RSVPs.
alter table public.games add column if not exists cap int;
alter table public.games drop constraint if exists games_cap_check;
alter table public.games add constraint games_cap_check check (cap is null or (cap between 2 and 100));
alter table public.games add column if not exists is_public boolean not null default false;
alter table public.games add column if not exists lat double precision;
alter table public.games add column if not exists lng double precision;
create index if not exists games_public_idx on public.games (is_public, played_on) where is_public;

alter table public.rsvps drop constraint if exists rsvps_status_check;
alter table public.rsvps add constraint rsvps_status_check check (status in ('in', 'out', 'maybe'));
-- Pro profile customization: { frame, theme, title, number }.
alter table public.profiles add column if not exists style jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_style_size;
alter table public.profiles add constraint profiles_style_size check (pg_column_size(style) < 2048);
