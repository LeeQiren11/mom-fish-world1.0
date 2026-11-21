import crypto from 'crypto';

/**
 * Xác thực Zalo access token ở server.
 *
 * Luồng chuẩn của Zalo Mini App:
 *   client: getAccessToken() (zmp-sdk)  ->  gửi accessToken lên server
 *   server: GET https://graph.zalo.me/v2.0/me  => { id, name }
 * Nhờ vậy `id` là do Zalo trả về, client không tự đặt được.
 *
 * Nếu có `ZALO_APP_SECRET`, gửi thêm `appsecret_proof` (HMAC-SHA256 của
 * access token) — Zalo khuyến nghị để chống dùng lại token bị đánh cắp.
 */

export interface ZaloProfile {
  id: string;
  name: string;
}

const GRAPH_URL = 'https://graph.zalo.me/v2.0/me?fields=id,name';
const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 phút

/**
 * Cache kết quả xác thực token (10 phút) để giảm lượt gọi graph.zalo.me.
 * Chỉ cache kết quả hợp lệ (token bị lỗi thì không cache để sớm thử lại).
 */
const cache = new Map<string, { profile: ZaloProfile; expiresAt: number }>();

export async function verifyZaloAccessToken(token: string): Promise<ZaloProfile | null> {
  if (!token || token.length < 8 || token.length > 4096) return null;

  const hit = cache.get(token);
  if (hit && hit.expiresAt > Date.now()) return hit.profile;
  if (hit) cache.delete(token);

  const headers: Record<string, string> = { access_token: token };
  const appSecret = process.env.ZALO_APP_SECRET;
  if (appSecret) {
    headers.appsecret_proof = crypto.createHmac('sha256', appSecret).update(token).digest('hex');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(GRAPH_URL, { headers, signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: string; name?: string; error?: number; message?: string };
    if (json.error || !json.id) return null;
    const profile: ZaloProfile = { id: String(json.id), name: json.name?.trim() || 'Người chơi' };
    cache.set(token, { profile, expiresAt: Date.now() + CACHE_TTL_MS });
    return profile;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Chỉ bật đăng nhập guest (cookie do server sinh) khi được phép — dùng để dev ngoài Zalo. */
export function guestSessionAllowed(): boolean {
  return process.env.ALLOW_GUEST_SESSION === '1';
}
