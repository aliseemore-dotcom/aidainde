import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const as = (ctx: BrowserContext, role: 'editor' | 'admin', baseURL: string) =>
  ctx.addCookies([{ name: 'e2e_admin', value: role, url: baseURL }]);

// каждый прогон создаёт записи с уникальным slug
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function fillPlace(page: Page, slug: string, title: string) {
  // сначала slug: название при потере фокуса само предлагает slug, и ввод не должен с этим гоняться
  await page.getByLabel('Адрес страницы (slug)').fill(slug);
  await page.getByLabel('Название', { exact: true }).fill(title);
  await page.getByLabel('Описание', { exact: true }).fill('Тестовое описание места, созданное из админки.');
  await page.getByLabel('Адрес', { exact: true }).fill('ул. Тестовая, 1');
  await page.getByLabel('Ссылка на первоисточник').fill('https://example.com/source');
  await page.getByRole('button', { name: 'Прогулки', exact: true }).click();
  await page.getByLabel('Демо-запись', { exact: false }).check();
}

test.describe('админка: полный сценарий редактора', () => {
  test.beforeEach(async ({ context, baseURL }) => { await as(context, 'editor', baseURL!); });

  test('обзор и списки открываются, форма доступна', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Каталог' })).toBeVisible();
    await page.getByRole('link', { name: 'Места', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Места' })).toBeVisible();
    await page.goto('/admin/places/new');
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: 'test-results/admin-form.png', fullPage: true });
  });

  test('черновик → публикация → виден публично → снятие → не виден', async ({ page, request }) => {
    const slug = `e2e-${uid()}`;
    await page.goto('/admin/places/new');
    await fillPlace(page, slug, 'E2E: место для проверки');
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    await page.waitForURL(/\/admin\/places\/[0-9a-f-]{36}$/);
    expect((await request.get(`/api/places/${slug}`)).status()).toBe(404); // черновик публично не виден

    // предпросмотр редактору доступен
    await page.goto(`/places/${slug}?preview=1`);
    await expect(page.getByText('Предпросмотр для редактора')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('E2E: место для проверки');

    await page.goBack();
    await page.getByRole('button', { name: 'Опубликовать' }).click();
    await expect(page.locator('.k-notice[role=status]')).toContainText('Опубликовано');
    expect((await request.get(`/api/places/${slug}`)).status()).toBe(200);
    await page.goto(`/explore?type=place&q=${encodeURIComponent('E2E: место')}`);
    await expect(page.getByRole('article').filter({ hasText: 'E2E: место для проверки' })).toBeVisible();

    await page.goBack();
    await page.getByRole('button', { name: 'Снять с публикации' }).click();
    await expect(page.locator('.k-notice[role=status]')).toContainText('Снято с публикации');
    expect((await request.get(`/api/places/${slug}`)).status()).toBe(404);
    // редактор не видит кнопку удаления
    await expect(page.getByRole('button', { name: 'Удалить' })).toHaveCount(0);
  });

  test('публикация события без даты проверки: понятная ошибка, введённое сохраняется', async ({ page }) => {
    await page.goto('/admin/events/new');
    await page.getByLabel('Адрес страницы (slug)').fill(`e2e-ev-${uid()}`);
    await page.getByLabel('Название', { exact: true }).fill('E2E: событие без проверки');
    await page.getByLabel('Описание', { exact: true }).fill('Описание события для проверки ошибок.');
    await page.getByLabel('Начало (время Казани)').fill('2030-01-01T19:00');
    await page.getByLabel('Ссылка на первоисточник').fill('https://example.com/e');
    await page.getByRole('button', { name: 'Культура', exact: true }).click();
    await page.getByRole('button', { name: 'Опубликовать' }).click();
    await expect(page.locator('.k-notice[role=alert]')).toContainText('verifiedAt');
    await expect(page.getByLabel('Название', { exact: true })).toHaveValue('E2E: событие без проверки');
  });

  test('повторный slug и неверные поля показываются ошибкой', async ({ page }) => {
    await page.goto('/admin/places/new');
    await fillPlace(page, 'demo-muzey', 'Дубликат'); // slug занят демо-записью
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    await expect(page.locator('.k-notice[role=alert]')).toContainText('уже занят');
  });

  test('аноним после выхода снова закрыт', async ({ page, context }) => {
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await context.clearCookies();
    await page.goto('/admin/places');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});

test.describe('роли', () => {
  test('удалять может только admin', async ({ context, page, baseURL }) => {
    await as(context, 'admin', baseURL!);
    const slug = `e2e-del-${uid()}`;
    await page.goto('/admin/places/new');
    await fillPlace(page, slug, 'E2E: на удаление');
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    await page.waitForURL(/\/admin\/places\/[0-9a-f-]{36}$/);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Удалить' }).click();
    await expect(page).toHaveURL(/\/admin\/places$/);
    await expect(page.getByText('E2E: на удаление')).toHaveCount(0);
  });
});

test.describe('удобство формы', () => {
  test('slug предлагается из названия, пока редактор не ввёл свой', async ({ context, page, baseURL }) => {
    await as(context, 'editor', baseURL!);
    await page.goto('/admin/places/new');
    await page.getByLabel('Название', { exact: true }).fill('Кофейня на Баумана');
    await page.getByLabel('Описание', { exact: true }).click(); // потеря фокуса названием
    await expect(page.getByLabel('Адрес страницы (slug)')).toHaveValue('kofeynya-na-baumana');
  });
});
