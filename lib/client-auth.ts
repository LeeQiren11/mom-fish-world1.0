'use client';

/**
 * Danh tính phía client.
 *
 * Trong Zalo Mini App: lấy accessToken + userID bằng zmp-sdk rồi gửi lên server;
 * server gọi graph.zalo.me để xác thực và trả về session cookie httpOnly.
 * Ngoài Zalo (dev): server cấp id guest đã ký (ALLOW_GUEST_SESSION=1).
 * Client không bao giờ tự đặt `zaloId` nữa.
 */

export interface Identity {
  userId: string;
  name: string;
  kind: 'zalo' | 'guest';
}

const SDK_TIMEOUT_MS = 1500;
const CALL_TIMEOUT_MS = 5000;

/** Gốc API: để trống = cùng domain; Mini App (domain khác) đặt NEXT_PUBLIC_API_BASE=https://xxx.vercel.app */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

const TOKEN_KEY = 'mfw_token';
let memToken: string | null = null;

function setToken(t: string | null) {
  memToken = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage bị chặn: chỉ dùng bộ nhớ */
  }
}

function getToken(): string | null {
  if (memToken) return memToken;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Header xác thực cho mọi lời gọi API (Bearer vì cookie không đi kèm khi Mini App gọi khác domain). */
export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

interface ZaloSdk {
  getAccessToken?: () => Promise<string>;
  getUserID?: () => Promise<string>;
}

/** Lấy access token từ zmp-sdk; trả null nếu không chạy trong Zalo Mini App. */
async function zaloCredentials(): Promise<{ accessToken: string; zaloUserId?: string } | null> {
  try {
    const sdk = (await Promise.race([
      import('zmp-sdk'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SDK_TIMEOUT_MS)),
    ])) as ZaloSdk | null;
    if (!sdk || typeof sdk.getAccessToken !== 'function') return null;

    const accessToken = await withTimeout(sdk.getAccessToken(), CALL_TIMEOUT_MS);
    if (!accessToken) return null;

    let zaloUserId: string | undefined;
    try {
      if (typeof sdk.getUserID === 'function') zaloUserId = await withTimeout(sdk.getUserID(), CALL_TIMEOUT_MS);
    } catch {
      /* không bắt buộc: server vẫn xác thực được chỉ với accessToken */
    }
    return { accessToken, zaloUserId };
  } catch {
    return null;
  }
}

async function currentSession(): Promise<Identity | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth`, { cache: 'no-store', headers: authHeaders() });
    if (!res.ok) {
      if (res.status === 401) setToken(null);
      return null;
    }
    const json = (await res.json()) as Identity;
    return json.userId ? json : null;
  } catch {
    return null;
  }
}

/** Đảm bảo có session (dùng lại cookie nếu có). */
export async function ensureSession(name?: string): Promise<Identity> {
  const existing = await currentSession();
  if (existing) return existing;

  const cred = await zaloCredentials();
  const body = cred ? { accessToken: cred.accessToken, zaloUserId: cred.zaloUserId, name } : { dev: true, name };

  const res = await fetch(`${API_BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Identity & { error?: string; token?: string };
  if (!res.ok || !json.userId) {
    throw new Error(json.error || 'Đăng nhập thất bại • 登录失败');
  }
  if (json.token) setToken(json.token);
  return { userId: json.userId, name: json.name, kind: json.kind };
}
