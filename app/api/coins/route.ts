import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const str = (v: unknown, max = 64) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * POST /api/coins
 *  body: { gameId: string, score: number, coins: number }
 * 身份取自 session（同 /api/werewolf）。把金币/战绩同步到 user_coins / game_logs，
 * 这样清浏览器缓存也不会丢。失败时前端静默忽略（本地 localStorage 仍是主存储）。
 */
export async function POST(req: Request) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: 'Chưa đăng nhập • 未登录' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* body rỗng */
  }

  const gameId = str(body.gameId, 32);
  const score = typeof body.score === 'number' && Number.isFinite(body.score) ? Math.round(body.score) : 0;
  const coins = typeof body.coins === 'number' && Number.isFinite(body.coins) ? Math.max(0, Math.round(body.coins)) : 0;

  if (!gameId) return NextResponse.json({ error: 'Thiếu gameId • 缺少 gameId' }, { status: 400 });

  const sb = getAdminClient();

  // Ghi log ván (dùng cho周总结 / 全服统计)
  const { error: logErr } = await sb.from('game_logs').insert({
    user_id: session.uid,
    game_id: gameId,
    score,
    coins_earned: coins,
    played_at: new Date().toISOString(),
  });
  if (logErr) return NextResponse.json({ error: 'Không ghi được log • 记录失败' }, { status: 500 });

  // Cộng dồn xu vào user_coins (upsert; tăng total_earned)
  const { error: coinErr } = await sb.rpc('upsert_user_coins', {
    p_user_id: session.uid,
    p_coins: coins,
  });
  if (coinErr) return NextResponse.json({ error: 'Không cộng được xu • 金币失败' }, { status: 500 });

  return NextResponse.json({ ok: true, coins });
}
