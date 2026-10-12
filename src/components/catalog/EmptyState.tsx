import type { ReactNode } from 'react';
import { Art, type Illustration } from '@/components/ui/Art';

export function EmptyState({ title, text, art = 'notes', children }: { title: string; text?: string; art?: Illustration; children?: ReactNode }) {
  return (
    <div className="hero-soon" role="status">
      <Art name={art} />
      <h2 className="t-h2">{title}</h2>
      {text && <p className="t-body">{text}</p>}
      {children && <div className="actions" style={{ justifyContent: 'center' }}>{children}</div>}
    </div>
  );
}
