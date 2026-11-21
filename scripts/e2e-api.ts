/**
 * E2E qua HTTP thật (Next.js API route) để kiểm chứng P0 #1:
 *   - chưa có session => 401
 *   - session guest do server cấp (cookie httpOnly đã ký) => vào phòng được
 *   - sửa cookie / giả zaloId trong body => không mạo danh được
 *   - chơi hết 1 ván 8 người chỉ bằng HTTP như client thật
 *
 * Cần: `npm run dev` đang chạy (mặc định http://127.0.0.1:3000).
 * Chạy: npm run e2e:api
 */
import { createClient } from '@supabase/supabase-js';
import { ROOM_SIZE } from '../lib/werewolf';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

let step = 0;
const problems: string[] = [];
const ok = (m: string) => console.log(`  ✅ ${++step}. ${m}`);
const bad = (m: string) => {
  problems.push(m);
  console.log(`  ❌ ${++step}. ${m}`);
};
const check = (c: boolean, m: string) => (c ? ok(m) : bad(m));

interface Session {
  name: string;
  cookie: string;
  userId: string;
}

async function login(name: string, body: Record<string, unknown> = { dev: true, name }): Promise<Session> {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { userId?: string; error?: string };
  if (!res.ok || !json.userId) throw new Error(`login thất bại: ${json.error}`);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  return { name, cookie, userId: json.userId };
}

async function api(session: Session | null, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/werewolf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { cookie: session.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: json as any };
}

async function reset() {
  for (const t of ['werewolf_push_logs', 'werewolf_messages', 'werewolf_players', 'werewolf_rooms']) {
    await sb.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }
}

async function main() {
  console.log(`API: ${BASE}`);
  await reset();

  console.log('\n=== 1. Xác thực ===');
  const anon = await api(null, { action: 'join', name: 'Hacker' });
  check(anon.status === 401, `không có session => 401 (nhận ${anon.status})`);

  const s1 = await login('P1');
  check(!!s1.cookie && s1.userId.startsWith('guest-'), `server cấp session guest + cookie httpOnly (${s1.userId})`);

  const me = await fetch(`${BASE}/api/auth`, { headers: { cookie: s1.cookie } });
  check(me.ok, 'GET /api/auth trả về session hiện tại');

  const tampered: Session = { ...s1, cookie: s1.cookie.slice(0, -3) + 'aaa' };
  const forged = await api(tampered, { action: 'join', name: 'Giả' });
  check(forged.status === 401, `sửa cookie => 401 (nhận ${forged.status})`);

  console.log('\n=== 2. Giả danh trong body bị bỏ qua ===');
  const spoofBody = await api(s1, { action: 'join', name: 'P1', zaloId: 'guest-cua-nguoi-khac', playerId: 'abc' });
  check(spoofBody.status === 200, 'join có kèm zaloId/playerId lạ vẫn chạy (server bỏ qua field đó)');
  const roomId = spoofBody.json.roomId as string;
  const { data: mine } = await sb.from('werewolf_players').select('*').eq('room_id', roomId).eq('zalo_id', s1.userId);
  check((mine ?? []).length === 1, 'người chơi được tạo gắn với userId của SESSION, không phải zaloId trong body');

  console.log('\n=== 3. 8 người join song song qua HTTP ===');
  const sessions: Session[] = [s1];
  for (let i = 2; i <= ROOM_SIZE; i++) sessions.push(await login(`P${i}`));

  const joins = await Promise.all(sessions.map((s) => api(s, { action: 'join', name: s.name })));
  const joinOk = joins.filter((j) => j.status === 200);
  check(joinOk.length === ROOM_SIZE, `${joinOk.length}/8 join thành công`);
  const rooms = new Set(joinOk.map((j) => j.json.roomId));
  check(rooms.size === 1, `tất cả vào cùng 1 phòng (${rooms.size})`);

  const states = await Promise.all(sessions.map((s) => api(s, { action: 'state', roomId })));
  const st0 = states[0].json;
  check(st0.room.status === 'playing', `ván bắt đầu (status=${st0.room.status}, người=${st0.players.length})`);
  const leaks = states.flatMap((s) =>
    s.json.players.filter(
      (p: any) =>
        p.id !== s.json.me.id &&
        p.role !== null &&
        // Sói được thấy đồng đội (đúng luật), còn lại phải bị ẩn
        !(s.json.me.role === 'wolf' && p.role === 'wolf'),
    ),
  );
  check(leaks.length === 0, 'mỗi người chỉ thấy vai của mình (Sói thấy đồng đội, còn lại ẩn)');

  console.log('\n=== 4. Không điều khiển được người khác ===');
  const other = sessions.find((s) => s.userId !== s1.userId)!;
  const otherView = states[sessions.indexOf(other)].json;
  const isTheirTurn = otherView.room.current_turn === otherView.me.seat;
  const hijack = await api(other, { action: 'speak', roomId, content: 'tôi nói hộ người khác', playerId: 'kệ' });
  check(
    isTheirTurn ? hijack.status === 200 : hijack.status === 400,
    `speak luôn dùng người chơi của session hiện tại, không dùng playerId trong body (lượt của họ: ${
      isTheirTurn ? 'có' : 'không'
    }, HTTP ${hijack.status})`,
  );

  const outsider = await login('Ngoài');
  const out = await api(outsider, { action: 'state', roomId });
  check(out.status === 403, `session ngoài phòng xem state => 403 (nhận ${out.status})`);

  console.log('\n=== 5. Chơi hết ván chỉ bằng HTTP ===');
  // Oracle: đọc vai từ DB để biết bỏ phiếu cho ai (client thật thì dựa vào suy luận)
  const { data: all } = await sb.from('werewolf_players').select('*').eq('room_id', roomId);
  const wolves = new Set((all ?? []).filter((p) => p.role === 'wolf').map((p) => p.id as string));

  let speaks = 0;
  for (let guard = 0; guard < 80; guard++) {
    const snapshot = await api(sessions[0], { action: 'state', roomId });
    const st = snapshot.json;
    if (st.room.status === 'finished') break;

    // tìm người đang được nói
    let acted = false;
    for (const s of sessions) {
      const view = await api(s, { action: 'state', roomId });
      if (view.status !== 200) continue;
      const v = view.json;
      if (v.room.status !== 'playing') break;
      if (v.room.current_turn !== v.me.seat) continue;
      if (v.players.find((p: any) => p.id === v.me.id)?.has_spoken) continue;

      const wolfTarget = v.players.find((p: any) => wolves.has(p.id) && p.is_alive && p.id !== v.me.id);
      const r = await api(s, { action: 'speak', roomId, content: `${s.name} nói`, voteFor: wolfTarget?.id ?? null });
      if (r.status === 200) speaks++;
      acted = true;
      break;
    }
    if (!acted) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  const final = await api(sessions[0], { action: 'state', roomId });
  check(final.json.room.status === 'finished', `ván kết thúc qua HTTP (${speaks} lượt nói, winner=${final.json.room.winner})`);
  check(final.json.players.every((p: any) => p.role !== null), 'kết thúc thì API công khai toàn bộ vai');

  console.log('\n=== 6. Cron ===');
  const noAuth = await fetch(`${BASE}/api/cron/werewolf`);
  check(noAuth.status === 401, `cron không có Bearer => 401 (nhận ${noAuth.status})`);
  if (CRON_SECRET) {
    const authed = await fetch(`${BASE}/api/cron/werewolf`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    const body = await authed.json();
    check(authed.status === 200 && body.ok === true, `cron có Bearer => ${authed.status} ${JSON.stringify(body).slice(0, 80)}`);
  }

  console.log(`\n=== TỔNG KẾT ===`);
  if (problems.length === 0) console.log(`✅ PASS toàn bộ ${step} kiểm tra`);
  else {
    console.log(`❌ FAIL ${problems.length}/${step}:`);
    problems.forEach((p, i) => console.log(`   ${i + 1}. ${p}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('E2E API CRASH:', e);
  process.exit(78);
});
