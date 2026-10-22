import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const pick = (page: Page, label: string | RegExp) => page.getByRole('button', { name: label }).first().click();
const shot = (page: Page, name: string, testInfo: { project: { name: string } }) =>
  page.screenshot({ path: `test-results/preview-${testInfo.project.name}-${name}.png`, fullPage: true });

async function openQuiz(page: Page) {
  await page.goto('/quiz');
  await page.locator('[data-quiz-ready="true"]').waitFor();
}

test.describe('MVP на подготовленных данных', () => {
  test('главная: понятно, что делает сервис; есть переходы к тесту и каталогу', async ({ page }, ti) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Хм, чем бы заняться в Казани?');
    await expect(page.getByText(/Подскажем, куда пойти и чем заняться/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Подбери мне досуг/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Хочу выбрать сам/ })).toBeVisible();
    await expect(page.getByText(/Режим предпросмотра: показаны черновики/)).toBeVisible();
    await shot(page, '1-home', ti);
  });

  test('полный путь: тест → результаты → карточка места → назад', async ({ page }, ti) => {
    await openQuiz(page);
    await shot(page, '2-quiz-start', ti);
    for (const l of ['Только свои, пожалуйста', 'С другом или подругой', 'Как классно посидели и поболтали', 'Под крышу, в тепло и уют', 'Посидеть в интересном месте', 'Едим вкусное и болтаем', 'Хочется преимущественно сидеть', 'В ближайшие выходные', 'Неважно, если оно того стоит']) await pick(page, l);
    await page.waitForURL(/\/results\?session=/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Вот что подойдёт');
    const cards = page.getByRole('article');
    await expect(cards.first()).toBeVisible();
    // у каждой карточки есть название, категория, краткое описание и адрес
    const first = cards.first();
    await expect(first.locator('.k-card__title')).not.toBeEmpty();
    await expect(first.locator('.k-card__meta').first()).toContainText('Заведения');
    await expect(first.locator('.k-card__desc')).not.toBeEmpty();
    await expect(first.locator('.k-card__where')).toContainText(/ул\.|пр\.|Кремль/);
    await expect(first).toContainText('Черновик');
    await shot(page, '3-results', ti);

    const title = (await first.locator('.k-card__title').innerText()).trim();
    await first.getByRole('link').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByText(/черновик, данные не проверены/)).toBeVisible();
    await expect(page.locator('.detail-art')).toBeVisible(); // аккуратная плитка вместо фото
    await expect(page.getByText('Цена уточняется')).toHaveCount(0); // нет цены — нет и выдуманной строки
    await expect(page.getByText('Часы работы')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Официальный источник' })).toBeVisible();
    await shot(page, '4-place', ti);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Вот что подойдёт');
  });

  test('каталог: места и события, фильтры по типу и категории, карточка', async ({ page }, ti) => {
    await page.goto('/explore');
    await expect(page.getByRole('link', { name: 'Места' })).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('article').first()).toBeVisible();
    await shot(page, '5-catalog', ti);
    // фильтр по типу места
    const kindNav = page.getByRole('navigation', { name: 'Тип места' });
    await kindNav.getByRole('link', { name: 'Кофейня' }).click();
    await expect(kindNav.getByRole('link', { name: 'Кофейня' })).toHaveAttribute('aria-current', 'true');
    const coffee = await page.getByRole('article').allInnerTexts();
    expect(coffee.length).toBeGreaterThan(0);
    for (const t of coffee) expect(t).toContain('Кофейня');
    await kindNav.getByRole('link', { name: 'Бар', exact: true }).click();
    await expect(kindNav.getByRole('link', { name: 'Бар', exact: true })).toHaveAttribute('aria-current', 'true');
    for (const t of await page.getByRole('article').allInnerTexts()) expect(t).toContain('Бар');
    // события
    await page.getByRole('link', { name: 'События' }).click();
    await expect(page.getByRole('link', { name: 'События' })).toHaveAttribute('aria-current', 'true');
    const ev = page.getByRole('article').first();
    await expect(ev).toBeVisible();
    await expect(ev.locator('.k-card__meta').first()).toContainText(/\d{1,2}\s\S+.*\d{2}:\d{2}/); // число, месяц и время
    await shot(page, '6-events', ti);
    await ev.getByRole('link').first().click();
    await expect(page.getByText(/\d{2}:\d{2}/).first()).toBeVisible();
    await expect(page.getByText(/черновик, данные не проверены/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Официальный источник' })).toBeVisible();
    await shot(page, '7-event', ti);
  });

  test('доступность основных экранов (axe)', async ({ page }) => {
    for (const url of ['/', '/explore', '/explore?type=event']) {
      await page.goto(url);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`), url).toEqual([]);
    }
  });

  test('нет горизонтальной прокрутки на ключевых экранах', async ({ page }) => {
    for (const url of ['/', '/quiz', '/explore', '/explore?type=event', '/about']) {
      await page.goto(url);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, url).toBeLessThanOrEqual(0);
    }
  });
});
