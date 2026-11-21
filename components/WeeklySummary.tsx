'use client';

import GameShell from './GameShell';
import { useStore, weeklyStats } from '@/lib/coins';

export default function WeeklySummary() {
  const store = useStore();
  const w = weeklyStats(store.logs);

  const items = [
    { label: 'Đã chơi • 已玩', value: `${w.played}/5`, emoji: '🎮', bg: 'bg-sky-200' },
    { label: 'Thắng • 胜利', value: String(w.wins), emoji: '🏆', bg: 'bg-emerald-200' },
    { label: 'Xu tuần này • 本周金币', value: `+${w.coins.toLocaleString('vi-VN')}`, emoji: '🪙', bg: 'bg-yellow-200' },
    { label: 'Xếp hạng • 排名', value: `TOP ${w.topPercent}%`, emoji: '📈', bg: 'bg-pink-200' },
  ];

  return (
    <GameShell
      title="TỔNG KẾT TUẦN"
      subtitle="周总结 • 本周战绩"
      emoji="📊"
      shareText={`Tuần này mình chơi ${w.played}/5 game, thắng ${w.wins} ván, +${w.coins} xu, TOP ${w.topPercent}%! • 本周玩了${w.played}/5个游戏, 胜利${w.wins}次, 金币+${w.coins}, TOP ${w.topPercent}%`}
    >
      <div className="grid grid-cols-2 gap-3">
        {items.map((it) => (
          <div key={it.label} className={`rounded-3xl ${it.bg} p-4 text-center shadow-lg`}>
            <div className="text-4xl">{it.emoji}</div>
            <p className="mt-1 text-2xl font-black text-slate-800">{it.value}</p>
            <p className="text-[11px] font-bold text-slate-600">{it.label}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-[11px] font-bold text-slate-400">
        Xếp hạng chỉ là ước tính (chưa có dữ liệu toàn server) • 排名仅为占位估算
      </p>

      <div className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-lg">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-4 border-dashed border-slate-300 text-xs font-black text-slate-400">
          QR CODE
        </div>
        <div>
          <p className="text-sm font-black text-slate-700">Mời đồng nghiệp cùng mò cá!</p>
          <p className="text-xs font-bold text-slate-400">邀请同事一起摸鱼</p>
          <p className="mt-1 text-sm font-black text-sky-600">zalo.me/momfishworld</p>
        </div>
      </div>
    </GameShell>
  );
}
