import { NextResponse, type NextRequest } from 'next/server';

/**
 * CORS cho /api/* khi frontend (vd. Zalo Mini App) chạy ở domain khác.
 * Đặt ALLOWED_ORIGINS="https://h5.zdn.vn,https://xxx.zaloapp.com" (phân cách bằng dấu phẩy).
 * Không đặt => không thêm header CORS (chỉ cùng domain gọi được). Dùng Bearer token nên KHÔNG bật credentials.
 */
export function middleware(req: NextRequest) {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get('origin');
  const ok = !!origin && allowed.includes(origin);

  const headers: Record<string, string> = ok
    ? {
        'Access-Control-Allow-Origin': origin!,
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : {};

  if (req.method === 'OPTIONS') return new NextResponse(null, { status: ok ? 204 : 403, headers });

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: '/api/:path*' };
