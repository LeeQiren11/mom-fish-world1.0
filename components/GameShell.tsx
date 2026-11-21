'use client';

import Link from 'next/link';
import { useState } from 'react';

interface Props {
  title: string;
  subtitle: string;
  emoji: string;
  shareText: string;
  children: React.ReactNode;
}

export default function GameShell({ title, subtitle, emoji, shareText, children }: Props) {
  const [toast, setToast] = useState('');

  async function share() {
    const url = process.env.NEXT_PUBLIC_APP_URL || 'https://zalo.me/momfishworld';
    const text = `${shareText}\n${url}`;

    // Zalo Mini App: dùng openShareSheet của zmp-sdk (giao diện chia sẻ gốc).
    // Ngoài Zalo (trình duyệt thường): fallback về navigator.share / clipboard.
    try {
      const sdk = await import('zmp-sdk').catch(() => null);
      if (sdk && typeof sdk.openShareSheet === 'function') {
        await sdk.openShareSheet({
          type: 'text',
          data: { text: shareText, description: url, autoParseLink: true },
        });
        return;
      }
    } catch {
      /* không phải Zalo Mini App hoặc SDK thiếu API => fallback */
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Mõm Fish World', text, url });
        return;
      }
      await navigator.clipboard.writeText(text);
      setToast('Đã sao chép! • 已复制');
      setTimeout(() => setToast(''), 2000);
    } catch {
      /* người dùng huỷ chia sẻ */
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 p-4">
        <Link
          href="/"
          className="btn-press flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-xl font-black shadow-lg"
          aria-label="Quay lại • 返回"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="text-2xl font-black leading-tight text-slate-800">
            {emoji} {title}
          </h1>
          <p className="text-xs font-bold text-slate-500">{subtitle}</p>
        </div>
        <div className="w-11" />
      </header>

      <main className="flex-1 space-y-4 px-4 pb-4">{children}</main>

      <div className="sticky bottom-0 bg-gradient-to-t from-sky-100 via-sky-100 to-transparent p-4">
        {toast && (
          <p className="mb-2 text-center text-sm font-black text-emerald-600">{toast}</p>
        )}
        <button
          onClick={share}
          className="btn-press w-full rounded-3xl bg-blue-500 py-4 text-base font-black text-white shadow-xl"
        >
          CHIA SẺ KẾT QUẢ • 分享结果
        </button>
      </div>
    </div>
  );
}
