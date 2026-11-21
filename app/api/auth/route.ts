import { NextResponse } from 'next/server';
import {
  createSessionToken,
  getSession,
  newGuestId,
  sessionCookie,
  clearSessionCookie,
} from '@/lib/session';
import { guestSessionAllowed, verifyZaloAccessToken } from '@/lib/zalo-auth';

export const dynamic = 'force-dynamic';

const str = (v: unknown, max = 64) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * POST /api/auth
 *  body: { accessToken?: string, zaloUserId?: string, dev?: boolean, name?: string }
 *  - có accessToken  => xác thực với Zalo, tạo session kind='zalo'
 *  - dev:true        => session guest do server sinh (chỉ khi ALLOW_GUEST_SESSION=1)
 * Trả về { userId, name, kind } và set cookie httpOnly.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* body rỗng */
  }

  const accessToken = str(body.accessToken, 4096);
  const claimedUserId = str(body.zaloUserId, 64);
  const name = str(body.name, 20);

  if (accessToken) {
    const profile = await verifyZaloAccessToken(accessToken);
    if (!profile) {
      return NextResponse.json(
        { error: 'Không xác thực được tài khoản Zalo • 无法验证 Zalo 账号' },
        { status: 401 },
      );
    }
    // Nếu client cũng gửi getUserID() thì phải khớp với id Zalo trả về
    if (claimedUserId && claimedUserId !== profile.id) {
      return NextResponse.json(
        { error: 'Danh tính không khớp • 身份不匹配' },
        { status: 401 },
      );
    }
    const token = createSessionToken({ uid: profile.id, name: profile.name, kind: 'zalo' });
    const res = NextResponse.json({ userId: profile.id, name: profile.name, kind: 'zalo', token });
    res.headers.append('Set-Cookie', sessionCookie(token));
    return res;
  }

  if (body.dev === true) {
    if (!guestSessionAllowed()) {
      return NextResponse.json({ error: 'Chưa đăng nhập Zalo • 未登录 Zalo' }, { status: 401 });
    }
    const uid = newGuestId();
    const guestName = name || 'Khách';
    const token = createSessionToken({ uid, name: guestName, kind: 'guest' });
    const res = NextResponse.json({ userId: uid, name: guestName, kind: 'guest', token });
    res.headers.append('Set-Cookie', sessionCookie(token));
    return res;
  }

  return NextResponse.json({ error: 'Thiếu accessToken • 缺少 accessToken' }, { status: 400 });
}

/** GET /api/auth => session hiện tại (để UI biết đang là ai), 401 nếu chưa có. */
export async function GET(req: Request) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: 'Chưa đăng nhập • 未登录' }, { status: 401 });
  return NextResponse.json({ userId: session.uid, name: session.name, kind: session.kind });
}

/** DELETE /api/auth => đăng xuất (xoá cookie). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.append('Set-Cookie', clearSessionCookie());
  return res;
}
