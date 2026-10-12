import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ArrowUpRight, ICON_STROKE } from './icons';

type Variant = 'primary' | 'secondary' | 'sunken';

interface Common { variant?: Variant; arrow?: boolean; children: ReactNode; className?: string }

function cls({ variant = 'primary', arrow, className }: Pick<Common, 'variant' | 'arrow' | 'className'>) {
  return ['k-btn', `k-btn--${variant}`, arrow && 'k-btn--arrow', className].filter(Boolean).join(' ');
}

const Circle = () => (
  <span className="k-btn__circle" aria-hidden="true"><ArrowUpRight size={20} strokeWidth={ICON_STROKE} /></span>
);

export function Button({ variant, arrow, className, children, ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cls({ variant, arrow, className })} {...rest}>
      {children}{arrow && <Circle />}
    </button>
  );
}

export function ButtonLink({ href, variant, arrow, className, children }: Common & { href: string }) {
  return (
    <Link href={href} className={cls({ variant, arrow, className })}>
      {children}{arrow && <Circle />}
    </Link>
  );
}
