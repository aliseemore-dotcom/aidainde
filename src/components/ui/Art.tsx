export type Illustration = 'kul-sharif' | 'echpochmak' | 'notes' | 'tulip';

/** Декоративная иллюстрация (alt пустой): значение несёт текст рядом. */
export function Art({ name, width }: { name: Illustration; width?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/brand/illustrations/${name}.svg`} alt="" aria-hidden="true" width={width} style={{ height: 'auto' }} />;
}
