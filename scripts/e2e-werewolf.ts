/**
 * E2E trên Supabase THẬT (Postgres + PostgREST + service_role): chạy 1 ván 8 người
 * từ lúc vào phòng đến lúc có người thắng, kèm các tình huống dễ vỡ:
 * join song song, timeout/AFK, ván mới, quyền của người ngoài phòng.
 *
 * Chạy: npm run e2e        (đọc .env.local)
 * Kết quả: in từng bước + tổng kết PASS/FAIL; exit code 1 nếu có vấn đề.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AFK_INTERVAL_MIN,
  ROOM_SIZE,
  TOTAL_ROUNDS,
  addBots,
  checkTimeout,
  getState,
  getTurnInterval,
  quickJoin,
  resolvePlayer,
  seerCheck,
  submitMessage,
  type Room,
} from '../lib/werewolf';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

let step = 0;
const ok = (msg: string) => console.log(`  ✅ ${++step}. ${msg}`);
const problems: string[] = [];
const bad = (msg: string) => {
  problems.push(msg);
  console.log(`  ❌ ${++step}. ${msg}`);
};
const check = (cond: boolean, msg: string) => (cond ? ok(msg) : bad(msg));

interface Row {
  id: string;
  room_id: string;
  zalo_id: string;
  name: string;
  seat: number;
  role: string | null;
  is_alive: boolean;
  has_spoken: boolean;
  is_afk: boolean;
}

async function rows(roomId: string): Promise<Row[]> {
  const { data, error } = await sb.from('werewolf_players').select('*').eq('room_id', roomId).order('seat');
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

async function room(roomId: string): Promise<Room> {
  const { data } = await sb.from('werewolf_rooms').select('*').eq('id', roomId).maybeSingle();
  return data as Room;
}

async function reset() {
  for (const t of ['werewolf_push_logs', 'werewolf_messages', 'werewolf_players', 'werewolf_rooms']) {
    const { error } = await sb.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(`reset ${t}: ${error.message}`);
  }
}

/** Chơi hết ván: mỗi lượt người đang được nói sẽ nói + bỏ phiếu theo `voteFor`. */
async function playToEnd(
  roomId: string,
  voteFor: (rows: Row[], speaker: Row) => string | null,
  label = 'ván',
): Promise<{ winner: string | null; rounds: number; speaks: number }> {
  let speaks = 0;
  for (let guard = 0; guard < 200; guard++) {
    const r = await room(roomId);
    if (r.status !== 'playing') return { winner: r.winner, rounds: r.current_round, speaks };
    const list = await rows(roomId);
    const speaker = list.find((p) => p.seat === r.current_turn);
    if (!speaker) throw new Error(`không có ai ở ghế ${r.current_turn}`);

    const res = await submitMessage(sb, roomId, speaker.id, `${label} vòng ${r.current_round}`, voteFor(list, speaker));
    if (!res.ok) throw new Error(`ghế ${speaker.seat} không nói được: ${res.error}`);
    speaks++;
  }
  throw new Error('ván không kết thúc sau 200 lượt');
}

/* ------------------------------------------------------------------ */

async function scenarioFullGame() {
  console.log('\n=== 1. Ván 8 người thật (join song song) ===');
  await reset();

  // 8 người bấm "vào phòng" cùng lúc — trước đây 1 nửa bị lỗi unique(room_id, seat)
  const joins = await Promise.allSettled(
    Array.from({ length: ROOM_SIZE }, (_, i) => quickJoin(sb, `e2e-u${i + 1}`, `P${i + 1}`)),
  );
  const okJoins = joins.filter((j) => j.status === 'fulfilled') as PromiseFulfilledResult<{
    roomId: string;
    playerId: string;
  }>[];
  check(okJoins.length === ROOM_SIZE, `${ROOM_SIZE}/8 người vào phòng thành công`);
  const roomIds = new Set(okJoins.map((j) => j.value.roomId));
  check(roomIds.size === 1, `tất cả vào cùng 1 phòng (thực tế: ${roomIds.size})`);

  const roomId = okJoins[0].value.roomId;
  const first = await room(roomId);
  check(first.status === 'playing', `ván tự bắt đầu khi đủ 8 người (status=${first.status})`);

  const list = await rows(roomId);
  check(new Set(list.map((p) => p.seat)).size === ROOM_SIZE, '8 ghế khác nhau, không trùng');
  const wolves = list.filter((p) => p.role === 'wolf');
  const seers = list.filter((p) => p.role === 'seer');
  check(wolves.length === 2 && seers.length === 1, `chia vai 2 Sói + 1 Tiên tri (Sói=${wolves.length}, Tiên tri=${seers.length})`);

  // Ẩn vai
  const villager = list.find((p) => p.role === 'villager')!;
  const vView = (await getState(sb, roomId, villager.id))!;
  check(vView.players.every((p) => p.id === villager.id || p.role === null), 'Dân làng không thấy vai người khác');
  const wView = (await getState(sb, roomId, wolves[0].id))!;
  check(wView.players.filter((p) => p.role === 'wolf').length === 2, 'Sói thấy đúng 2 Sói');

  // Tiên tri soi
  const seer = seers[0];
  const target = wolves[0];
  const seen = await seerCheck(sb, roomId, seer.id, target.id);
  check(seen.ok === true && seen.isWolf === true, 'Tiên tri soi ra Sói');
  const seenAgain = await seerCheck(sb, roomId, seer.id, villager.id);
  check(seenAgain.ok === false, 'Tiên tri không soi 2 lần trong 1 vòng');

  // Chơi: mọi người dồn phiếu cho 1 Sói còn sống
  const result = await playToEnd(roomId, (rs, speaker) => rs.find((p) => p.role === 'wolf' && p.is_alive && p.id !== speaker.id)?.id ?? null);

  const finalRows = await rows(roomId);
  const dead = finalRows.filter((p) => !p.is_alive);
  console.log(
    `     → ${result.speaks} lượt nói, ${result.rounds} vòng, người chết: ${dead.map((d) => `P${d.seat + 1}(${d.role})`).join(', ') || 'không'}`,
  );
  check(result.winner === 'villagers', `cả 2 Sói bị loại => Dân làng thắng (winner=${result.winner})`);
  check((await room(roomId)).turn_deadline === null, 'kết thúc thì xoá turn_deadline');
  check((await getState(sb, roomId, villager.id))!.players.every((p) => p.role !== null), 'kết thúc thì công khai toàn bộ vai');

  // Người chết / người ngoài phòng không thao tác được
  const deadPlayer = dead[0];
  if (deadPlayer) {
    const r = await submitMessage(sb, roomId, deadPlayer.id, 'người chết nói', null);
    check(r.ok === false, 'người đã chết không nói được');
  }
  const outsider = await quickJoin(sb, 'e2e-outside', 'Ngoài');
  check((await getState(sb, roomId, outsider.playerId)) === null, 'người ngoài phòng không xem được trạng thái');
  check((await resolvePlayer(sb, roomId, 'khong-co-ai')) === null, 'session lạ không map được vào người chơi');

  return roomId;
}

async function scenarioTimeout() {
  console.log('\n=== 2. Timeout 15 phút => bỏ lượt + AFK ===');
  await reset();
  const { roomId } = await quickJoin(sb, 'afk-host', 'Host');
  const now = new Date();
  await addBots(sb, roomId, now);
  check((await room(roomId)).status === 'playing', 'thêm bot đủ 8 người thì ván bắt đầu');

  const before = await rows(roomId);
  const seat0 = before.find((p) => p.seat === 0)!;
  await sb.from('werewolf_rooms').update({ turn_deadline: new Date(now.getTime() - 60_000).toISOString() }).eq('id', roomId);

  const t = await checkTimeout(sb, new Date());
  console.log(`     → checkTimeout: ${JSON.stringify(t)}`);
  const after = await rows(roomId);
  const skipped = after.find((p) => p.id === seat0.id)!;
  check(skipped.is_afk && skipped.has_spoken, 'người quá hạn bị đánh dấu AFK + đã nói');
  check((await room(roomId)).current_turn !== seat0.seat || (await room(roomId)).current_round > 1, 'lượt được chuyển tiếp');

  const msgs = await sb.from('werewolf_messages').select('*').eq('room_id', roomId);
  check((msgs.data ?? []).some((m) => String(m.content).includes('quá hạn')), 'có ghi lại việc bỏ lượt vào lịch sử');
}

async function scenarioAfkInterval() {
  console.log('\n=== 3. Người AFK khi đến lượt kế tiếp: 30 phút ===');
  const interval = getTurnInterval(new Date());
  console.log(`     → khung giờ hiện tại cho interval ${interval} phút`);
  if (interval >= 120) {
    console.log('     (đang trong giờ tạm nghỉ 21:00–8:30 nên bỏ qua kiểm tra này)');
    return;
  }

  await reset();
  const now = new Date();
  const { roomId } = await quickJoin(sb, 'afk-2', 'A');
  const list0 = await rows(roomId);
  for (let i = list0.length; i < ROOM_SIZE; i++) {
    await quickJoin(sb, `afk-2-${i}`, `P${i + 1}`);
  }
  check((await room(roomId)).status === 'playing', 'đủ 8 người thật => ván bắt đầu');

  const seat0 = (await rows(roomId)).find((p) => p.seat === 0)!;
  await sb.from('werewolf_rooms').update({ turn_deadline: new Date(now.getTime() - 60_000).toISOString() }).eq('id', roomId);
  await checkTimeout(sb, now);

  // nói nốt vòng 1
  for (let i = 0; i < ROOM_SIZE; i++) {
    const r = await room(roomId);
    if (r.status !== 'playing' || r.current_round !== 1) break;
    const speaker = (await rows(roomId)).find((p) => p.seat === r.current_turn)!;
    await submitMessage(sb, roomId, speaker.id, 'nói nốt', null, now);
  }

  const r2 = await room(roomId);
  check(r2.current_round === 2 && r2.current_turn === seat0.seat, 'vòng 2 bắt đầu từ ghế của người AFK');
  check(r2.turn_interval_minutes === AFK_INTERVAL_MIN, `lượt của người AFK là ${r2.turn_interval_minutes} phút (mong đợi ${AFK_INTERVAL_MIN})`);
}

async function scenarioNewGame(finishedRoomId: string) {
  console.log('\n=== 4. Ván mới sau khi kết thúc ===');
  const again = await quickJoin(sb, 'e2e-u1', 'P1', new Date(), true);
  check(again.roomId !== finishedRoomId, 'yêu cầu ván mới => vào phòng khác');
  const same = await quickJoin(sb, 'e2e-u2', 'P2', new Date(), false);
  check(same.roomId === finishedRoomId, 'không yêu cầu ván mới => trả lại phòng cũ để xem kết quả');
}

async function scenarioWolfWin() {
  console.log('\n=== 5. Không ai bị loại 3 vòng => Sói thắng ===');
  await reset();
  const { roomId } = await quickJoin(sb, 'wolf-1', 'W1');
  for (let i = 1; i < ROOM_SIZE; i++) await quickJoin(sb, `wolf-${i + 1}`, `W${i + 1}`);
  const res = await playToEnd(roomId, () => null, 'không phiếu');
  check(res.winner === 'wolves', `hết ${TOTAL_ROUNDS} vòng Sói còn sống => Sói thắng (winner=${res.winner}, vòng=${res.rounds})`);
}

async function main() {
  console.log(`Supabase thật: ${url}`);
  const started = Date.now();
  const finishedRoom = await scenarioFullGame();
  await scenarioNewGame(finishedRoom); // phải chạy ngay: các scenario sau reset bảng
  await scenarioTimeout();
  await scenarioAfkInterval();
  await scenarioWolfWin();

  console.log(`\n=== TỔNG KẾT (${((Date.now() - started) / 1000).toFixed(1)}s) ===`);
  if (problems.length === 0) console.log(`✅ PASS toàn bộ ${step} kiểm tra`);
  else {
    console.log(`❌ FAIL ${problems.length}/${step} kiểm tra:`);
    problems.forEach((p, i) => console.log(`   ${i + 1}. ${p}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('E2E CRASH:', e);
  process.exit(78);
});
