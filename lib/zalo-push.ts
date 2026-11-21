import type { SupabaseClient } from '@supabase/supabase-js';

export type PushType = 'turn_reminder' | 'morning' | 'evening';
export interface PushResult {
  sent: boolean;
  reason?: 'bot' | 'quiet_hours' | 'daily_limit' | 'no_token' | 'zalo_error';
}

export const DAILY_PUSH_LIMIT = 4; // Zalo OA: tối đa 4 tin miễn phí/ngày
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Nội dung push (tiếng Việt). */
export function buildMessage(type: PushType, accuser = 'Mọi người'): string {
  switch (type) {
    case 'turn_reminder':
      return `Đến lượt bạn! ${accuser} vừa tố bạn là Sói, vào phản bác đi!`;
    case 'morning':
      return 'Sáng rồi, dậy chơi Ma Sói đi! Đến lượt bạn rồi.';
    case 'evening':
      return 'Tối nay 21:00 nghỉ, tranh thủ nói 1 câu rồi ngủ nhé.';
  }
}

function vnMinutes(now: Date): number {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return vn.getUTCHours() * 60 + vn.getUTCMinutes();
}

/** Từ 21:00 đến 8:30 (giờ Việt Nam): không push. */
export function isQuietHours(now: Date): boolean {
  const t = vnMinutes(now);
  return t >= 21 * 60 || t < 8 * 60 + 30;
}

function vnDayStartUTC(now: Date): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET_MS);
}

/**
 * Gửi push nếu được phép:
 *  - không push cho bot
 *  - không push sau 21:00 (và trước 8:30)
 *  - tối đa 4 tin/ngày/người (đếm theo zalo_id qua werewolf_push_logs); quá thì chỉ hiện chấm đỏ trong game
 * Chỉ ghi log khi gửi thành công.
 */
export async function maybePush(
  sb: SupabaseClient,
  player: { id: string; zalo_id: string },
  type: PushType,
  now: Date = new Date(),
  accuser = 'Mọi người',
): Promise<PushResult> {
  if (player.zalo_id.startsWith('bot-')) return { sent: false, reason: 'bot' };
  if (isQuietHours(now)) return { sent: false, reason: 'quiet_hours' };

  // Tất cả player id của cùng 1 user Zalo (mỗi phòng 1 player id)
  const { data: ids } = await sb.from('werewolf_players').select('id').eq('zalo_id', player.zalo_id);
  const playerIds = (ids ?? []).map((r: { id: string }) => r.id);
  if (!playerIds.includes(player.id)) playerIds.push(player.id);

  const { count } = await sb
    .from('werewolf_push_logs')
    .select('id', { count: 'exact', head: true })
    .in('player_id', playerIds)
    .gte('sent_at', vnDayStartUTC(now).toISOString());

  if ((count ?? 0) >= DAILY_PUSH_LIMIT) return { sent: false, reason: 'daily_limit' };

  const token = process.env.ZALO_OA_ACCESS_TOKEN;
  if (!token) return { sent: false, reason: 'no_token' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000); // Zalo chậm không được làm treo lượt chơi / cron
  try {
    const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', access_token: token },
      body: JSON.stringify({
        recipient: { user_id: player.zalo_id },
        message: { text: buildMessage(type, accuser) },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: number };
    if (!res.ok || (json.error !== undefined && json.error !== 0)) {
      return { sent: false, reason: 'zalo_error' };
    }
  } catch {
    return { sent: false, reason: 'zalo_error' };
  } finally {
    clearTimeout(timer);
  }

  await sb
    .from('werewolf_push_logs')
    .insert({ player_id: player.id, type, sent_at: now.toISOString() });
  return { sent: true };
}
