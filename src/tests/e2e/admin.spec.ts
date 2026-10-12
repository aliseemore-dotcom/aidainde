import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('админка: анонимный доступ закрыт', () => {
  for (const path of ['/admin', '/admin/places', '/admin/events/new', '/admin/activities/11111111-1111-1111-1111-111111111111']) {
    test(`${path} -> форма входа`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login$/);
      await expect(page.getByRole('heading', { name: 'Вход для редакторов' })).toBeVisible();
    });
  }

  test('страница входа доступна и без утечек', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByLabel('Почта')).toBeVisible();
    await expect(page.getByLabel('Пароль')).toHaveAttribute('type', 'password');
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('API без сессии: 401 в едином формате; запись и удаление тоже', async ({ request }) => {
    const get = await request.get('/api/admin/places');
    expect(get.status()).toBe(401);
    expect((await get.json()).error.code).toBe('UNAUTHORIZED');
    const post = await request.post('/api/admin/places', { data: { title: 'x' } });
    expect([401, 403]).toContain(post.status());
    const del = await request.delete('/api/admin/places/11111111-1111-1111-1111-111111111111');
    expect([401, 403]).toContain(del.status());
  });

  test('предпросмотр ?preview=1 без входа не раскрывает ничего лишнего', async ({ page }) => {
    const r = await page.goto('/places/nope-draft?preview=1');
    expect(r!.status()).toBe(404);
  });

  test('robots и sitemap: админка и результаты закрыты от индексации', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toMatch(/Disallow: \/admin/);
    expect(robots).toMatch(/Disallow: \/results/);
    const sm = await (await request.get('/sitemap.xml')).text();
    expect(sm).toContain('/places/demo-muzey');
    expect(sm).not.toContain('/admin');
  });
});
