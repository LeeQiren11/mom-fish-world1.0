'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import GameShell from './GameShell';
import { BOSS } from '@/lib/games';
import { recordResult } from '@/lib/coins';

type Phase = 'ready' | 'play' | 'done';

export default function Game2_Boss() {
  const [phase, setPhase] = useState<Phase>('ready');
  const [timeLeft, setTimeLeft] = useState(BOSS.SECONDS);
  const [stats, setStats] = useState({ score: 0, dodged: 0, caught: 0 });
  const [boss, setBoss] = useState<number | null>(null);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const [coins, setCoins] = useState(0);

  const statsRef = useRef(stats);
  const answered = useRef(true);
  const bossRef = useRef<number | null>(null);
  const startedAt = useRef(0);
  const recorded = useRef(false);

  const apply = useCallback((ok: boolean) => {
    const s = statsRef.current;
    const next = ok
      ? { score: s.score + BOSS.DODGE_POINTS, dodged: s.dodged + 1, caught: s.caught }
      : { score: s.score + BOSS.CAUGHT_POINTS, dodged: s.dodged, caught: s.caught + 1 };
    statsRef.current = next;
    setStats(next);
    setFlash(ok ? 'ok' : 'bad');
    setTimeout(() => setFlash(null), 250);
  }, []);

  function start() {
    statsRef.current = { score: 0, dodged: 0, caught: 0 };
    setStats(statsRef.current);
    setTimeLeft(BOSS.SECONDS);
    recorded.current = false;
    startedAt.current = Date.now();
    setPhase('play');
  }

  // Đồng hồ 30 giây
  useEffect(() => {
    if (phase !== 'play') return;
    const tick = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(tick);
  }, [phase]);

  // Hết giờ
  useEffect(() => {
    if (phase === 'play' && timeLeft <= 0) {
      bossRef.current = null;
      setBoss(null);
      setPhase('done');
      if (!recorded.current) {
        recorded.current = true;
        const s = statsRef.current;
        setCoins(recordResult('boss', s.score, s.caught < BOSS.CAUGHT_LIMIT));
      }
    }
  }, [phase, timeLeft]);

  // Sếp xuất hiện ngẫu nhiên ở 1 trong 3 ô, càng về sau càng nhanh
  useEffect(() => {
    if (phase !== 'play') return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const spawn = () => {
      if (!alive) return;
      const b = Math.floor(Math.random() * 3);
      bossRef.current = b;
      answered.current = false;
      setBoss(b);
      const elapsed = (Date.now() - startedAt.current) / 1000;
      const windowMs = Math.max(650, 1300 - elapsed * 20);
      timer = setTimeout(() => {
        if (!alive) return;
        if (!answered.current) {
          answered.current = true;
          apply(false); // không kịp trốn => bị bắt
        }
        bossRef.current = null;
        setBoss(null);
        timer = setTimeout(spawn, 300);
      }, windowMs);
    };

    timer = setTimeout(spawn, 500);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, apply]);

  function tap(i: number) {
    if (phase !== 'play' || bossRef.current === null || answered.current) return;
    answered.current = true;
    apply(i !== bossRef.current); // bấm ô khác chỗ sếp = trốn được
  }

  const win = phase === 'done' && stats.caught < BOSS.CAUGHT_LIMIT;

  return (
    <GameShell
      title="TRỐN SẾP"
      subtitle="躲老板 • 老板来了! 快躲开!"
      emoji="👔"
      shareText={`Mình đã trốn sếp ${stats.dodged} lần, bạn trốn được mấy lần? • 我躲了老板 ${stats.dodged} 次, 你能躲几次?`}
    >
      <div className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-lg">
        <div>
          <p className="text-xs font-bold text-slate-400">Điểm • 得分</p>
          <p className="text-3xl font-black text-amber-600">{stats.score}</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold text-slate-400">Bị bắt • 被抓</p>
          <p className="text-2xl font-black text-rose-600">{stats.caught}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-slate-400">Còn lại • 剩余</p>
          <p className="text-3xl font-black text-sky-600">{Math.max(0, timeLeft)}s</p>
        </div>
      </div>

      <p
        className={`rounded-2xl py-2 text-center text-sm font-black ${
          flash === 'bad' ? 'bg-rose-200 text-rose-700' : flash === 'ok' ? 'bg-emerald-200 text-emerald-700' : 'bg-white text-slate-600'
        }`}
      >
        {flash === 'bad'
          ? 'Bị bắt quả tang! • 被抓包!'
          : flash === 'ok'
            ? 'Trốn thành công! • 躲开了!'
            : boss !== null
              ? 'Sếp đến rồi! Bấm ô khác để trốn! • 老板来了! 点其他格子!'
              : 'Chờ sếp xuất hiện... • 等老板出现...'}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            onClick={() => tap(i)}
            disabled={phase !== 'play'}
            className={`btn-press flex h-28 items-center justify-center rounded-3xl text-5xl shadow-lg ${
              boss === i ? 'bg-rose-300' : 'bg-amber-200'
            }`}
          >
            {boss === i ? '👨‍💼' : '🖥️'}
          </button>
        ))}
      </div>

      {phase === 'ready' && (
        <button onClick={start} className="btn-press w-full rounded-3xl bg-amber-400 py-4 text-lg font-black text-white shadow-lg">
          BẮT ĐẦU • 开始 (30s)
        </button>
      )}

      {phase === 'done' && (
        <div className={`rounded-3xl p-5 text-center shadow-lg ${win ? 'bg-emerald-200' : 'bg-rose-200'}`}>
          <div className="text-5xl">{win ? '😎' : '😱'}</div>
          <h2 className="mt-2 text-xl font-black text-slate-800">
            {win ? 'Thắng! Sếp không bắt được!' : 'Thua! Bị bắt quá nhiều!'}
          </h2>
          <p className="text-xs font-bold text-slate-500">{win ? '胜利' : '失败'} • Trốn {stats.dodged} lần • 躲了{stats.dodged}次</p>
          <p className="mt-1 text-2xl font-black text-slate-800">Điểm: {stats.score}</p>
          <p className="text-lg font-black text-yellow-700">+{coins} xu • 金币</p>
          <button onClick={start} className="btn-press mt-3 rounded-2xl bg-white px-5 py-2 text-sm font-black text-slate-700 shadow">
            Chơi lại • 再来一局
          </button>
        </div>
      )}
    </GameShell>
  );
}
