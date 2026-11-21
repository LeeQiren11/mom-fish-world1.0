'use client';

import { useRef, useState } from 'react';
import GameShell from './GameShell';
import { MILKTEA, TEAS, formatVND, type Tea } from '@/lib/games';
import { recordResult } from '@/lib/coins';

const TOTAL = MILKTEA.DAYS * MILKTEA.CUSTOMERS_PER_DAY;

export default function Game3_MilkTea() {
  const [n, setN] = useState(0);
  const [cups, setCups] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [toast, setToast] = useState('Khách đang chờ! Chọn món đi • 客人在等, 选一杯');
  const [coins, setCoins] = useState(0);
  const recorded = useRef(false);

  const done = n >= TOTAL;
  const day = Math.min(MILKTEA.DAYS, Math.floor(n / MILKTEA.CUSTOMERS_PER_DAY) + 1);
  const customer = (n % MILKTEA.CUSTOMERS_PER_DAY) + 1;
  const win = done && revenue >= MILKTEA.TARGET;
  const pct = Math.min(100, Math.round((revenue / MILKTEA.TARGET) * 100));

  function restart() {
    recorded.current = false;
    setN(0);
    setCups(0);
    setRevenue(0);
    setCoins(0);
    setToast('Khách đang chờ! Chọn món đi • 客人在等, 选一杯');
  }

  function sell(t: Tea) {
    if (done) return;
    const ok = Math.random() < t.rate;
    const newRevenue = revenue + (ok ? t.price : 0);
    const newCups = cups + (ok ? 1 : 0);
    setRevenue(newRevenue);
    setCups(newCups);
    setToast(
      ok
        ? `✅ Bán được ${t.name}! +${formatVND(t.price)} • 卖出!`
        : '❌ Khách bỏ đi mất... • 客人走了',
    );
    const next = n + 1;
    setN(next);
    if (next >= TOTAL && !recorded.current) {
      recorded.current = true;
      // score = doanh thu/100 => calcCoins: 850.000đ => 850 xu
      setCoins(recordResult('milktea', Math.round(newRevenue / 100), newRevenue >= MILKTEA.TARGET));
    }
  }

  return (
    <GameShell
      title="TIỆM TRÀ SỮA CÔ BA"
      subtitle="奶茶店 • 目标: 7天赚85万"
      emoji="🧋"
      shareText={`Tiệm trà sữa Cô Ba của mình bán ${cups} ly, thu ${formatVND(revenue)} sau 7 ngày! • 我的奶茶店卖了${cups}杯, 赚了${formatVND(revenue)}`}
    >
      <div className="rounded-3xl bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="rounded-2xl bg-pink-100 px-3 py-1 text-sm font-black text-pink-700">
            Ngày {day}/7 • 第{day}天
          </div>
          <div className="text-xs font-bold text-slate-400">
            Khách {done ? MILKTEA.CUSTOMERS_PER_DAY : customer}/{MILKTEA.CUSTOMERS_PER_DAY} • 客人
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-pink-50 p-2">
            <p className="text-[11px] font-bold text-slate-400">Đã bán • 已卖</p>
            <p className="text-2xl font-black text-pink-600">{cups} ly</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-2">
            <p className="text-[11px] font-bold text-slate-400">Tổng thu • 总收入</p>
            <p className="text-lg font-black text-emerald-600">{formatVND(revenue)}</p>
          </div>
        </div>
        <div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-pink-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-right text-xs font-bold text-slate-400">
          Mục tiêu {formatVND(MILKTEA.TARGET)} • 目标 ({pct}%)
        </p>
      </div>

      <p className="rounded-2xl bg-white/80 px-3 py-2 text-center text-sm font-bold text-slate-600">{toast}</p>

      {!done && (
        <div className="grid grid-cols-3 gap-3">
          {TEAS.map((t) => (
            <button key={t.id} onClick={() => sell(t)} className="btn-press rounded-3xl bg-pink-200 p-3 text-center shadow-lg">
              <div className="text-4xl">{t.emoji}</div>
              <p className="mt-1 text-sm font-black text-slate-800">{t.name}</p>
              <p className="text-[11px] font-bold text-slate-500">{t.zh}</p>
              <p className="mt-1 text-xs font-extrabold text-emerald-700">{formatVND(t.price)}</p>
              <p className="text-[11px] font-bold text-rose-600">{Math.round(t.rate * 100)}% thành công</p>
            </button>
          ))}
        </div>
      )}

      {done && (
        <div className={`rounded-3xl p-5 text-center shadow-lg ${win ? 'bg-emerald-200' : 'bg-slate-200'}`}>
          <div className="text-5xl">{win ? '🎉' : '😢'}</div>
          <h2 className="mt-2 text-xl font-black text-slate-800">
            {win ? 'Đạt mục tiêu! Cô Ba tự hào!' : 'Chưa đạt mục tiêu...'}
          </h2>
          <p className="text-xs font-bold text-slate-500">{win ? '达成目标' : '未达成目标'}</p>
          <p className="mt-1 text-lg font-black text-yellow-700">+{coins} xu • 金币</p>
          <button onClick={restart} className="btn-press mt-3 rounded-2xl bg-white px-5 py-2 text-sm font-black text-slate-700 shadow">
            Chơi lại • 再来一局
          </button>
        </div>
      )}
    </GameShell>
  );
}
