import type { ReactNode } from 'react';
import { TabBar } from '@/components/layout/TabBar';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <main id="main">{children}</main>
      <TabBar />
    </>
  );
}
