'use client';

import { useEffect, useRef, useState } from 'react';
import GameShell from './GameShell';
import ReviveAdButton from './ReviveAdButton';
import { DUCK, FOODS, type Food } from '@/lib/games';
import { recordResult } from '@/lib/coins';

type Status = 'play' | 'win' | 'lose';
const clamp = (n: number) => Math.max(0, Math.min(100, n));

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-black text-slate-600">
        <span>{label}</span>
        <span>{Math.round(value)}/100</span>
      </div>
      <div className="h-5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function Game4_Duck() {
  const [hunger, setHunger] = useState(DUCK.START_HUNGER);
  const [energy, setEnergy] = useState(DUCK.START_ENERGY);
  const [status, setStatus] = useState<Status>('play');
  const [coins, setCoins] = useState(0);
  const moves = useRef(0);
  const recorded = useRef(false);

  // Vịt càng lúc càng đói và mệt
  useEffect(() => {
    if (status !== 'play') return;
    const t = setInterval(() => {
      setHunger((h) => clamp(h + DUCK.TICK_HUNGER));
      setEnergy((e) => clamp(e - DUCK.TICK_ENERGY));
    }, DUCK.TICK_MS);
    return () => clearInterval(t);
  }, [status]);

  // Kiểm tra thắng/thua
  useEffect(() => {
    if (status !== 'play' || recorded.current) return;
    let result: Status | null = null;
    if (hunger >= 100) result = 'lose';
    else if (hunger <= DUCK.FED_HUNGER_MAX && energy > DUCK.WIN_ENERGY_MIN) result = 'win';
    if (!result) return;
    recorded.current = true;
    const score = result === 'win' ? Math.max(300, 1200 - moves.current * 100) : 100;
    setCoins(recordResult('duck', score, result === 'win'));
    setStatus(result);
  }, [hunger, energy, status]);

  function restart() {
    moves.current = 0;
    recorded.current = false;
    setHunger(DUCK.START_HUNGER);
    setEnergy(DUCK.START_ENERGY);
    setCoins(0);
    setStatus('play');
  }

  function feed(f: Food) {
    if (status !== 'play') return;
    moves.current += 1;
    setHunger((h) => clamp(h + f.hunger));
    setEnergy((e) => clamp(e + f.energy));
  }

  const face = status === 'lose' ? '💀' : status === 'win' ? '🥳' : hunger > 70 ? '😫' : hunger > 40 ? '😐' : '😊';

  return (
    <GameShell
      title="VỊT VĂN PHÒNG"
      subtitle="打工鸭 • GÚT...GÚT..."
      emoji="🦆"
      shareText={
        status === 'win'
          ? 'Vịt văn phòng của mình ăn no rồi, vịt của bạn thì sao? • 我的打工鸭吃饱了, 你的呢?'
          : 'Vịt văn phòng của mình đang đói bụng! GÚT...GÚT... • 我的打工鸭饿肚子了!'
      }
    >
      <div className="rounded-3xl bg-white p-4 text-center shadow-lg">
        <div className="text-7xl">🦆</div>
        <div className="-mt-2 text-3xl">{face}</div>
        <p className="mt-1 text-sm font-black text-lime-700">
          {status === 'play'
            ? hunger > 70
              ? 'GÚT...GÚT... Đói quá! • 饿肚子'
              : 'Cho vịt ăn nào! • 喂喂它'
            : status === 'win'
              ? 'No nê, đầy năng lượng! • 吃饱了!'
              : 'Vịt kiệt sức rồi... • 饿死了...'}
        </p>
      </div>

      <div className="space-y-3 rounded-3xl bg-white p-4 shadow-lg">
        <Bar label="🍽️ Đói • 饥饿 (100 = chết)" value={hunger} color={hunger > 70 ? 'bg-rose-400' : 'bg-orange-300'} />
        <Bar label="⚡ Năng lượng • 能量 (cần > 80)" value={energy} color="bg-lime-400" />
      </div>

      {status === 'play' && (
        <div className="grid grid-cols-3 gap-3">
          {FOODS.map((f) => (
            <button key={f.id} onClick={() => feed(f)} className="btn-press rounded-3xl bg-lime-200 p-3 text-center shadow-lg">
              <div className="text-4xl">{f.emoji}</div>
              <p className="mt-1 text-sm font-black text-slate-800">{f.name}</p>
              <p className="text-[11px] font-bold text-slate-500">{f.zh}</p>
              <p className="mt-1 text-[11px] font-extrabold text-emerald-700">Đói {f.hunger}</p>
              <p className="text-[11px] font-extrabold text-sky-700">Năng lượng +{f.energy}</p>
            </button>
          ))}
        </div>
      )}

      {status !== 'play' && (
        <div className={`rounded-3xl p-5 text-center shadow-lg ${status === 'win' ? 'bg-emerald-200' : 'bg-slate-200'}`}>
          <h2 className="text-xl font-black text-slate-800">
            {status === 'win' ? 'Vịt đã no! Thắng rồi!' : 'Vịt đói quá... Thua rồi!'}
          </h2>
          <p className="text-xs font-bold text-slate-500">{status === 'win' ? '胜利' : '失败'} • Số lần cho ăn: {moves.current}</p>
          <p className="mt-1 text-lg font-black text-yellow-700">+{coins} xu • 金币</p>
          <button onClick={restart} className="btn-press mt-3 rounded-2xl bg-white px-5 py-2 text-sm font-black text-slate-700 shadow">
            Chơi lại • 再来一局
          </button>
          {status === 'lose' && <ReviveAdButton label="Xem QC để hồi sinh vịt • 看广告救活鸭子" onReward={restart} />}
        </div>
      )}
    </GameShell>
  );
}
