import type { SupabaseClient } from '@supabase/supabase-js';
import { maybePush } from './zalo-push';

export const ROOM_SIZE = 8;
export const TOTAL_ROUNDS = 3;
export const AFK_INTERVAL_MIN = 30;
export const PAUSE_INTERVAL_MIN = 120;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export type Role = 'wolf' | 'seer' | 'villager';
export type Winner = 'wolves' | 'villagers';

export interface Room {
  id: string;
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  current_round: number;
  current_turn: number;
  turn_interval_minutes: number;
  turn_deadline: string | null;
  winner: Winner | null;
}

export interface Player {
  id: string;
  room_id: string;
  zalo_id: string;
  name: string;
  seat: number;
  role: Role | null;
  is_alive: boolean;
  has_spoken: boolean;
  is_afk: boolean;
  seer_checked_round: number;
  seer_results?: Record<string, boolean> | null;
}

/* ------------------------------------------------------------------ */
/* Thời gian (giờ Việt Nam, UTC+7 — Vercel chạy UTC nên phải đổi múi giờ) */
/* ------------------------------------------------------------------ */

export function vnMinutes(now: Date): number {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return vn.getUTCHours() * 60 + vn.getUTCMinutes();
}

/**
 * Khoảng cách giữa các lượt (phút):
 *  21:00–8:30 => 120 (tạm nghỉ) | 12:00–13:00 => 10
 *  13:00–17:00 => 30            | còn lại (8:30–12:00, 17:00–21:00) => 15
 */
export function getTurnInterval(now: Date = new Date()): number {
  const t = vnMinutes(now);
  if (t >= 21 * 60 || t < 8 * 60 + 30) return 120;
  if (t >= 12 * 60 && t < 13 * 60) return 10;
  if (t >= 13 * 60 && t < 17 * 60) return 30;
  return 15;
}

/** 8:30 sáng kế tiếp (giờ VN) + 15 phút. */
function nextMorningDeadline(now: Date): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  let start = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate(), 8, 30);
  if (vnMinutes(now) >= 8 * 60 + 30) start += 24 * 3600 * 1000;
  return new Date(start - VN_OFFSET_MS + 15 * 60 * 1000);
}

/** Tính interval + deadline cho 1 lượt. Người AFK: lượt kế tiếp là 30 phút. */
export function computeTurn(now: Date, isAfk: boolean): { interval: number; deadline: Date } {
  const base = getTurnInterval(now);
  if (base >= PAUSE_INTERVAL_MIN) {
    return { interval: PAUSE_INTERVAL_MIN, deadline: nextMorningDeadline(now) };
  }
  const interval = isAfk ? Math.max(base, AFK_INTERVAL_MIN) : base;
  const deadline = new Date(now.getTime() + interval * 60 * 1000);
  // Hạn lượt rơi vào 21:00–8:30 => dời sang sáng hôm sau (tránh bị tính quá hạn oan khi cron chạy lại lúc 8:30)
  if (getTurnInterval(deadline) >= PAUSE_INTERVAL_MIN) {
    return { interval: PAUSE_INTERVAL_MIN, deadline: nextMorningDeadline(now) };
  }
  return { interval, deadline };
}

/* ------------------------------------------------------------------ */
/* Tiện ích                                                            */
/* ------------------------------------------------------------------ */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 2 Sói + 1 Tiên tri + 5 Dân làng. */
export function assignRoles(): Role[] {
  return shuffle<Role>(['wolf', 'wolf', 'seer', 'villager', 'villager', 'villager', 'villager', 'villager']);
}

async function getPlayers(sb: SupabaseClient, roomId: string): Promise<Player[]> {
  const { data } = await sb.from('werewolf_players').select('*').eq('room_id', roomId).order('seat');
  return (data ?? []) as Player[];
}

async function getRoom(sb: SupabaseClient, roomId: string): Promise<Room | null> {
  const { data } = await sb.from('werewolf_rooms').select('*').eq('id', roomId).maybeSingle();
  return (data as Room | null) ?? null;
}

/* ------------------------------------------------------------------ */
/* Phòng & người chơi                                                  */
/* ------------------------------------------------------------------ */

/**
 * Lấy ghế trong phòng. Việc cấp ghế do hàm Postgres `werewolf_take_seat` làm
 * (khoá row của phòng => tuần tự), tránh đụng unique(room_id, seat) khi nhiều
 * người bấm "vào phòng" cùng lúc.
 */
async function joinRoom(
  sb: SupabaseClient,
  roomId: string,
  zaloId: string,
  name: string,
  now: Date,
): Promise<{ roomId: string; playerId: string } | 'full'> {
  const { data, error } = await sb.rpc('werewolf_take_seat', {
    p_room_id: roomId,
    p_zalo_id: zaloId,
    p_name: name,
    p_max: ROOM_SIZE,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('room_full') || msg.includes('room_not_waiting')) return 'full';
    throw new Error(msg || 'Không vào được phòng • 加入失败');
  }

  const player = (Array.isArray(data) ? data[0] : data) as { id: string; seat: number } | null;
  if (!player) throw new Error('Không vào được phòng • 加入失败');

  if (player.seat + 1 >= ROOM_SIZE) await startRoom(sb, roomId, now);
  return { roomId, playerId: player.id };
}

/** Vào phòng đang chờ (hoặc tạo mới). Idempotent: nếu đã ở trong phòng thì trả về phòng đó. */
export async function quickJoin(
  sb: SupabaseClient,
  zaloId: string,
  name: string,
  now: Date = new Date(),
  newGame = false,
): Promise<{ roomId: string; playerId: string }> {
  const { data: mine } = await sb
    .from('werewolf_players')
    .select('id, room_id')
    .eq('zalo_id', zaloId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (mine && mine.length) {
    const { data: r } = await sb.from('werewolf_rooms').select('status').eq('id', mine[0].room_id).maybeSingle();
    if (r && (r.status !== 'finished' || !newGame)) {
      return { roomId: mine[0].room_id as string, playerId: mine[0].id as string };
    }
  }

  // Tìm/tạo phòng chờ bằng RPC: khoá advisory ở Postgres bảo đảm khi nhiều người
  // bấm cùng lúc (lúc chưa có phòng nào) thì chỉ MỘT phòng được tạo.
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: roomId, error } = await sb.rpc('werewolf_find_or_create_room', { p_max: ROOM_SIZE });
    if (error || !roomId) throw new Error(error?.message || 'Không tạo được phòng • 创建房间失败');

    const joined = await joinRoom(sb, String(roomId), zaloId, name, now);
    if (joined !== 'full') return joined;
    // phòng vừa đầy / vừa bắt đầu trong lúc ta chen vào => thử lại
  }

  throw new Error('Phòng đang đầy, thử lại nhé • 房间已满，请重试');
}

/** Tìm phòng gần nhất của người chơi mà KHÔNG tạo/ghế mới (dùng để tự quay lại ván đang chơi). */
export async function findMyRoom(sb: SupabaseClient, zaloId: string): Promise<{ roomId: string; playerId: string } | null> {
  const { data } = await sb
    .from('werewolf_players')
    .select('id, room_id')
    .eq('zalo_id', zaloId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (!data || !data.length) return null;
  return { roomId: data[0].room_id as string, playerId: data[0].id as string };
}

/** Dev: thêm bot cho đủ 8 người để test. Bot không bao giờ nói => sẽ bị đánh dấu AFK. */
export async function addBots(sb: SupabaseClient, roomId: string, now: Date = new Date()) {
  const room = await getRoom(sb, roomId);
  if (!room || room.status !== 'waiting') return;
  const players = await getPlayers(sb, roomId);
  const botIds = new Set(players.filter((p) => p.zalo_id.startsWith('bot-')).map((p) => p.zalo_id));

  for (let seat = players.length; seat < ROOM_SIZE; seat++) {
    const fakeId = `bot-${room.code}-${seat}`;
    if (botIds.has(fakeId)) continue;
    await sb.rpc('werewolf_take_seat', {
      p_room_id: roomId,
      p_zalo_id: fakeId,
      p_name: `Bot ${seat + 1}`,
      p_max: ROOM_SIZE,
    });
  }
  await startRoom(sb, roomId, now);
}

/**
 * Chia vai + bắt đầu ván. Chỉ MỘT người thắng "cờ" đổi status (update có điều kiện
 * `status = 'waiting'`), nên dù nhiều request gọi cùng lúc cũng không chia vai 2 lần.
 */
async function startRoom(sb: SupabaseClient, roomId: string, now: Date) {
  const players = await getPlayers(sb, roomId);
  if (players.length < ROOM_SIZE) return;

  const { data: flipped, error } = await sb
    .from('werewolf_rooms')
    .update({ status: 'playing', current_round: 1, current_turn: 0, winner: null })
    .eq('id', roomId)
    .eq('status', 'waiting')
    .select('id');
  if (error) throw new Error(error.message);
  if (!flipped || flipped.length === 0) return; // người khác đã bắt đầu ván này

  const seated = [...players].sort((a, b) => a.seat - b.seat).slice(0, ROOM_SIZE);
  const roles = assignRoles();
  await Promise.all(
    seated.map((p, i) =>
      sb
        .from('werewolf_players')
        .update({ role: roles[i], is_alive: true, has_spoken: false, is_afk: false, seer_checked_round: 0, seer_results: {} })
        .eq('id', p.id),
    ),
  );
  await advanceTurn(sb, roomId, now);
}

/* ------------------------------------------------------------------ */
/* Vòng chơi                                                           */
/* ------------------------------------------------------------------ */

/** Chuyển sang người kế tiếp chưa nói; nếu hết người => kết thúc vòng. */
export async function advanceTurn(sb: SupabaseClient, roomId: string, now: Date = new Date()) {
  const room = await getRoom(sb, roomId);
  if (!room || room.status !== 'playing') return;
  const players = await getPlayers(sb, roomId);

  const next = players
    .filter((p) => p.is_alive && !p.has_spoken)
    .sort((a, b) => a.seat - b.seat)[0];

  if (!next) {
    await endRound(sb, room, players, now);
    return;
  }

  const { interval, deadline } = computeTurn(now, next.is_afk);
  await sb
    .from('werewolf_rooms')
    .update({
      current_turn: next.seat,
      turn_interval_minutes: interval,
      turn_deadline: deadline.toISOString(),
    })
    .eq('id', roomId);

  // P1-6: tìm người vừa chỉ trích `next` (vote_for = next.id) ở vòng này để đưa vào
  // câu push thay cho tên "Lan" cố định. Không tìm thấy thì dùng "Mọi người".
  let accuser = 'Mọi người';
  try {
    const { data: accuse } = await sb
      .from('werewolf_messages')
      .select('player_id, vote_for')
      .eq('room_id', roomId)
      .eq('vote_for', next.id)
      .eq('round', room.current_round)
      .order('created_at', { ascending: false })
      .limit(1);
    const acc = (accuse ?? [])[0] as { player_id: string } | undefined;
    if (acc) {
      const who = players.find((p) => p.id === acc.player_id);
      if (who) accuser = who.name;
    }
  } catch {
    /* tra cứu accuser thất bại thì giữ tên mặc định, không chặn lượt chơi */
  }

  await maybePush(sb, next, 'turn_reminder', now, accuser).catch(() => undefined);
}

function checkWinner(alive: Player[], lastRound: boolean): Winner | null {
  const wolves = alive.filter((p) => p.role === 'wolf').length;
  const others = alive.length - wolves;
  if (wolves === 0) return 'villagers';
  if (wolves >= others) return 'wolves';
  if (lastRound) return 'wolves'; // hết 3 vòng mà Sói còn sống => Sói thắng
  return null;
}

async function endRound(sb: SupabaseClient, room: Room, players: Player[], now: Date) {
  const { data: msgs } = await sb
    .from('werewolf_messages')
    .select('player_id, vote_for')
    .eq('room_id', room.id)
    .eq('round', room.current_round);

  const aliveIds = new Set(players.filter((p) => p.is_alive).map((p) => p.id));
  const tally = new Map<string, number>();
  for (const m of (msgs ?? []) as { player_id: string; vote_for: string | null }[]) {
    if (m.vote_for && aliveIds.has(m.vote_for) && aliveIds.has(m.player_id)) {
      tally.set(m.vote_for, (tally.get(m.vote_for) ?? 0) + 1);
    }
  }

  // Người nhiều phiếu nhất bị loại; hòa => không ai bị loại
  let eliminated: string | null = null;
  let top = 0;
  let tie = false;
  for (const [id, count] of Array.from(tally.entries())) {
    if (count > top) {
      top = count;
      eliminated = id;
      tie = false;
    } else if (count === top) {
      tie = true;
    }
  }
  if (tie) eliminated = null;

  if (eliminated) {
    await sb.from('werewolf_players').update({ is_alive: false }).eq('id', eliminated);
  }

  const aliveAfter = players.filter((p) => p.is_alive && p.id !== eliminated);
  const winner = checkWinner(aliveAfter, room.current_round >= TOTAL_ROUNDS);

  await sb.from('werewolf_players').update({ has_spoken: false }).eq('room_id', room.id);

  if (winner) {
    await sb
      .from('werewolf_rooms')
      .update({ status: 'finished', winner, turn_deadline: null })
      .eq('id', room.id);
    return;
  }

  await sb
    .from('werewolf_rooms')
    .update({ current_round: room.current_round + 1, current_turn: 0 })
    .eq('id', room.id);
  await advanceTurn(sb, room.id, now);
}

/** Người chơi gửi lời nói (+ có thể bỏ phiếu). */
export async function submitMessage(
  sb: SupabaseClient,
  roomId: string,
  playerId: string,
  content: string,
  voteFor: string | null,
  now: Date = new Date(),
): Promise<{ ok: boolean; error?: string }> {
  const text = content.trim().slice(0, 200);
  if (!text) return { ok: false, error: 'Hãy nhập nội dung • 请输入内容' };

  const room = await getRoom(sb, roomId);
  if (!room || room.status !== 'playing') return { ok: false, error: 'Ván chưa bắt đầu • 游戏未进行' };

  const players = await getPlayers(sb, roomId);
  const me = players.find((p) => p.id === playerId);
  if (!me || !me.is_alive) return { ok: false, error: 'Bạn không thể nói • 你不能发言' };
  if (room.current_turn !== me.seat || me.has_spoken) return { ok: false, error: 'Chưa đến lượt bạn • 还没轮到你' };

  if (voteFor) {
    const target = players.find((p) => p.id === voteFor);
    if (!target || !target.is_alive || target.id === me.id) {
      return { ok: false, error: 'Phiếu không hợp lệ • 投票无效' };
    }
  }

  // Giành quyền nói bằng update có điều kiện: bấm đúp / cron cùng lúc thì chỉ 1 request thắng
  const { data: won } = await sb
    .from('werewolf_players')
    .update({ has_spoken: true, is_afk: false })
    .eq('id', playerId)
    .eq('has_spoken', false)
    .select('id');
  if (!won || won.length === 0) return { ok: false, error: 'Chưa đến lượt bạn • 还没轮到你' };

  const { error: insErr } = await sb.from('werewolf_messages').insert({
    room_id: roomId,
    player_id: playerId,
    round: room.current_round,
    content: text,
    vote_for: voteFor,
  });
  if (insErr) {
    await sb.from('werewolf_players').update({ has_spoken: false }).eq('id', playerId);
    return { ok: false, error: 'Không gửi được, thử lại • 发送失败，请重试' };
  }
  await advanceTurn(sb, roomId, now);
  return { ok: true };
}

/**
 * Cron: quá 15 phút (deadline) không nói => tự bỏ lượt, đánh dấu is_afk = true,
 * lượt kế tiếp của người đó là 30 phút. Không xử lý trong giờ tạm nghỉ 21:00–8:30.
 */
export async function checkTimeout(sb: SupabaseClient, now: Date = new Date()) {
  if (getTurnInterval(now) >= PAUSE_INTERVAL_MIN) return { skipped: 0, paused: true };

  const { data: rooms } = await sb
    .from('werewolf_rooms')
    .select('*')
    .eq('status', 'playing')
    .lte('turn_deadline', now.toISOString());

  let skipped = 0;
  for (const stale of (rooms ?? []) as Room[]) {
    // Đọc lại phòng: trong lúc cron chạy, người chơi có thể đã nói và phòng đã sang lượt khác
    const room = await getRoom(sb, stale.id);
    if (!room || room.status !== 'playing' || !room.turn_deadline || new Date(room.turn_deadline) > now) continue;

    const { data: p } = await sb
      .from('werewolf_players')
      .select('*')
      .eq('room_id', room.id)
      .eq('seat', room.current_turn)
      .maybeSingle();

    const player = p as Player | null;
    if (player && player.is_alive && !player.has_spoken) {
      const { data: won } = await sb
        .from('werewolf_players')
        .update({ is_afk: true, has_spoken: true })
        .eq('id', player.id)
        .eq('has_spoken', false)
        .select('id');
      if (!won || won.length === 0) continue; // người chơi vừa kịp nói
      await sb.from('werewolf_messages').insert({
        room_id: room.id,
        player_id: player.id,
        round: room.current_round,
        content: '⏭️ Bỏ lượt vì quá hạn • 超时自动跳过',
        vote_for: null,
      });
    }
    await advanceTurn(sb, room.id, now);
    skipped++;
  }
  return { skipped, paused: false };
}

/** Push theo lịch: 8:30 sáng (người đang đến lượt), 20:30 tối (người chưa nói). */
export async function runPushSchedule(sb: SupabaseClient, now: Date = new Date()) {
  const t = vnMinutes(now);
  const isMorning = t >= 8 * 60 + 30 && t < 8 * 60 + 35;
  const isEvening = t >= 20 * 60 + 30 && t < 20 * 60 + 35;
  if (!isMorning && !isEvening) return { morning: 0, evening: 0 };

  const { data: rooms } = await sb.from('werewolf_rooms').select('*').eq('status', 'playing');
  let morning = 0;
  let evening = 0;

  for (const room of (rooms ?? []) as Room[]) {
    const players = await getPlayers(sb, room.id);
    if (isMorning) {
      const cur = players.find((p) => p.seat === room.current_turn && p.is_alive && !p.has_spoken);
      if (cur && (await maybePush(sb, cur, 'morning', now)).sent) morning++;
    }
    if (isEvening) {
      for (const p of players.filter((x) => x.is_alive && !x.has_spoken)) {
        if ((await maybePush(sb, p, 'evening', now)).sent) evening++;
      }
    }
  }
  return { morning, evening };
}

/** Tiên tri soi 1 người / vòng. */
export async function seerCheck(
  sb: SupabaseClient,
  roomId: string,
  playerId: string,
  targetId: string,
): Promise<{ ok: boolean; isWolf?: boolean; error?: string }> {
  const room = await getRoom(sb, roomId);
  if (!room || room.status !== 'playing') return { ok: false, error: 'Ván chưa bắt đầu • 游戏未进行' };
  const players = await getPlayers(sb, roomId);
  const me = players.find((p) => p.id === playerId);
  const target = players.find((p) => p.id === targetId);
  if (!me || me.role !== 'seer' || !me.is_alive) return { ok: false, error: 'Bạn không phải Tiên tri • 你不是预言家' };
  if (!target || !target.is_alive || target.id === me.id) return { ok: false, error: 'Mục tiêu không hợp lệ • 目标无效' };
  if (me.seer_checked_round >= room.current_round) return { ok: false, error: 'Vòng này bạn đã soi rồi • 本轮已查验' };

  const isWolf = target.role === 'wolf';
  // Giành lượt soi nguyên tử (chống soi 2 lần khi bấm đúp) rồi lưu kết quả để tải lại trang không mất
  const { data: won } = await sb
    .from('werewolf_players')
    .update({ seer_checked_round: room.current_round, seer_results: { ...(me.seer_results ?? {}), [target.id]: isWolf } })
    .eq('id', me.id)
    .lt('seer_checked_round', room.current_round)
    .select('id');
  if (!won || won.length === 0) return { ok: false, error: 'Vòng này bạn đã soi rồi • 本轮已查验' };
  return { ok: true, isWolf };
}

/**
 * Tìm người chơi theo zalo id trong phòng.
 * API dùng hàm này để lấy `playerId` từ session đã ký ở server — KHÔNG tin
 * `playerId` do client gửi lên (nếu tin, ai biết id là điều khiển được người khác).
 */
export async function resolvePlayer(
  sb: SupabaseClient,
  roomId: string,
  zaloId: string,
): Promise<Player | null> {
  const { data } = await sb
    .from('werewolf_players')
    .select('*')
    .eq('room_id', roomId)
    .eq('zalo_id', zaloId)
    .maybeSingle();
  return (data as Player | null) ?? null;
}

/** Trạng thái công khai cho 1 người chơi (chỉ thấy vai trò của mình; Sói thấy đồng đội). */
export async function getState(sb: SupabaseClient, roomId: string, playerId: string) {
  const room = await getRoom(sb, roomId);
  if (!room) return null;
  const players = await getPlayers(sb, roomId);
  const me = players.find((p) => p.id === playerId);
  if (!me) return null;

  const { data: messages } = await sb
    .from('werewolf_messages')
    .select('id, player_id, round, content, vote_for, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  const finished = room.status === 'finished';
  const pub = players.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    is_alive: p.is_alive,
    has_spoken: p.has_spoken,
    is_afk: p.is_afk,
    role: finished || p.id === me.id || (me.role === 'wolf' && p.role === 'wolf') ? p.role : null,
  }));

  return {
    room,
    players: pub,
    messages: messages ?? [],
    me: {
      id: me.id,
      seat: me.seat,
      role: me.role,
      seerUsed: me.seer_checked_round >= room.current_round,
      seerResults: me.role === 'seer' ? (me.seer_results ?? {}) : {},
    },
  };
}
