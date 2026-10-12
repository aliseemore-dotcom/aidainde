/** Ссылка на Яндекс Карты (внешняя). Карту не встраиваем: ни трекеров, ни лишних запросов. */
export function mapUrl(address: string, lat?: number | null, lng?: number | null): string {
  if (lat != null && lng != null) return `https://yandex.ru/maps/?pt=${lng},${lat}&z=16&l=map`;
  return `https://yandex.ru/maps/?text=${encodeURIComponent(`Казань, ${address}`)}`;
}

export function MapLink({ address, lat, lng }: { address: string; lat?: number | null; lng?: number | null }) {
  return <ExternalLink href={mapUrl(address, lat, lng)}>Показать на карте</ExternalLink>;
}

export function ExternalLink({ href, children, primary = false }: { href: string; children: string; primary?: boolean }) {
  return <a className={`k-btn k-btn--${primary ? 'primary' : 'secondary'}`} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}
