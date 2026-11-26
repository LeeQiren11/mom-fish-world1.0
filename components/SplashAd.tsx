'use client';

import { useEffect, useState } from 'react';
import { setupAds, showFullscreenAd } from '@/lib/ads';

/**
 * Quảng cáo mở app (splash / interstitial): hiển thị 3–5 giây khi vào trang chủ.
 * - Trong Zalo Mini App: gọi setupAd() + showFullscreenAd() (ZMA_Fullscreen).
 * - Ngoài Zalo (trình duyệt): hiển thị overlay "quảng cáo" 3 giây có nút bỏ qua,
 *   để luồng mở app vẫn có trải nghiệm quảng cáo mà không chặn người dùng.
 *
 * Không ép buộc: người dùng có thể bấm "Bỏ qua" bất cứ lúc nào.
 */
export default function SplashAd() {
  const [visible, setVisible] = useState(true);
  const [count, setCount] = useState(3);

  useEffect(() => {
    setupAds();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(t);
          setVisible(false);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 text-white">
      <div className="text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-sky-500 text-5xl shadow-2xl">
          📺
        </div>
        <p className="mt-4 text-lg font-black">Quảng cáo • 广告</p>
        <p className="mt-1 text-xs font-bold text-slate-300">Xem quảng cáo để ủng hộ trò chơi miễn phí</p>
      </div>

      <button
        onClick={() => setVisible(false)}
        className="absolute bottom-8 right-6 rounded-full bg-white/20 px-4 py-2 text-sm font-black backdrop-blur"
      >
        Bỏ qua • 跳过 ({count}s)
      </button>

      <button
        onClick={() => setVisible(false)}
        className="absolute inset-0"
        aria-label="Bỏ qua quảng cáo"
      />
    </div>
  );
}
