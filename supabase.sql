-- Mõm Fish World • Supabase schema
create extension if not exists pgcrypto;

-- ============ Werewolf ============
create table if not exists werewolf_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'waiting'
    check (status in ('waiting', 'playing', 'finished')),
  current_round int not null default 1,
  current_turn int not null default 0,              -- = seat của người đang được nói
  turn_interval_minutes int not null default 15,
  turn_deadline timestamptz,
  winner text check (winner in ('wolves', 'villagers')),
  created_at timestamptz not null default now()
);

create table if not exists werewolf_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references werewolf_rooms(id) on delete cascade,
  zalo_id text not null,
  name text not null,
  seat int not null default 0,                      -- thêm so với PRD: thứ tự nói
  role text check (role in ('wolf', 'seer', 'villager')),
  is_alive boolean not null default true,
  has_spoken boolean not null default false,
  is_afk boolean not null default false,
  seer_checked_round int not null default 0,        -- thêm so với PRD: tiên tri soi 1 lần/vòng
  seer_results jsonb not null default '{}'::jsonb,  -- kết quả soi: { playerId: true/false }
  created_at timestamptz not null default now(),
  unique (room_id, zalo_id),
  unique (room_id, seat)
);

create table if not exists werewolf_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references werewolf_rooms(id) on delete cascade,
  player_id uuid not null references werewolf_players(id) on delete cascade,
  round int not null,
  content text not null,
  vote_for uuid references werewolf_players(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists werewolf_push_logs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references werewolf_players(id) on delete cascade,
  type text not null check (type in ('turn_reminder', 'morning', 'evening')),
  sent_at timestamptz not null default now()
);

-- ============ Coins & logs ============
create table if not exists user_coins (
  user_id text primary key,
  coins bigint not null default 0,
  total_earned bigint not null default 0,
  total_spent bigint not null default 0
);

create table if not exists game_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  game_id text not null,
  score int not null default 0,
  coins_earned int not null default 0,
  played_at timestamptz not null default now()
);

-- ============ RPC: chọn/tạo phòng (matchmaking) ============
-- Vì sao cần: nếu client tự "tìm phòng waiting rồi tạo nếu không có", 8 người
-- bấm cùng lúc lúc chưa có phòng nào sẽ tạo ra 8 phòng rỗng. Hàm này lấy
-- advisory lock nên việc chọn phòng được tuần tự hoá: người đầu tạo phòng,
-- những người sau thấy phòng đó.
create or replace function werewolf_find_or_create_room(p_max int default 8)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  perform pg_advisory_xact_lock(hashtext('werewolf_matchmaking'));

  select r.id into v_id
    from werewolf_rooms r
   where r.status = 'waiting'
     and (select count(*) from werewolf_players p where p.room_id = r.id) < p_max
   order by r.created_at
   limit 1
   for update;

  if v_id is not null then
    return v_id;
  end if;

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    begin
      insert into werewolf_rooms (code) values (v_code) returning id into v_id;
      return v_id;
    exception when unique_violation then
      -- trùng mã phòng hiếm gặp: sinh mã khác
    end;
  end loop;
end;
$$;

revoke execute on function werewolf_find_or_create_room(int) from public, anon, authenticated;
grant execute on function werewolf_find_or_create_room(int) to service_role;

-- ============ RPC: cấp ghế (seat) nguyên tử ============
-- Vì sao cần: joinRoom cũ đọc count() rồi insert seat = count => nhiều người
-- bấm "vào phòng" cùng lúc sẽ đụng unique(room_id, seat) và 1 nửa bị lỗi.
-- Hàm này khoá row của phòng (FOR UPDATE) nên việc cấp ghế được tuần tự hoá,
-- và tự chặn khi phòng đã đủ người / đã bắt đầu.
create or replace function werewolf_take_seat(
  p_room_id uuid,
  p_zalo_id text,
  p_name text,
  p_max int default 8
)
returns werewolf_players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_seat int;
  v_row werewolf_players;
begin
  -- Khoá phòng: mọi lần cấp ghế trong cùng phòng xếp hàng tại đây
  select status into v_status from werewolf_rooms where id = p_room_id for update;
  if v_status is null then
    raise exception 'room_not_found';
  end if;

  -- Đã ở trong phòng thì trả lại ghế cũ (idempotent)
  select * into v_row from werewolf_players
   where room_id = p_room_id and zalo_id = p_zalo_id;
  if v_row.id is not null then
    return v_row;
  end if;

  if v_status <> 'waiting' then
    raise exception 'room_not_waiting';
  end if;

  select coalesce(max(seat) + 1, 0) into v_seat
    from werewolf_players where room_id = p_room_id;

  if v_seat >= p_max then
    raise exception 'room_full';
  end if;

  insert into werewolf_players (room_id, zalo_id, name, seat)
  values (p_room_id, p_zalo_id, trim(p_name), v_seat)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function werewolf_take_seat(uuid, text, text, int) from public, anon, authenticated;
grant execute on function werewolf_take_seat(uuid, text, text, int) to service_role;

-- ============ RPC: cộng xu nguyên tử (upsert user_coins) ============
-- Dùng cho /api/coins: cộng dồn coins + total_earned, chống mất mát khi gọi đồng thời.
create or replace function upsert_user_coins(p_user_id text, p_coins bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into user_coins (user_id, coins, total_earned, total_spent)
  values (p_user_id, greatest(0, p_coins), greatest(0, p_coins), 0)
  on conflict (user_id) do update
    set coins = user_coins.coins + greatest(0, p_coins),
        total_earned = user_coins.total_earned + greatest(0, p_coins);
end;
$$;

revoke execute on function upsert_user_coins(text, bigint) from public, anon, authenticated;
grant execute on function upsert_user_coins(text, bigint) to service_role;

-- ============ Migration cho DB đã tạo từ bản cũ (chạy an toàn nhiều lần) ============
alter table werewolf_players add column if not exists seer_results jsonb not null default '{}'::jsonb;

-- ============ Indexes ============
create unique index if not exists uq_messages_once_per_turn on werewolf_messages (room_id, player_id, round);
create index if not exists idx_rooms_status_deadline on werewolf_rooms (status, turn_deadline);
create index if not exists idx_players_room on werewolf_players (room_id, seat);
create index if not exists idx_players_zalo on werewolf_players (zalo_id, created_at desc);
create index if not exists idx_messages_room_round on werewolf_messages (room_id, round, created_at);
create index if not exists idx_push_player_sent on werewolf_push_logs (player_id, sent_at);
create index if not exists idx_game_logs_user on game_logs (user_id, played_at desc);

-- ============ RLS ============
-- Bật RLS và KHÔNG tạo policy: client (anon key) không đọc/ghi được gì.
-- Toàn bộ truy cập đi qua API route dùng service role key (bỏ qua RLS),
-- nhờ đó vai trò (Sói/Tiên tri) không bị lộ cho người chơi khác.
alter table werewolf_rooms enable row level security;
alter table werewolf_players enable row level security;
alter table werewolf_messages enable row level security;
alter table werewolf_push_logs enable row level security;
alter table user_coins enable row level security;
alter table game_logs enable row level security;
