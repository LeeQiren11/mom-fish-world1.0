// Thử join song song 8 người để tìm lỗi tranh chấp ghế / startRoom 2 lần.
import { createClient } from '@supabase/supabase-js';
import { quickJoin, getState } from '../lib/werewolf';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  for (const t of ['werewolf_push_logs', 'werewolf_messages', 'werewolf_players', 'werewolf_rooms']) {
    await sb.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) => quickJoin(sb, `race-${i}`, `R${i}`)),
  );
  for (const r of results) {
    if (r.status === 'rejected') console.log('  REJECT:', String(r.reason).slice(0, 160));
  }
  const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ roomId: string; playerId: string }>[];
  console.log('  join ok:', ok.length, '/ 8; phòng:', new Set(ok.map((o) => o.value.roomId)).size);

  const { data: rooms } = await sb.from('werewolf_rooms').select('*');
  for (const room of rooms ?? []) {
    const { data: ps } = await sb.from('werewolf_players').select('seat,role,name').eq('room_id', room.id).order('seat');
    console.log(`  phòng ${room.code} status=${room.status} người=${ps?.length} ghế=${ps?.map((p) => p.seat).join(',')} role=${ps?.filter((p) => p.role).length}`);
    if (room.status === 'playing' && (ps?.length ?? 0) !== 8) console.log('  ⚠️  phòng playing nhưng không đủ 8 người');
  }

  const first = ok[0]?.value;
  if (first) {
    const st = await getState(sb, first.roomId, first.playerId);
    console.log('  state:', st?.room.status, 'players:', st?.players.length, 'turn:', st?.room.current_turn);
  }
}

main().catch((e) => console.error('FAIL', e));
