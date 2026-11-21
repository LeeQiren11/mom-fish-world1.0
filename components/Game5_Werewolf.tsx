'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import GameShell from './GameShell';
import WerewolfTimer from './WerewolfTimer';
import { recordResult } from '@/lib/coins';
import { API_BASE, authHeaders, ensureSession } from '@/lib/client-auth';

interface PubPlayer {
  id: string;
  name: string;
  seat: number;
  is_alive: boolean;
  has_spoken: boolean;
  is_afk: boolean;
  role: string | null;
}
interface PubRoom {
  id: string;
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  current_round: number;
  current_turn: number;
  turn_interval_minutes: number;
  turn_deadline: string | null;
  winner: 'wolves' | 'villagers' | null;
}
interface PubMsg {
  id: string;
  player_id: string;
  round: number;
  content: string;
  vote_for: string | null;
}
interface GameState {
  room: PubRoom;
  players: PubPlayer[];
  messages: PubMsg[];
  me: { id: string; seat: number; role: string | null; seerUsed: boolean; seerResults?: Record<string, boolean> };
}

const ROLE_LABEL: Record<string, string> = {
  wolf: '🐺 Sói • 狼人',
  seer: '🔮 Tiên tri • 预言家',
  villager: '🧑‍🌾 Dân làng • 村民',
};

async function api<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${API_BASE}/api/werewolf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Lỗi • 出错了');
  return j as T;
}

export default function Game5_Werewolf() {
  const [identity, setIdentity] = useState<{ userId: string; kind: 'zalo' | 'guest' } | null>(null);
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [vote, setVote] = useState('');
  const [seerResult, setSeerResult] = useState<Record<string, boolean>>({});
  const [coins, setCoins] = useState<number | null>(null);
  const pollError = useRef(false);

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Lỗi • 出错了');

  // Danh tính do server cấp (Zalo access token hoặc guest đã ký); không dùng id trong localStorage
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = await ensureSession();
        if (!alive) return;
        setIdentity({ userId: id.userId, kind: id.kind });
        setName(localStorage.getItem('mfw_name') ?? '');
      } catch (e) {
        if (alive) setError(errMsg(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const join = useCallback(
    async (newGame = false, nameOverride?: string) => {
      const n = (nameOverride ?? name).trim();
      if (!identity || !n) return;
      setBusy(true);
      setError('');
      try {
        localStorage.setItem('mfw_name', n);
        const res = await api<{ roomId: string; playerId: string }>({ action: 'join', name: n, newGame });
        setSeerResult({});
        setCoins(null);
        setState(null);
        setRoomId(res.roomId);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [identity, name],
  );

  // Chỉ quay lại phòng ĐÃ có (không tự xếp ghế mới khi người dùng chỉ mở trang xem)
  useEffect(() => {
    if (!identity) return;
    let alive = true;
    api<{ room: { roomId: string } | null }>({ action: 'resume' })
      .then((r) => {
        if (alive && r.room) setRoomId(r.room.roomId);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [identity]);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    try {
      setState(await api<GameState>({ action: 'state', roomId }));
      if (pollError.current) {
        pollError.current = false;
        setError(''); // lỗi mạng thoáng qua do polling => tự xoá khi đã ổn lại
      }
    } catch (e) {
      pollError.current = true;
      setError(errMsg(e));
    }
  }, [roomId]);

  // Polling mỗi 8 giây (game bất đồng bộ nên không cần realtime)
  useEffect(() => {
    if (!roomId) return;
    void refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [roomId, refresh]);

  // Ghi nhận kết quả khi ván kết thúc (1 lần / phòng)
  useEffect(() => {
    if (!state || state.room.status !== 'finished' || !state.room.winner) return;
    const key = `mfw_ww_done_${state.room.id}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    const iAmWolf = state.me.role === 'wolf';
    const win = (state.room.winner === 'wolves') === iAmWolf;
    setCoins(recordResult('werewolf', win ? 1000 : 300, win));
  }, [state]);

  async function speak() {
    if (!roomId || busy) return;
    setBusy(true);
    setError('');
    try {
      await api({ action: 'speak', roomId, content: text, voteFor: vote || null });
      setText('');
      setVote('');
      await refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function seer(targetId: string) {
    if (!roomId || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<{ isWolf: boolean }>({ action: 'seer', roomId, targetId });
      setSeerResult((s) => ({ ...s, [targetId]: r.isWolf }));
      await refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function addBots() {
    if (!roomId) return;
    setBusy(true);
    try {
      await api({ action: 'bots', roomId });
      await refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const room = state?.room;
  const me = state?.players.find((p) => p.id === state.me.id);
  const nameOf = (id: string) => state?.players.find((p) => p.id === id)?.name ?? '?';
  const myTurn = !!(state && room && room.status === 'playing' && me?.is_alive && !me.has_spoken && room.current_turn === state.me.seat);
  const speaker = state?.players.find((p) => p.seat === room?.current_turn);
  const iWon = !!(state && room?.winner && (room.winner === 'wolves') === (state.me.role === 'wolf'));

  const shareText = !room
    ? 'Chơi Ma Sói bất đồng bộ trên Zalo cùng mình nhé! • 来玩异步狼人杀!'
    : room.status === 'finished'
      ? `Ván Ma Sói vừa rồi ${iWon ? 'mình đã thắng' : 'mình thua'}! Phe ${room.winner === 'wolves' ? 'Sói' : 'Dân làng'} thắng. • 狼人杀${iWon ? '我赢了' : '我输了'}!`
      : `Mình đang chơi Ma Sói, vòng ${room.current_round}/3! Vào chơi cùng nhé! • 来一起玩狼人杀!`;

  return (
    <GameShell title="MA SÓI" subtitle="异步狼人杀 • 每轮15分钟" emoji="🐺" shareText={shareText}>
      {error && <p className="rounded-2xl bg-rose-200 px-3 py-2 text-center text-xs font-black text-rose-700">{error}</p>}

      {!identity && !error && (
        <p className="py-8 text-center text-sm font-bold text-slate-500">Đang xác thực... • 正在验证身份...</p>
      )}

      {/* Nhập tên */}
      {identity && !roomId && (
        <div className="space-y-3 rounded-3xl bg-white p-4 shadow-lg">
          <p className="text-sm font-black text-slate-700">Tên của bạn • 你的昵称</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 20))}
            placeholder="Ví dụ: Lan"
            className="w-full rounded-2xl border-2 border-violet-200 px-4 py-3 text-base font-bold outline-none focus:border-violet-400"
          />
          <button
            onClick={() => join(false)}
            disabled={busy || !name.trim()}
            className="btn-press w-full rounded-3xl bg-violet-500 py-3 text-base font-black text-white shadow disabled:opacity-50"
          >
            {busy ? 'Đang vào phòng...' : 'VÀO PHÒNG • 加入房间'}
          </button>
          <p className="text-center text-[11px] font-bold text-slate-400">
            8 người • 2 Sói + 1 Tiên tri + 5 Dân làng • 3 vòng • 不用同时在线
          </p>
          <p className="text-center text-[10px] font-bold text-slate-300">
            {identity.kind === 'zalo' ? 'Đã xác thực Zalo • 已通过 Zalo 验证' : 'Chế độ khách (dev) • 访客模式'}
          </p>
        </div>
      )}

      {roomId && !state && <p className="py-8 text-center text-sm font-bold text-slate-500">Đang tải... • 加载中...</p>}

      {/* Phòng chờ */}
      {state && room && room.status === 'waiting' && (
        <div className="space-y-3 rounded-3xl bg-white p-5 text-center shadow-lg">
          <div className="text-5xl">⏳</div>
          <h2 className="text-lg font-black text-slate-800">
            Đang chờ người chơi {state.players.length}/8
          </h2>
          <p className="text-xs font-bold text-slate-500">等待玩家加入 • Mã phòng: {room.code}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {state.players.map((p) => (
              <span key={p.id} className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
                {p.name}
              </span>
            ))}
          </div>
          {process.env.NEXT_PUBLIC_DEV_BOTS === '1' && (
            <button onClick={addBots} disabled={busy} className="btn-press rounded-2xl bg-slate-200 px-4 py-2 text-xs font-black text-slate-600">
              🤖 Thêm bot để thử (dev) • 添加机器人测试
            </button>
          )}
        </div>
      )}

      {/* Đang chơi / kết thúc */}
      {state && room && room.status !== 'waiting' && (
        <>
          <div className="flex items-center justify-between rounded-3xl bg-violet-200 p-4 shadow-lg">
            <div>
              <p className="text-xs font-bold text-violet-700">Vai của bạn • 你的身份</p>
              <p className="text-lg font-black text-slate-800">{ROLE_LABEL[state.me.role ?? ''] ?? '?'}</p>
            </div>
            <div className="rounded-2xl bg-white px-3 py-2 text-center">
              <p className="text-lg font-black text-violet-600">Vòng {Math.min(room.current_round, 3)}/3</p>
              <p className="text-[10px] font-bold text-slate-400">第{Math.min(room.current_round, 3)}轮</p>
            </div>
          </div>

          {room.status === 'playing' && (
            <>
              <WerewolfTimer deadline={room.turn_deadline} intervalMinutes={room.turn_interval_minutes} />
              <p className="text-center text-sm font-black text-slate-700">
                {myTurn
                  ? '👉 Đến lượt bạn! • 轮到你了!'
                  : `Đang chờ ${speaker?.name ?? '...'} nói • 等待发言`}
              </p>
            </>
          )}

          {/* Danh sách người chơi */}
          <div className="grid grid-cols-2 gap-2">
            {state.players.map((p) => {
              const canSeer =
                state.me.role === 'seer' && me?.is_alive && room.status === 'playing' && !state.me.seerUsed && p.is_alive && p.id !== state.me.id;
              const sr = state.me.seerResults?.[p.id] ?? seerResult[p.id];
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl p-2 shadow ${
                    !p.is_alive ? 'bg-slate-200 opacity-60' : room.status === 'playing' && p.seat === room.current_turn ? 'bg-amber-200' : 'bg-white'
                  }`}
                >
                  <p className="truncate text-sm font-black text-slate-800">
                    {p.is_alive ? '🙂' : '💀'} {p.name}
                    {p.id === state.me.id ? ' (bạn)' : ''}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500">
                    {p.has_spoken && p.is_alive ? '✅ đã nói ' : ''}
                    {p.is_afk ? '💤 AFK ' : ''}
                    {p.role ? ROLE_LABEL[p.role]?.split(' ')[0] + ' ' : ''}
                    {sr !== undefined ? (sr ? '→ 🐺 LÀ SÓI' : '→ 🧑‍🌾 không phải Sói') : ''}
                  </p>
                  {canSeer && sr === undefined && (
                    <button
                      onClick={() => seer(p.id)}
                      disabled={busy}
                      className="btn-press mt-1 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-black text-white"
                    >
                      🔮 Soi • 查验
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Chat */}
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-3xl bg-white p-3 shadow-lg">
            {state.messages.length === 0 && (
              <p className="py-4 text-center text-xs font-bold text-slate-400">Chưa ai nói gì • 还没有人发言</p>
            )}
            {state.messages.map((m) => (
              <div key={m.id} className="rounded-2xl bg-violet-50 px-3 py-2">
                <p className="text-[11px] font-black text-violet-700">
                  Vòng {m.round} • {nameOf(m.player_id)}
                  {m.vote_for ? ` → 🗳️ ${nameOf(m.vote_for)}` : ''}
                </p>
                <p className="text-sm font-bold text-slate-700">{m.content}</p>
              </div>
            ))}
          </div>

          {/* Nhập lời nói */}
          {myTurn && (
            <div className="space-y-2 rounded-3xl bg-white p-4 shadow-lg">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 200))}
                rows={2}
                placeholder="Nói gì đó... (tố ai là Sói?) • 发言..."
                className="w-full rounded-2xl border-2 border-violet-200 px-3 py-2 text-sm font-bold outline-none focus:border-violet-400"
              />
              <select
                value={vote}
                onChange={(e) => setVote(e.target.value)}
                className="w-full rounded-2xl border-2 border-violet-200 bg-white px-3 py-2 text-sm font-bold"
              >
                <option value="">Không bỏ phiếu • 不投票</option>
                {state.players
                  .filter((p) => p.is_alive && p.id !== state.me.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      🗳️ Bỏ phiếu loại {p.name} • 投票
                    </option>
                  ))}
              </select>
              <button
                onClick={speak}
                disabled={busy || !text.trim()}
                className="btn-press w-full rounded-3xl bg-violet-500 py-3 text-base font-black text-white shadow disabled:opacity-50"
              >
                GỬI • 发送
              </button>
            </div>
          )}

          {/* Kết thúc */}
          {room.status === 'finished' && (
            <div className={`rounded-3xl p-5 text-center shadow-lg ${iWon ? 'bg-emerald-200' : 'bg-slate-200'}`}>
              <div className="text-5xl">{iWon ? '🏆' : '😵'}</div>
              <h2 className="mt-2 text-xl font-black text-slate-800">
                Phe {room.winner === 'wolves' ? 'Sói 🐺' : 'Dân làng 🧑‍🌾'} thắng!
              </h2>
              <p className="text-xs font-bold text-slate-500">
                {room.winner === 'wolves' ? '狼人阵营获胜' : '村民阵营获胜'} • {iWon ? 'Bạn thắng! 你赢了' : 'Bạn thua 你输了'}
              </p>
              {coins !== null && <p className="mt-1 text-lg font-black text-yellow-700">+{coins} xu • 金币</p>}
              <button
                onClick={() => join(true)}
                disabled={busy}
                className="btn-press mt-3 rounded-2xl bg-white px-5 py-2 text-sm font-black text-slate-700 shadow"
              >
                Ván mới • 新的一局
              </button>
            </div>
          )}
        </>
      )}
    </GameShell>
  );
}
