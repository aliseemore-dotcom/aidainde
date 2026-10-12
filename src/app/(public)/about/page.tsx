import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoLink } from '@/components/ui/Logo';

export const metadata: Metadata = { title: 'О сервисе' };

export default function AboutPage() {
  return (
    <div className="page">
      <header className="pagehead"><LogoLink /></header>
      <div className="prose">
        <h1 className="t-h1">О сервисе</h1>
        <p className="t-body">ӘЙДӘ ИНДЕ! («Ну, пойдём же!») помогает найти занятие в Казани: ты отвечаешь на несколько вопросов о настроении, компании, дате и бюджете, а мы показываем подходящие места, события и идеи для дома.</p>
        <h2 className="t-h2">Как это работает</h2>
        <ul>
          <li>Подборка строится по понятным правилам, без нейросетей: каждое совпадение можно объяснить.</li>
          <li>В каталоге только вручную проверенные записи со ссылкой на первоисточник.</li>
          <li>Мы не бронируем и не продаём билеты и не обещаем свободных мест: проверяй наличие на странице организатора.</li>
          <li>Цену, которую не знаем, не выдумываем: показываем «Цена уточняется».</li>
        </ul>
        <p className="t-body"><Link href="/privacy">Как мы обращаемся с данными</Link></p>
      </div>
    </div>
  );
}
