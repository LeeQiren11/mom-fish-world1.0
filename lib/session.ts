import crypto from 'crypto';

/**
 * Session nhẹ, ký HMAC-SHA256 ở server và lưu trong cookie httpOnly.
 *
 * Vì sao: bản trước lấy `zaloId` từ localStorage (`guest-xxxx`) do client gửi lên,
 * nên ai cũng sửa được để giả làm người khác. Giờ `uid` chỉ đến từ:
 *   - Zalo access token đã được server xác thực (graph.zalo.me), hoặc
 *   - id guest do SERVER sinh ra (chỉ bật khi ALLOW_GUEST_SESSION=1, dùng để dev).
 * Cookie không đọc/sửa được bằng JS nên client không tự khai danh tính nữa.
 */

export const SESSION_COOKIE = 'mfw_session';
const TTL_DAYS = 30;

export type SessionKind = 'zalo' | 'guest';

export interface Session {
  /** Với người dùng Zalo: chính là user_id của Zalo (dùng được cho OA push). */
  uid: string;
  name: string;
  kind: SessionKind;
  iat: number;
  exp: number;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('Thiếu SESSION_SECRET (>=16 ký tự) • 缺少 SESSION_SECRET');
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function signPayload(payload: string): string {
  return b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
}

/** Tạo token: `v1.<base64url(json)>.<hmac>` */
export function createSessionToken(input: { uid: string; name: string; kind: SessionKind }): string {
  const iat = Math.floor(Date.now() / 1000);
  const session: Session = { ...input, iat, exp: iat + TTL_DAYS * 24 * 3600 };
  const payload = b64url(JSON.stringify(session));
  return `v1.${payload}.${signPayload(payload)}`;
}

/** Đọc token; trả null nếu sai chữ ký / hết hạn / sai định dạng. */
export function verifySessionToken(token: string | undefined | null): Session | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const [, payload, sig] = parts;

  const expected = signPayload(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const session = JSON.parse(fromB64url(payload).toString('utf8')) as Session;
    if (!session.uid || typeof session.uid !== 'string') return null;
    if (!session.exp || session.exp * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null; // cookie dị dạng => coi như chưa đăng nhập, không ném lỗi 500
      }
    }
  }
  return null;
}

/** Lấy session từ request (đọc cookie) — dùng trong API route. */
export function getSession(req: Request): Session | null {
  // Ưu tiên Authorization: Bearer (Mini App gọi API khác domain, cookie không đi kèm), sau đó mới tới cookie
  const auth = req.headers.get('authorization');
  if (auth && /^Bearer\s+/i.test(auth)) {
    const s = verifySessionToken(auth.replace(/^Bearer\s+/i, '').trim());
    if (s) return s;
  }
  return verifySessionToken(readCookie(req.headers.get('cookie'), SESSION_COOKIE));
}

/** Chuỗi Set-Cookie (httpOnly, không cho JS đọc). */
export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
    TTL_DAYS * 24 * 3600
  }${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/** Id guest do server sinh (không đoán được) — chỉ dùng khi bật ALLOW_GUEST_SESSION. */
export function newGuestId(): string {
  return `guest-${crypto.randomBytes(6).toString('hex')}`;
}
