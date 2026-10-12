import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'ӘЙДӘ ИНДЕ! — куда сходить в Казани', template: '%s · ӘЙДӘ ИНДЕ!' },
  description: 'Подберём занятие в Казани под настроение, компанию, дату и бюджет.',
  openGraph: { type: 'website', locale: 'ru_RU', siteName: 'ӘЙДӘ ИНДЕ!' },
  icons: { icon: '/brand/logo/app-icon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f4f3f0' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="k-root">{children}</body>
    </html>
  );
}
