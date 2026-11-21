/**
 * Integration test cho lib/werewolf.ts — chạy trên Supabase giả in-memory,
 * gọi đúng các hàm mà API route gọi (quickJoin / submitMessage / seerCheck /
 * checkTimeout / getState / addBots).
 *
 * Chạy: npm test
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { FakeDB, type Row } from './fake-supabase';
import {
  AFK_INTERVAL_MIN,
  PAUSE_INTERVAL_MIN,
  ROOM_SIZE,
  TOTAL_ROUNDS,
  addBots,
  checkTimeout,
  getState,
  getTurnInterval,
  quickJoin,
  seerCheck,
  submitMessage,
} from '../lib/werewolf';

// Không gọi Zalo OA thật trong test (maybePush sẽ dừng ở 'no_token')
delete process.env.ZALO_OA_ACCESS_TOKEN;

const HOUR = 3600 * 1000;
/** Giờ Việt Nam (UTC+7) ngày 21/11/2026. */
const vn = (h: number, m = 0, dayOffset = 0) => new Date(Date.UTC(2026, 10, 21 + dayOffset, h - 7, m));

let db: FakeDB;
let sb: any;

beforeEach(() => {
  db = new FakeDB();
  sb = db; // cùng một DB: test đọc thẳng bảng, code chạy qua query builder
});

const playersOf = (roomId: string): Row[] =>
  db
    .rows('werewolf_players')
    .filter((p) => p.room_id === roomId)
    .sort((a, b) => a.seat - b.seat);

const roomOf = (roomId: string): Row => db.rows('werewolf_rooms').find((r) => r.id === roomId)!;

async function fill(now: Date, count = ROOM_SIZE, prefix = 'p') {
  const joined: { roomId: string; playerId: string }[] = [];
  for (let i = 0; i < count; i++) joined.push(await quickJoin(sb, `${prefix}-${i}`, `P${i + 1}`, now));
  return { roomId: joined[0].roomId, joined };
}

/** Người đang được nói trong phòng. */
function current(roomId: string): Row {
  const seat = roomOf(roomId).current_turn;
  return playersOf(roomId).find((p) => p.seat === seat)!;
}

async function speakCurrent(roomId: string, vote: string | null = null, now?: Date) {
  const p = current(roomId);
  return submitMessage(sb, roomId, p.id, `P${p.seat + 1} nói`, vote, now);
}

/** Chạy hết 1 vòng (mỗi người còn sống nói 1 lần) với phiếu do `vote` quyết định. */
async function playRound(roomId: string, vote: (p: Row) => string | null, now?: Date) {
  const round = roomOf(roomId).current_round;
  for (let guard = 0; guard < ROOM_SIZE + 2; guard++) {
    const room = roomOf(roomId);
    if (room.status !== 'playing' || room.current_round !== round) return;
    const p = current(roomId);
    const res = await submitMessage(sb, roomId, p.id, `P${p.seat + 1} nói`, vote(p), now);
    assert.equal(res.ok, true, `ghế ${p.seat} phải nói được: ${res.error ?? ''}`);
  }
}

describe('Vào phòng & bắt đầu ván', () => {
  it('8 người vào cùng phòng thì ván bắt đầu, chia đúng 2 Sói + 1 Tiên tri + 5 Dân', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);

    const room = roomOf(roomId);
    assert.equal(room.status, 'playing');
    assert.equal(room.current_round, 1);
    assert.equal(room.current_turn, 0);
    assert.equal(room.turn_interval_minutes, 15);
    assert.ok(room.turn_deadline, 'phải có deadline cho lượt đầu');

    const players = playersOf(roomId);
    assert.equal(players.length, ROOM_SIZE);
    assert.deepEqual(
      players.map((p) => p.seat),
      [0, 1, 2, 3, 4, 5, 6, 7],
      'ghế phải là 0..7, không trùng / không thiếu',
    );
    const roles = players.map((p) => p.role).sort();
    assert.deepEqual(roles, ['seer', 'villager', 'villager', 'villager', 'villager', 'villager', 'wolf', 'wolf']);
  });

  it('8 người join song song vẫn chỉ có 1 phòng, 8 ghế khác nhau (không vỡ unique constraint)', async () => {
    const now = vn(10);
    const results = await Promise.all(
      Array.from({ length: ROOM_SIZE }, (_, i) => quickJoin(sb, `race-${i}`, `R${i}`, now)),
    );

    const rooms = new Set(results.map((r) => r.roomId));
    assert.equal(rooms.size, 1, 'tất cả phải vào cùng 1 phòng');
    const roomId = results[0].roomId;
    assert.equal(playersOf(roomId).length, ROOM_SIZE);
    assert.equal(new Set(playersOf(roomId).map((p) => p.seat)).size, ROOM_SIZE);
    assert.equal(roomOf(roomId).status, 'playing');
  });

  it('người thứ 9 phải sang phòng mới (không chen vào phòng đã bắt đầu)', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const ninth = await quickJoin(sb, 'nguoi-thu-9', 'P9', now);

    assert.notEqual(ninth.roomId, roomId);
    assert.equal(playersOf(ninth.roomId).length, 1);
    assert.equal(playersOf(roomId).length, ROOM_SIZE, 'phòng cũ vẫn đúng 8 người');
  });

  it('vào lại nhiều lần không tạo người chơi mới', async () => {
    const now = vn(10);
    const first = await quickJoin(sb, 'khach-a', 'A', now);
    const again = await quickJoin(sb, 'khach-a', 'A', now);
    assert.equal(again.playerId, first.playerId);
    assert.equal(again.roomId, first.roomId);
    assert.equal(playersOf(first.roomId).length, 1);
  });

  it('addBots lấp đầy 8 người và bắt đầu ván', async () => {
    const now = vn(10);
    const one = await quickJoin(sb, 'nguoi-that', 'Thật', now);
    await addBots(sb, one.roomId, now);

    assert.equal(playersOf(one.roomId).length, ROOM_SIZE);
    assert.equal(roomOf(one.roomId).status, 'playing');
    assert.equal(
      playersOf(one.roomId).filter((p) => String(p.zalo_id).startsWith('bot-')).length,
      ROOM_SIZE - 1,
    );
  });
});

describe('Luật nói & bỏ phiếu', () => {
  it('không nói được khi chưa đến lượt', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const wrong = playersOf(roomId).find((p) => p.seat === 3)!;
    const res = await submitMessage(sb, roomId, wrong.id, 'nói chen', null, now);
    assert.equal(res.ok, false);
  });

  it('không nói 2 lần trong cùng 1 vòng', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const first = await speakCurrent(roomId, null, now);
    assert.equal(first.ok, true);
    const speaker = playersOf(roomId).find((p) => p.seat === 0)!;
    const again = await submitMessage(sb, roomId, speaker.id, 'nói lại', null, now);
    assert.equal(again.ok, false);
  });

  it('người đã chết không nói được', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const victim = playersOf(roomId)[0];
    db.rows('werewolf_players').find((p) => p.id === victim.id)!.is_alive = false;
    const res = await submitMessage(sb, roomId, victim.id, 'hồn ma nói', null, now);
    assert.equal(res.ok, false);
  });

  it('phiếu cho chính mình / người đã chết / id lạ đều bị từ chối', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const me = current(roomId);

    const self = await submitMessage(sb, roomId, me.id, 'tự bỏ phiếu', me.id, now);
    assert.equal(self.ok, false);

    const dead = playersOf(roomId).find((p) => p.seat === 5)!;
    db.rows('werewolf_players').find((p) => p.id === dead.id)!.is_alive = false;
    const deadVote = await submitMessage(sb, roomId, me.id, 'bỏ phiếu người chết', dead.id, now);
    assert.equal(deadVote.ok, false);

    const ghost = await submitMessage(sb, roomId, me.id, 'bỏ phiếu id lạ', '00000000-0000-0000-0000-000000000000', now);
    assert.equal(ghost.ok, false);
  });

  it('nội dung rỗng không gửi được', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const me = current(roomId);
    const res = await submitMessage(sb, roomId, me.id, '   ', null, now);
    assert.equal(res.ok, false);
  });
});

describe('Kết thúc ván', () => {
  it('cả 2 Sói bị loại thì Dân làng thắng', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const wolves = playersOf(roomId).filter((p) => p.role === 'wolf');

    await playRound(roomId, (p) => (p.id === wolves[0].id ? null : wolves[0].id), now);
    assert.equal(playersOf(roomId).find((p) => p.id === wolves[0].id)!.is_alive, false, 'Sói 1 phải bị loại');
    assert.equal(roomOf(roomId).current_round, 2);

    await playRound(roomId, (p) => (p.id === wolves[1].id ? null : wolves[1].id), now);
    const room = roomOf(roomId);
    assert.equal(room.status, 'finished');
    assert.equal(room.winner, 'villagers');
    assert.equal(room.turn_deadline, null, 'kết thúc thì xoá deadline');
  });

  it('bỏ phiếu hoà thì không ai bị loại', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const a = playersOf(roomId)[0];
    const b = playersOf(roomId)[1];

    // 4 phiếu cho A (ghế 1-4), 4 phiếu cho B (ghế 0,5,6,7)
    await playRound(roomId, (p) => {
      if (p.seat === 0) return b.id;
      if (p.seat <= 4) return a.id;
      return b.id;
    }, now);

    assert.equal(playersOf(roomId).every((p) => p.is_alive), true, 'hoà phiếu => tất cả còn sống');
    assert.equal(roomOf(roomId).current_round, 2, 'vẫn sang vòng tiếp theo');
  });

  it('hết 3 vòng mà Sói còn sống thì Sói thắng', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);

    for (let r = 1; r <= TOTAL_ROUNDS; r++) await playRound(roomId, () => null, now);

    const room = roomOf(roomId);
    assert.equal(room.status, 'finished');
    assert.equal(room.winner, 'wolves');
    assert.equal(room.current_round, TOTAL_ROUNDS);
  });

  it('ván mới sau khi kết thúc vào phòng khác', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    for (let r = 1; r <= TOTAL_ROUNDS; r++) await playRound(roomId, () => null, now);
    assert.equal(roomOf(roomId).status, 'finished');

    // Không yêu cầu ván mới => trả lại phòng cũ (đã kết thúc) để xem kết quả
    const same = await quickJoin(sb, 'p-0', 'P1', now);
    assert.equal(same.roomId, roomId);

    const fresh = await quickJoin(sb, 'p-0', 'P1', now, true);
    assert.notEqual(fresh.roomId, roomId);
    assert.equal(playersOf(fresh.roomId).length, 1);
  });
});

describe('Tiên tri', () => {
  it('soi đúng kết quả, mỗi vòng 1 lần', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const all = playersOf(roomId);
    const seer = all.find((p) => p.role === 'seer')!;
    const wolf = all.find((p) => p.role === 'wolf')!;
    const villager = all.find((p) => p.role === 'villager')!;

    const r1 = await seerCheck(sb, roomId, seer.id, wolf.id);
    assert.deepEqual({ ok: r1.ok, isWolf: r1.isWolf }, { ok: true, isWolf: true });

    const again = await seerCheck(sb, roomId, seer.id, villager.id);
    assert.equal(again.ok, false, 'vòng này đã soi rồi thì không soi tiếp');

    const st = await getState(sb, roomId, seer.id);
    assert.equal(st!.me.seerUsed, true);
  });

  it('dân làng / Sói không soi được', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const all = playersOf(roomId);
    const villager = all.find((p) => p.role === 'villager')!;
    const wolf = all.find((p) => p.role === 'wolf')!;
    const seer = all.find((p) => p.role === 'seer')!;

    assert.equal((await seerCheck(sb, roomId, villager.id, wolf.id)).ok, false);
    assert.equal((await seerCheck(sb, roomId, wolf.id, seer.id)).ok, false);
  });

  it('không soi chính mình / người đã chết / ngoài phòng', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const all = playersOf(roomId);
    const seer = all.find((p) => p.role === 'seer')!;
    const dead = all.find((p) => p.id !== seer.id)!;
    db.rows('werewolf_players').find((p) => p.id === dead.id)!.is_alive = false;

    assert.equal((await seerCheck(sb, roomId, seer.id, seer.id)).ok, false);
    assert.equal((await seerCheck(sb, roomId, seer.id, dead.id)).ok, false);
    assert.equal((await seerCheck(sb, roomId, seer.id, 'khong-ton-tai')).ok, false);
  });
});

describe('Thời gian, AFK và giờ tạm nghỉ', () => {
  it('khung giờ => interval đúng quy định', () => {
    assert.equal(getTurnInterval(vn(8, 29)), PAUSE_INTERVAL_MIN, 'trước 8:30 là tạm nghỉ');
    assert.equal(getTurnInterval(vn(8, 30)), 15, '8:30-9:00 tính 15 phút');
    assert.equal(getTurnInterval(vn(9)), 15);
    assert.equal(getTurnInterval(vn(12)), 10, '12:00-13:00 là 10 phút');
    assert.equal(getTurnInterval(vn(12, 59)), 10);
    assert.equal(getTurnInterval(vn(13)), 30, '13:00-17:00 là 30 phút');
    assert.equal(getTurnInterval(vn(17)), 15);
    assert.equal(getTurnInterval(vn(20, 59)), 15);
    assert.equal(getTurnInterval(vn(21)), PAUSE_INTERVAL_MIN, '21:00 là tạm nghỉ');
  });

  it('quá hạn thì bỏ lượt, đánh dấu AFK và chuyển lượt', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const first = current(roomId);

    db.rows('werewolf_rooms').find((r) => r.id === roomId)!.turn_deadline = new Date(now.getTime() - 60_000).toISOString();
    const res = await checkTimeout(sb, now);
    assert.deepEqual(res, { skipped: 1, paused: false });

    const skipped = playersOf(roomId).find((p) => p.id === first.id)!;
    assert.equal(skipped.is_afk, true);
    assert.equal(skipped.has_spoken, true);
    assert.equal(roomOf(roomId).current_turn, 1, 'lượt phải chuyển sang ghế 1');

    const afkMsg = db.rows('werewolf_messages').filter((m) => m.player_id === first.id);
    assert.equal(afkMsg.length, 1, 'phải ghi lại việc bỏ lượt');
    assert.match(String(afkMsg[0].content), /quá hạn/i);
  });

  it('người AFK khi đến lượt kế tiếp có interval 30 phút', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const first = current(roomId);

    db.rows('werewolf_rooms').find((r) => r.id === roomId)!.turn_deadline = new Date(now.getTime() - 60_000).toISOString();
    await checkTimeout(sb, now);

    // nốt vòng 1 (ghế 1..7 nói nốt), không ai bỏ phiếu
    await playRound(roomId, () => null, now);

    assert.equal(roomOf(roomId).current_round, 2);
    assert.equal(roomOf(roomId).current_turn, first.seat, 'vòng 2 bắt đầu từ ghế của người AFK');
    assert.equal(roomOf(roomId).turn_interval_minutes, AFK_INTERVAL_MIN);
  });

  it('ban đêm không xử lý timeout và deadline dời sang 8:45 sáng hôm sau', async () => {
    const night = vn(22);
    const { roomId } = await fill(night);

    const room = roomOf(roomId);
    assert.equal(room.turn_interval_minutes, PAUSE_INTERVAL_MIN);
    const deadline = new Date(room.turn_deadline as string);
    assert.equal(deadline.toISOString(), vn(8, 45, 1).toISOString(), 'hạn = 8:45 sáng hôm sau (giờ VN)');

    const res = await checkTimeout(sb, new Date(night.getTime() + 5 * 60_000));
    assert.deepEqual(res, { skipped: 0, paused: true });
    assert.equal(playersOf(roomId).filter((p) => p.is_afk).length, 0, 'ban đêm không ai bị đánh AFK');
  });

  it('sau 8:30 sáng thì xử lý timeout bình thường', async () => {
    const night = vn(22);
    const { roomId } = await fill(night);

    // 8:35 sáng hôm sau: đã hết giờ tạm nghỉ, deadline 8:45 chưa tới
    const morning = vn(8, 35, 1);
    assert.deepEqual(await checkTimeout(sb, morning), { skipped: 0, paused: false });

    // 8:46: quá hạn => bỏ lượt
    const late = vn(8, 46, 1);
    assert.deepEqual(await checkTimeout(sb, late), { skipped: 1, paused: false });
    assert.equal(playersOf(roomId)[0].is_afk, true);
  });
});

describe('Ẩn vai', () => {
  it('dân làng không thấy vai người khác, Sói thấy đồng đội', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const all = playersOf(roomId);
    const villager = all.find((p) => p.role === 'villager')!;
    const wolfA = all.find((p) => p.role === 'wolf')!;
    const wolfB = all.find((p) => p.role === 'wolf' && p.id !== wolfA.id)!;

    const vState = (await getState(sb, roomId, villager.id))!;
    assert.equal(vState.me.role, 'villager');
    for (const p of vState.players) {
      if (p.id === villager.id) continue;
      assert.equal(p.role, null, `không được lộ vai của ${p.name}`);
    }

    const wState = (await getState(sb, roomId, wolfA.id))!;
    const seenWolves = wState.players.filter((p) => p.role === 'wolf').map((p) => p.id).sort();
    assert.deepEqual(seenWolves, [wolfA.id, wolfB.id].sort(), 'Sói chỉ thấy đúng 2 Sói');
    assert.equal(wState.players.filter((p) => p.role === 'villager').length, 0);
  });

  it('kết thúc ván thì công khai toàn bộ vai', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    for (let r = 1; r <= TOTAL_ROUNDS; r++) await playRound(roomId, () => null, now);

    const st = (await getState(sb, roomId, playersOf(roomId)[0].id))!;
    assert.equal(st.room.status, 'finished');
    assert.equal(st.players.every((p) => p.role !== null), true);
  });

  it('người ngoài phòng không xem được trạng thái', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const outsider = await quickJoin(sb, 'nguoi-ngoai', 'X', now);
    assert.equal(await getState(sb, roomId, outsider.playerId), null);
  });
});

describe('Tin nhắn & lịch sử', () => {
  it('mỗi lượt nói được ghi vào lịch sử đúng vòng và đúng người', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    await speakCurrent(roomId, null, now);
    await speakCurrent(roomId, null, now);

    const st = (await getState(sb, roomId, playersOf(roomId)[0].id))!;
    assert.equal(st.messages.length, 2);
    assert.equal(st.messages[0].round, 1);
    assert.equal(st.messages[1].round, 1);
    assert.notEqual(st.messages[0].player_id, st.messages[1].player_id);
  });

  it('phiếu đã bỏ được lưu cùng tin nhắn', async () => {
    const now = vn(10);
    const { roomId } = await fill(now);
    const target = playersOf(roomId).find((p) => p.seat === 2)!;
    await speakCurrent(roomId, target.id, now);

    const st = (await getState(sb, roomId, playersOf(roomId)[0].id))!;
    assert.equal(st.messages[0].vote_for, target.id);
  });
});
