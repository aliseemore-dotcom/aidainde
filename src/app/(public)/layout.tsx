import type { ReactNode } from 'react';
import { TabBar } from '@/components/layout/TabBar';
import { PreviewModeBanner } from '@/components/layout/PreviewModeBanner';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PreviewModeBanner />
      <main id="main">{children}</main>
      <TabBar />
    </>
  );
}
