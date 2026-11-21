import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Nunito là variable font: latin + vietnamese dùng chung 1 file, đủ mọi weight
// (400/700/800/900). Dùng local thay cho next/font/google để build không phụ
// thuộc mạng (Google Fonts bị chặn ở một số môi trường sẽ làm build lỗi).
const nunito = localFont({
  src: [
    { path: './fonts/nunito-latin.woff2', weight: '400 900', style: 'normal' },
    { path: './fonts/nunito-vietnamese.woff2', weight: '400 900', style: 'normal' },
  ],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mõm Fish World • 摸鱼世界',
  description: 'Mõm đi làm, nhưng vẫn vui! • 上班摸鱼, 还能赚钱!',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${nunito.className} bg-sky-200`}>
        <div className="mx-auto min-h-screen w-full max-w-md bg-sky-100 shadow-xl">
          {children}
        </div>
      </body>
    </html>
  );
}
