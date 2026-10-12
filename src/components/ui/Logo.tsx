import Link from 'next/link';

type Kind = 'line' | 'stack';

/** Логотип — только готовые SVG из дизайн-кита, никогда не текстом (в Unbounded нет «Ә»). */
export function Logo({ kind = 'line', white = false, height = 22 }: { kind?: Kind; white?: boolean; height?: number }) {
  const src = `/brand/logo/logo-${kind}${white ? '-white' : ''}.svg`;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="ӘЙДӘ ИНДЕ!" style={{ height, width: 'auto' }} />;
}

export function LogoLink({ height = 22 }: { height?: number }) {
  return <Link href="/" aria-label="ӘЙДӘ ИНДЕ! — на главную" style={{ display: 'inline-flex' }}><Logo height={height} /></Link>;
}
