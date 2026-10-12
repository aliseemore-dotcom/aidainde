'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Sparkles, Compass, Info, ICON_STROKE } from '../ui/icons';

const TABS = [
  { href: '/', label: 'Главная', Icon: House },
  { href: '/quiz', label: 'Подобрать досуг', Icon: Sparkles },
  { href: '/explore', label: 'Каталог', Icon: Compass },
  { href: '/about', label: 'О сервисе', Icon: Info },
] as const;

export function TabBar() {
  const path = usePathname();
  if (path.startsWith('/quiz')) return null; // на тесте ничего не отвлекает
  return (
    <div className="tabbar-wrap">
      <nav className="k-tabbar" aria-label="Основная навигация">
        {TABS.map(({ href, label, Icon }) => {
          const current = href === '/' ? path === '/' : path.startsWith(href);
          return (
            <Link key={href} href={href} aria-label={label} aria-current={current ? 'page' : undefined}>
              <Icon size={24} strokeWidth={ICON_STROKE} aria-hidden="true" />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
