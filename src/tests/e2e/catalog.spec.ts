import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const pick = (page: Page, label: string | RegExp) => page.getByRole('button', { name: label }).first().click();

async function quizToResults(page: Page, labels: string[]) {
  await page.goto('/quiz');
  for (const l of labels) await pick(page, l);
  await page.waitForURL(/\/results\?session=/);
}

const GAMES_GROUP = [
  'Хочу людей и движухи', 'Собираемся компанией', 'Вот это мы оторвались!', 'Под крышу, в тепло и уют',
  'Поиграть и посоревноваться', 'Хочу пошевелить мозгами', 'Квизы и вопросы', 'Немного азарта, без напряжения',
  'В ближайшие выходные', 'До 3 000 ₽', 'На человека',
];

test.describe('результаты', () => {
  test('групповой квиз: подборка с пояснениями, карточка, источник и пометка демо', async ({ page }) => {
    await page.goto('/quiz');
    for (const l of GAMES_GROUP) await pick(page, l);
    await page.getByRole('button', { name: 'Больше' }).click(); // 3 -> 4 человека
    await page.getByRole('button', { name: 'Дальше' }).click();
    await page.waitForURL(/\/results\?session=[\w-]{32}$/);
    expect(page.url()).not.toMatch(/budget|mood|excitement/); // ответов в адресе нет
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Вот что подойдёт');
    const card = page.getByRole('article').filter({ hasText: 'квиз-вечер' }).first();
    await expect(card).toBeVisible();
    await expect(card.getByLabel('Почему подходит')).toContainText('Квиз');
    await expect(card).toContainText('Демо, вымышленная запись');
    await expect(page.getByText(/не бронируем и не обещаем свободных мест/)).toBeVisible();
    await page.screenshot({ path: 'test-results/results.png', fullPage: true });

    await card.getByRole('link', { name: /квиз-вечер/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('квиз-вечер');
    await expect(page.getByText('Демо, вымышленная запись: не настоящее место')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Официальный источник' })).toHaveAttribute('href', /^https:\/\//);
    await expect(page.getByRole('link', { name: 'Показать на карте' })).toHaveAttribute('rel', /noopener/);
    await page.screenshot({ path: 'test-results/place.png', fullPage: true });
  });

  test('«Изменить бюджет» открывает тест на нужном шаге с прежними ответами', async ({ page }) => {
    await page.goto('/quiz');
    for (const l of ['Сам пока не понимаю', 'Я сегодня сам по себе', 'Как же хорошо отдохнул', 'Никуда не пойду, хочу дома', 'Игровой', 'Почти никаких', 'Сегодня', 'До 1 000 ₽']) await pick(page, l);
    await page.waitForURL(/\/results\?session=/);
    await page.getByRole('link', { name: 'Изменить бюджет' }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Насколько готовы разгуляться?');
    await expect(page.getByRole('button', { name: 'До 1 000 ₽' })).toHaveAttribute('aria-pressed', 'true');
    expect(page.url()).toMatch(/\/quiz$/); // токен убран из адреса
    await pick(page, 'Бесплатно');
    await page.waitForURL(/\/results\?session=/);
    await expect(page.getByText('Бесплатно').first()).toBeVisible();
  });

  test('домашний вечер: только идеи на дом', async ({ page }) => {
    await quizToResults(page, ['Сам пока не понимаю', 'Я сегодня сам по себе', 'Как же хорошо отдохнул', 'Никуда не пойду, хочу дома', 'Кулинарный', 'Хочется целый мини-проект', 'Сегодня', 'До 1 000 ₽']);
    await expect(page.getByRole('article').first()).toContainText('Идея на дом');
    await expect(page.getByRole('article').filter({ hasText: 'Место' })).toHaveCount(0);
    await page.getByRole('article').first().getByRole('link').first().click();
    await expect(page.getByText('Что понадобится')).toBeVisible();
    await expect(page.getByText('Как это сделать')).toBeVisible();
  });

  test('семья с детьми: бара 18+ в подборке нет', async ({ page }) => {
    await page.goto('/quiz');
    for (const l of ['Только свои, пожалуйста', 'С семьёй / с детьми', 'Как классно посидели и поболтали', 'Под крышу, в тепло и уют', 'Поиграть и посоревноваться', 'Главное — посмеяться', 'Настолки и разговоры', 'Главное — хорошо провести время', 'В ближайшие выходные', 'До 3 000 ₽', 'На человека']) await pick(page, l);
    await page.getByRole('button', { name: 'Больше' }).click();
    await page.getByRole('button', { name: 'Дальше' }).click();
    await pick(page, '4–6');
    await page.getByRole('button', { name: 'Дальше' }).click();
    await page.waitForURL(/\/results\?session=/);
    await expect(page.getByRole('article').filter({ hasText: 'настольными играми' }).first()).toBeVisible();
    await expect(page.getByText('бар 18+')).toHaveCount(0);
  });

  test('подделанная ссылка и срок жизни: «Ссылка устарела», без ошибок', async ({ page }) => {
    await page.goto('/results?session=' + 'a'.repeat(32));
    await expect(page.getByRole('heading', { name: 'Ссылка устарела' })).toBeVisible();
    await page.goto('/results?session=%27%20OR%201%3D1');
    await expect(page.getByRole('heading', { name: 'Ссылка устарела' })).toBeVisible();
    await page.goto('/results');
    await expect(page.getByRole('heading', { name: 'Нет подборки' })).toBeVisible();
  });
});

test.describe('каталог', () => {
  test('вкладки, фильтры, поиск и пустая выдача', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Выбери сам');
    await expect(page.getByRole('link', { name: 'Места' })).toHaveAttribute('aria-current', 'true'); // по умолчанию — места
    await page.getByRole('link', { name: 'События' }).click();
    await expect(page.getByRole('link', { name: 'События' })).toHaveAttribute('aria-current', 'true');
    await page.getByRole('link', { name: 'Места' }).click();
    await expect(page.getByRole('link', { name: 'Места' })).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('article').first()).toBeVisible();
    await page.getByRole('link', { name: 'Игры', exact: true }).click();
    await expect(page.getByRole('article').first()).toBeVisible();
    for (const t of await page.getByRole('article').allTextContents()) expect(t).not.toBe('');
    await page.getByRole('searchbox', { name: 'Поиск по каталогу' }).fill('музей');
    await page.getByRole('button', { name: 'Найти' }).click();
    await expect(page.getByRole('heading', { name: 'Ничего не нашли' })).toBeVisible();
    await page.screenshot({ path: 'test-results/explore-empty.png', fullPage: true });
    await page.getByRole('link', { name: 'Сбросить фильтры' }).click();
    await expect(page).toHaveURL(/\/explore$/);
  });

  test('мусор в адресе не ломает страницу', async ({ page }) => {
    const r = await page.goto('/explore?type=drop&priceMax=abc&page=-5&category=zzz');
    expect(r!.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Выбери сам');
  });

  test('фильтр цены «Бесплатно» не показывает платное и «цена уточняется»', async ({ page }) => {
    await page.goto('/explore?type=place&priceMax=0');
    const cards = page.getByRole('article');
    await expect(cards.first()).toBeVisible();
    for (const t of await cards.allTextContents()) { expect(t).toContain('Бесплатно'); expect(t).not.toContain('уточняется'); }
  });

  test('карточки события и несуществующей записи', async ({ page }) => {
    await page.goto('/explore?type=event');
    await page.getByRole('article').filter({ hasText: 'камерный концерт' }).getByRole('link').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('камерный концерт');
    await expect(page.getByText(/Мы не продаём билеты и не обещаем свободных мест/)).toBeVisible();
    await page.screenshot({ path: 'test-results/event.png', fullPage: true });
    // отменённое — с корректным статусом и неактивной кнопкой
    await page.goto('/events/demo-otmenennoe');
    await expect(page.getByRole('button', { name: 'Мероприятие отменено' })).toBeDisabled();
    const missing = await page.goto('/places/nope-nope');
    expect(missing!.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Такой страницы нет' })).toBeVisible();
  });
});

test.describe('доступность (axe, WCAG A/AA)', () => {
  for (const [name, url] of [['главная', '/'], ['каталог', '/explore?type=place'], ['карточка места', '/places/demo-muzey'], ['карточка события', '/events/demo-koncert'], ['идея на дом', '/activities/demo-nastolki-doma'], ['заглушка свидания', '/date'], ['о сервисе', '/about'], ['404', '/nope']] as const) {
    test(name, async ({ page }) => {
      await page.goto(url);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('тест: вопрос, мульти-выбор и число', async ({ page }) => {
    await page.goto('/quiz');
    const axe = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect((await axe()).violations).toEqual([]);
    for (const l of ['Только свои, пожалуйста', 'С семьёй / с детьми', 'Как же хорошо отдохнул', 'Неважно, лишь бы было интересно', 'Спокойно перезагрузиться', 'Расслабить тело', 'Минимум разговоров', 'Сегодня', 'До 3 000 ₽', 'На всех']) await pick(page, l);
    expect((await axe()).violations).toEqual([]); // число
    await page.getByRole('button', { name: 'Дальше' }).click();
    expect((await axe()).violations).toEqual([]); // мульти-выбор
  });
});
