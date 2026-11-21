import { useEffect, useState } from 'react';
import { AD_REWARD, GAMES, MAX_ADS_PER_DAY, MAX_COINS_PER_GAME, calcCoins } from './games';
import { API_BASE, authHeaders } from './client-auth';

const COIN_KEY = 'mfw_coins';
const LOG_KEY = 'mfw_logs';
const AD_KEY = 'mfw_ads';
const EVENT = 'mfw-update';

export interface PlayLog {
  gameId: string;
  score: number;
  win: boolean;
  coins: number;
  ts: number;
}

export interface Snapshot {
  coins: number;
  playedToday: string[];
  logs: PlayLog[];
  adsToday: number;
}

const isBrowser = () => typeof window !== 'undefined';

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* localStorage đầy hoặc bị chặn: bỏ qua */
  }
}

const dayKey = (ts: number) => new Date(ts).toLocaleDateString('en-CA');

export const getCoins = () => read<number>(COIN_KEY, 0);
export const getLogs = () => read<PlayLog[]>(LOG_KEY, []);

export function addCoins(n: number) {
  write(COIN_KEY, getCoins() + n);
}

/**
 * Gọi 1 lần khi kết thúc ván: ghi log + cộng xu. Trả về số xu nhận được.
 * `coinsOverride`: dùng cho game tính xu theo tiến độ (xem calcCoinsByProgress),
 * khi công thức score/10 không còn đúng. Không truyền thì giữ calcCoins(score).
 */
export function recordResult(gameId: string, score: number, win: boolean, coinsOverride?: number): number {
  const raw = coinsOverride === undefined ? calcCoins(score) : coinsOverride;
  const coins = Math.max(0, Math.min(MAX_COINS_PER_GAME, Math.round(raw)));
  const logs = getLogs();
  logs.push({ gameId, score, win, coins, ts: Date.now() });
  write(LOG_KEY, logs.slice(-200));
  addCoins(coins);
  syncCoinsToServer(gameId, score, coins);
  return coins;
}

/**
 * Đồng bộ xu/lịch sử lên server (user_coins / game_logs) để chống mất khi xoá cache.
 * Fire-and-forget: không chặn UI, thất bại thì im lặng (localStorage vẫn là nguồn chính).
 */
function syncCoinsToServer(gameId: string, score: number, coins: number) {
  if (!isBrowser()) return;
  const headers = authHeaders();
  if (!headers.Authorization) return; // chưa đăng nhập (guest/未登录) => không đồng bộ
  fetch(`${API_BASE}/api/coins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ gameId, score, coins }),
  }).catch(() => undefined);
}

function readAds(): { day: string; count: number } {
  const today = dayKey(Date.now());
  const a = read<{ day: string; count: number }>(AD_KEY, { day: today, count: 0 });
  return a.day === today ? a : { day: today, count: 0 };
}

/** Quảng cáo giả (placeholder): +50 xu, tối đa 10 lần/ngày. */
export function watchAd(): boolean {
  const ads = readAds();
  if (ads.count >= MAX_ADS_PER_DAY) return false;
  write(AD_KEY, { day: ads.day, count: ads.count + 1 });
  addCoins(AD_REWARD);
  return true;
}

export function takeSnapshot(): Snapshot {
  const logs = getLogs();
  const today = dayKey(Date.now());
  const playedToday = Array.from(
    new Set(logs.filter((l) => dayKey(l.ts) === today).map((l) => l.gameId)),
  );
  return { coins: getCoins(), playedToday, logs, adsToday: readAds().count };
}

const EMPTY: Snapshot = { coins: 0, playedToday: [], logs: [], adsToday: 0 };

/** Hook: tự cập nhật khi có thay đổi (trang chủ cập nhật xu theo thời gian thực). */
export function useStore(): Snapshot {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  useEffect(() => {
    const sync = () => setSnap(takeSnapshot());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);
  return snap;
}

export function weeklyStats(logs: PlayLog[]) {
  const since = Date.now() - 7 * 24 * 3600 * 1000;
  const week = logs.filter((l) => l.ts >= since);
  const ids = new Set(GAMES.map((g) => g.id));
  const played = new Set(week.filter((l) => ids.has(l.gameId)).map((l) => l.gameId)).size;
  const wins = week.filter((l) => l.win).length;
  const coins = week.reduce((s, l) => s + l.coins, 0);
  // Xếp hạng chỉ là placeholder (chưa có dữ liệu toàn server)
  const topPercent = Math.max(5, 60 - wins * 8 - played * 4);
  return { played, wins, coins, topPercent };
}
