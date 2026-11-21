import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { checkTimeout, runPushSchedule } from '@/lib/werewolf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vercel Cron gửi header: Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret ?? ''}`);
  if (!secret || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const sb = getAdminClient();
    const now = new Date();
    const timeout = await checkTimeout(sb, now);
    const push = await runPushSchedule(sb, now);
    // Dọn phòng: chờ quá 24h không đủ người, hoặc đã kết thúc quá 7 ngày (players/messages xoá theo cascade)
    const day = 24 * 3600 * 1000;
    await sb.from('werewolf_rooms').delete().eq('status', 'waiting').lte('created_at', new Date(now.getTime() - day).toISOString());
    await sb.from('werewolf_rooms').delete().eq('status', 'finished').lte('created_at', new Date(now.getTime() - 7 * day).toISOString());
    return NextResponse.json({ ok: true, at: now.toISOString(), timeout, push });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'cron error' },
      { status: 500 },
    );
  }
}
