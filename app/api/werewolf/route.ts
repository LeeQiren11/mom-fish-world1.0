import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { addBots, findMyRoom, getState, quickJoin, resolvePlayer, seerCheck, submitMessage } from '@/lib/werewolf';

export const dynamic = 'force-dynamic';

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Danh tính lấy từ cookie session đã ký ở server (xem /api/auth).
 * Client KHÔNG gửi zaloId/playerId nữa: playerId được tra từ (roomId, session.uid),
 * nên không thể điều khiển người chơi khác bằng cách sửa body.
 */
export async function POST(req: Request) {
  try {
    const session = getSession(req);
    if (!session) return bad('Chưa đăng nhập • 未登录', 401);

    const body = await req.json();
    const sb = getAdminClient();
    const now = new Date();
    const action = str(body.action, 20);

    if (action === 'join') {
      const name = str(body.name, 20) || session.name;
      if (!name) return bad('Thiếu tên • 缺少昵称');
      return NextResponse.json(await quickJoin(sb, session.uid, name, now, body.newGame === true));
    }

    // Quay lại ván đang có (không tạo phòng/ghế mới)
    if (action === 'resume') return NextResponse.json({ room: await findMyRoom(sb, session.uid) });

    const roomId = str(body.roomId, 64);
    if (!roomId) return bad('Thiếu roomId');

    // Chỉ thao tác được trên chính người chơi gắn với session này
    const me = await resolvePlayer(sb, roomId, session.uid);
    if (!me) return bad('Bạn không ở trong phòng này • 你不在该房间', 403);

    switch (action) {
      case 'state': {
        const state = await getState(sb, roomId, me.id);
        if (!state) return bad('Không tìm thấy phòng • 房间不存在', 404);
        return NextResponse.json(state);
      }
      case 'speak': {
        const r = await submitMessage(sb, roomId, me.id, str(body.content), str(body.voteFor, 64) || null, now);
        return r.ok ? NextResponse.json(r) : bad(r.error ?? 'Lỗi');
      }
      case 'seer': {
        const r = await seerCheck(sb, roomId, me.id, str(body.targetId, 64));
        return r.ok ? NextResponse.json(r) : bad(r.error ?? 'Lỗi');
      }
      case 'bots': {
        if (process.env.ALLOW_DEV_BOTS !== '1') return bad('Không được phép • 未开启', 403);
        await addBots(sb, roomId, now);
        return NextResponse.json({ ok: true });
      }
      default:
        return bad('Action không hợp lệ');
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
