'use client';

import { useState } from 'react';
import { adsRemainingToday, watchAd } from '@/lib/coins';

/**
 * Nút "xem quảng cáo để hồi sinh / thêm 1 lượt".
 * - Bấm => xem rewarded ad => nếu xong thì gọi onReward() (hồi sinh / thêm lượt).
 * - Giới hạn 10 lần/ngày (dùng chung với đồng xu), hết lượt thì ẩn.
 */
export default function ReviveAdButton({
  label = 'Xem QC để hồi sinh • 看广告复活',
  onReward,
}: {
  label?: string;
  onReward: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (adsRemainingToday() <= 0) return null;

  async function handle() {
    if (busy) return;
    setBusy(true);
    setMsg('');
    const r = await watchAd();
    setBusy(false);
    if (r.ok) {
      onReward();
    } else {
      setMsg(r.reason === 'limit' ? 'Hết lượt hôm nay • 今天次数已用完' : 'Chưa xem xong • 未看完');
      setTimeout(() => setMsg(''), 2000);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        onClick={handle}
        disabled={busy}
        className="btn-press w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 py-3 text-sm font-black text-white shadow-lg"
      >
        {busy ? 'Đang tải quảng cáo... • 加载广告中' : `📺 ${label} (+50 xu)`}
      </button>
      {msg && <p className="text-center text-xs font-bold text-rose-500">{msg}</p>}
    </div>
  );
}
