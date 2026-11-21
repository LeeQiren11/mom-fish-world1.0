/**
 * Test hồi quy cho các lỗi tìm thấy khi review (cross-night deadline, bấm đúp, kết quả Tiên tri, Bearer session).
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { FakeDB, type Row } from './fake-supabase';
import { checkTimeout, computeTurn, getState, quickJoin, seerCheck, submitMessage, ROOM_SIZE } from '../lib/werewolf';
import { createSessionToken, getSession } from '../lib/session';

delete process.env.ZALO_OA_ACCESS_TOKEN;
process.env.SESSION_SECRET = 'test-secret-1234567890';

const vn = (h: number, m = 0, dayOffset = 0) => new Date(Date.UTC(2026, 10, 21 + dayOffset, h - 7, m));
let db: FakeDB;
let sb: any;
beforeEach(() => {
  db = new FakeDB();
  sb = db;
});
const players = (roomId: string): Row[] => db.rows('werewolf_players').filter((p) => p.room_id === roomId).sort((a, b) => a.seat - b.seat);
const room = (id: string): Row => db.rows('werewolf_rooms').find((r) => r.id === id)!;

async function startGame(now: Date) {
  let roomId = '';
  for (let i = 0; i < ROOM_SIZE; i++) roomId = (await quickJoin(sb, `p-${i}`, `P${i + 1}`, now)).roomId;
  return roomId;
}

describe('Hạn lượt không rơi vào đêm', () => {
  it('lượt bắt đầu 20:50 => hạn dời sang 8:45 sáng hôm sau, cron 8:30 không phạt oan', async () => {
    const { deadline } = computeTurn(vn(20, 50), false);
    assert.equal(deadline.getTime(), vn(8, 45, 1).getTime());

    const roomId = await startGame(vn(20, 50));
    assert.equal(new Date(room(roomId).turn_deadline).getTime(), vn(8, 45, 1).getTime());
    const res = await checkTimeout(sb, vn(8, 30, 1));
    assert.equal(res.skipped, 0, 'chưa quá hạn thì không được bỏ lượt');
    assert.equal(players(roomId).some((p) => p.is_afk), false);
  });
});

describe('Chống bấm đúp / race', () => {
  it('2 request nói cùng lúc => chỉ 1 tin nhắn, 1 phiếu', async () => {
    const now = vn(10);
    const roomId = await startGame(now);
    const ps = players(roomId);
    const me = ps[room(roomId).current_turn];
    const target = ps.find((p) => p.id !== me.id)!;
    const [a, b] = await Promise.all([
      submitMessage(sb, roomId, me.id, 'xin chào', target.id, now),
      submitMessage(sb, roomId, me.id, 'xin chào', target.id, now),
    ]);
    assert.equal([a.ok, b.ok].filter(Boolean).length, 1);
    assert.equal(db.rows('werewolf_messages').filter((m) => m.player_id === me.id).length, 1);
  });

  it('Tiên tri bấm soi 2 lần cùng lúc => chỉ 1 lần thành công', async () => {
    const now = vn(10);
    const roomId = await startGame(now);
    const all = players(roomId);
    const seer = all.find((p) => p.role === 'seer')!;
    const others = all.filter((p) => p.id !== seer.id);
    const rs = await Promise.all([seerCheck(sb, roomId, seer.id, others[0].id), seerCheck(sb, roomId, seer.id, others[1].id)]);
    assert.equal(rs.filter((r) => r.ok).length, 1);
  });

  it('cron + người chơi cùng lúc => không bỏ lượt chồng', async () => {
    const now = vn(10);
    const roomId = await startGame(now);
    const me = players(roomId)[room(roomId).current_turn];
    const late = new Date(now.getTime() + 20 * 60_000);
    const [spoke] = await Promise.all([submitMessage(sb, roomId, me.id, 'kịp rồi', null, late), checkTimeout(sb, late)]);
    const msgs = db.rows('werewolf_messages').filter((m) => m.player_id === me.id);
    assert.equal(msgs.length, 1, 'chỉ 1 trong 2 (nói hoặc bị bỏ lượt) được ghi');
    assert.equal(typeof spoke.ok, 'boolean');
  });
});

describe('Kết quả Tiên tri được lưu', () => {
  it('tải lại state vẫn thấy kết quả soi; người khác không thấy', async () => {
    const now = vn(10);
    const roomId = await startGame(now);
    const all = players(roomId);
    const seer = all.find((p) => p.role === 'seer')!;
    const wolf = all.find((p) => p.role === 'wolf')!;
    await seerCheck(sb, roomId, seer.id, wolf.id);
    const st = await getState(sb, roomId, seer.id);
    assert.deepEqual(st!.me.seerResults, { [wolf.id]: true });
    const other = all.find((p) => p.role === 'villager')!;
    assert.deepEqual((await getState(sb, roomId, other.id))!.me.seerResults, {});
  });
});

describe('Session: Bearer & cookie dị dạng', () => {
  it('Authorization: Bearer hợp lệ => có session; cookie dị dạng không ném lỗi', () => {
    const token = createSessionToken({ uid: 'u1', name: 'A', kind: 'zalo' });
    const viaBearer = getSession(new Request('http://x', { headers: { authorization: `Bearer ${token}` } }));
    assert.equal(viaBearer?.uid, 'u1');
    const bad = getSession(new Request('http://x', { headers: { cookie: 'mfw_session=%E0%A4%A' } }));
    assert.equal(bad, null);
    assert.equal(getSession(new Request('http://x', { headers: { authorization: 'Bearer abc.def' } })), null);
  });
});
