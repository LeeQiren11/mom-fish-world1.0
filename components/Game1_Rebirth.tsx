'use client';

import { useRef, useState } from 'react';
import GameShell from './GameShell';
import ReviveAdButton from './ReviveAdButton';
import { JOBS, REBIRTH, calcCoinsByProgress, formatVND, type Job } from '@/lib/games';
import { recordResult } from '@/lib/coins';

export default function Game1_Rebirth() {
  const [day, setDay] = useState(1);
  const [debt, setDebt] = useState(REBIRTH.DEBT);
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [coins, setCoins] = useState(0);
  const recorded = useRef(false);

  function finish(finalDebt: number) {
    if (recorded.current) return;
    recorded.current = true;
    // Xu theo tiến độ trả nợ (0..1200), không phải score/10 như trước —
    // trước đây chỉ cần trả 12 triệu là đã chạm trần 1200 xu.
    const paid = Math.max(0, REBIRTH.DEBT - finalDebt);
    setCoins(recordResult('rebirth', Math.round(paid / 1000), finalDebt === 0, calcCoinsByProgress(paid, REBIRTH.DEBT)));
    setDone(true);
  }

  function restart() {
    recorded.current = false;
    setDay(1);
    setDebt(REBIRTH.DEBT);
    setLog([]);
    setCoins(0);
    setDone(false);
  }

  function work(job: Job) {
    if (done) return;
    const failed = Math.random() < job.failRate;
    const income = failed ? -job.penalty : job.gain;
    const newDebt = Math.max(0, debt - income);
    const msg = failed
      ? `Ngày ${day}: ${job.emoji} ${job.name} thất bại! ${job.penalty ? `Nợ thêm ${formatVND(job.penalty)}` : 'Không kiếm được đồng nào'} • 失败`
      : `Ngày ${day}: ${job.emoji} ${job.name} +${formatVND(job.gain)} • 成功`;
    setDebt(newDebt);
    setLog((l) => [msg, ...l]);
    if (day >= REBIRTH.DAYS || newDebt === 0) {
      finish(newDebt);
    } else {
      setDay(day + 1);
    }
  }

  // Nợ có thể tăng (thất bại chứng khoán) => kẹp 0..100 để thanh tiến độ không bị âm
  const paidPct = Math.max(0, Math.min(100, Math.round(((REBIRTH.DEBT - debt) / REBIRTH.DEBT) * 100)));
  const win = done && debt === 0;

  return (
    <GameShell
      title="TRỌNG SINH"
      subtitle="重生欠债 • 欠款: 3亿越南盾"
      emoji="💸"
      shareText={`Mình còn nợ ${formatVND(debt)} sau ${Math.min(day, 7)} ngày trọng sinh! Bạn thì sao? • 我还欠 ${formatVND(debt)}, 你呢?`}
    >
      <div className="rounded-3xl bg-white p-4 shadow-lg">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400">Nợ còn lại • 剩余债务</p>
            <p className="text-2xl font-black text-rose-600">{formatVND(debt)}</p>
          </div>
          <div className="rounded-2xl bg-rose-100 px-3 py-1 text-sm font-black text-rose-700">
            Ngày {Math.min(day, 7)}/7 • 第{Math.min(day, 7)}天
          </div>
        </div>
        <div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${paidPct}%` }} />
        </div>
        <p className="mt-1 text-right text-xs font-bold text-slate-400">Đã trả {paidPct}% • 已还</p>
      </div>

      {!done && (
        <div className="grid grid-cols-2 gap-3">
          {JOBS.map((j) => (
            <button
              key={j.id}
              onClick={() => work(j)}
              className="btn-press rounded-3xl bg-rose-200 p-3 text-left shadow-lg"
            >
              <div className="text-3xl">{j.emoji}</div>
              <p className="mt-1 text-sm font-black text-slate-800">{j.name}</p>
              <p className="text-[11px] font-bold text-slate-500">{j.zh}</p>
              <p className="mt-1 text-xs font-extrabold text-emerald-700">+{formatVND(j.gain)}</p>
              <p className="text-[11px] font-bold text-rose-600">
                Thất bại {Math.round(j.failRate * 100)}% • 失败率
                {j.penalty ? ` (-${formatVND(j.penalty)})` : ''}
              </p>
            </button>
          ))}
        </div>
      )}

      {done && (
        <div className={`rounded-3xl p-5 text-center shadow-lg ${win ? 'bg-emerald-200' : 'bg-slate-200'}`}>
          <div className="text-5xl">{win ? '🦆' : '💸'}</div>
          <h2 className="mt-2 text-xl font-black text-slate-800">
            {win ? 'Về quê nuôi vịt! Hạnh phúc!' : 'Phá sản rồi...'}
          </h2>
          <p className="text-xs font-bold text-slate-500">
            {win ? '幸福结局: 回乡养鸭' : '破产结局'} • Nợ còn {formatVND(debt)}
          </p>
          <p className="mt-2 text-lg font-black text-yellow-700">+{coins} xu • 金币</p>
          <button onClick={restart} className="btn-press mt-3 rounded-2xl bg-white px-5 py-2 text-sm font-black text-slate-700 shadow">
            Chơi lại • 再来一局
          </button>
          {!win && <ReviveAdButton label="Xem QC để hồi sinh • 看广告复活" onReward={restart} />}
        </div>
      )}

      <div className="space-y-1">
        {log.slice(0, 6).map((l, i) => (
          <p key={i} className="rounded-2xl bg-white/80 px-3 py-2 text-xs font-bold text-slate-600">
            {l}
          </p>
        ))}
      </div>
    </GameShell>
  );
}
