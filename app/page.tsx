'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AD_REWARD, GAMES, MAX_ADS_PER_DAY, WEEKLY } from '@/lib/games';
import { useStore, watchAd } from '@/lib/coins';
import SplashAd from '@/components/SplashAd';

export default function HomePage() {
  const store = useStore();
  const [adMsg, setAdMsg] = useState('');
  const played = GAMES.filter((g) => store.playedToday.includes(g.id)).length;

  async function onWatchAd() {
    const r = await watchAd();
    setAdMsg(
      r.ok
        ? `+${r.coins} xu! • 金币+${r.coins}`
        : r.reason === 'limit'
          ? 'Hết lượt xem hôm nay • 今天次数已用完'
          : 'Chưa xem xong quảng cáo • 广告未看完',
    );
    setTimeout(() => setAdMsg(''), 2500);
  }

  return (
    <main className="space-y-4 p-4 pb-8">
      <SplashAd />
      {/* Top card */}
      <section className="rounded-3xl bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black leading-tight text-sky-600">MÕM FISH WORLD</h1>
            <p className="text-xs font-bold text-slate-400">摸鱼世界 • Mõm đi làm, nhưng vẫn vui!</p>
          </div>
          <div className="rounded-2xl bg-yellow-300 px-3 py-2 text-center shadow">
            <div className="text-xl font-black text-yellow-900">🪙 {store.coins.toLocaleString('vi-VN')}</div>
            <div className="text-[10px] font-bold text-yellow-800">xu • 金币</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-sky-50 px-3 py-2">
          <span className="text-sm font-extrabold text-sky-700">
            Đã chơi {played}/5 • 今日已玩 {played}/5
          </span>
          <button
            onClick={onWatchAd}
            className="btn-press rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-white shadow"
          >
            📺 Xem QC +{AD_REWARD} xu
          </button>
        </div>
        <p className="mt-1 h-4 text-center text-[11px] font-bold text-emerald-600">
          {adMsg || `Quảng cáo thử nghiệm: ${store.adsToday}/${MAX_ADS_PER_DAY} hôm nay • 广告占位`}
        </p>
      </section>

      {/* Game cards */}
      <section className="space-y-3">
        {GAMES.map((g) => {
          const done = store.playedToday.includes(g.id);
          return (
            <Link
              key={g.id}
              href={`/game/${g.slug}`}
              className={`btn-press flex items-center gap-4 rounded-3xl ${g.bg} p-4 shadow-lg`}
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-4xl shadow-inner">
                {g.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black leading-tight text-slate-800">{g.title}</h2>
                <p className="text-xs font-bold text-slate-600">{g.subtitle}</p>
                <p className="mt-1 text-xs text-slate-600">{g.blurb}</p>
              </div>
              <div className="text-2xl">{done ? '✅' : '▶️'}</div>
            </Link>
          );
        })}
      </section>

      {/* Weekly summary */}
      <Link
        href={`/game/${WEEKLY.slug}`}
        className="btn-press flex items-center gap-4 rounded-3xl bg-white p-4 shadow-lg"
      >
        <div className="text-4xl">{WEEKLY.emoji}</div>
        <div className="flex-1">
          <h2 className="text-lg font-black text-slate-800">{WEEKLY.title}</h2>
          <p className="text-xs font-bold text-slate-500">{WEEKLY.subtitle} • Xem thành tích tuần này</p>
        </div>
        <div className="text-2xl">➡️</div>
      </Link>

      {/* QR */}
      <section className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-lg">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-4 border-dashed border-slate-300 text-xs font-black text-slate-400">
          QR CODE
        </div>
        <div>
          <p className="text-sm font-black text-slate-700">Quét mã chơi cùng đồng nghiệp!</p>
          <p className="text-xs font-bold text-slate-400">扫码和同事一起玩</p>
          <p className="mt-1 text-sm font-black text-sky-600">zalo.me/momfishworld</p>
        </div>
      </section>
    </main>
  );
}
