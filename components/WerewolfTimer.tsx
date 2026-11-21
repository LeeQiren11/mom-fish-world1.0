'use client';

import { useEffect, useState } from 'react';

interface Props {
  deadline: string | null;
  intervalMinutes: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export default function WerewolfTimer({ deadline, intervalMinutes }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!deadline) return null;

  const paused = intervalMinutes >= 120;
  const left = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const urgent = !paused && left < 60;

  return (
    <div
      className={`rounded-2xl px-4 py-2 text-center shadow ${
        paused ? 'bg-indigo-200' : urgent ? 'bg-rose-200' : 'bg-white'
      }`}
    >
      <p className="text-2xl font-black tabular-nums text-slate-800">
        {paused ? '🌙 ' : '⏳ '}
        {h > 0 ? `${pad(h)}:` : ''}
        {pad(m)}:{pad(s)}
      </p>
      <p className="text-[11px] font-bold text-slate-500">
        {paused
          ? 'Tạm nghỉ (hạn lượt 8:45) • 暂停中'
          : `${intervalMinutes} phút/lượt • 每轮${intervalMinutes}分钟`}
      </p>
    </div>
  );
}
