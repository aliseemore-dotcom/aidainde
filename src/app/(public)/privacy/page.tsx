import type { Metadata } from 'next';
import { LogoLink } from '@/components/ui/Logo';

export const metadata: Metadata = { title: 'Данные и приватность' };

export default function PrivacyPage() {
  return (
    <div className="page">
      <header className="pagehead"><LogoLink /></header>
      <div className="prose">
        <h1 className="t-h1">Данные и приватность</h1>
        <p className="t-body">Регистрации нет. Мы не просим имя, телефон или почту.</p>
        <ul>
          <li>Пока ты проходишь тест, ответы хранятся только в твоём браузере и стираются через сутки.</li>
          <li>Когда показываем подборку, ответы сохраняются на сервере без персональных данных и удаляются через 30 дней.</li>
          <li>Ссылка на результаты содержит случайный токен, а не твои ответы. Любой, у кого есть ссылка, увидит подборку, поэтому делись ею осознанно.</li>
          <li>Аналитика, если подключена, агрегированная и не привязана к человеку.</li>
        </ul>
        <p className="t-meta">Текст — рабочая версия для MVP; юридическую редакцию нужно утвердить перед запуском.</p>
      </div>
    </div>
  );
}
