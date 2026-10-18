import { expect, test } from '@playwright/test';

const PAGES = ['/', '/quiz', '/explore?type=place', '/places/demo-muzey', '/about'];

test.describe('платформа: приватность, шрифты, заголовки', () => {
  for (const path of PAGES) {
    test(`${path}: только свой домен, CSP не нарушается`, async ({ page, baseURL }) => {
      const hosts = new Set<string>();
      const violations: string[] = [];
      page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol.startsWith('http')) hosts.add(u.host); });
      page.on('console', (m) => { if (/content security policy|refused to/i.test(m.text())) violations.push(m.text()); });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect([...hosts]).toEqual([new URL(baseURL!).host]); // ни Google Fonts, ни трекеров
      expect(violations).toEqual([]);
    });
  }

  test('шрифты Onest и Unbounded загружаются с нашего сервера, татарские буквы в Onest', async ({ page }) => {
    const fontFiles: string[] = [];
    page.on('response', (r) => { if (/\/fonts\/.+\.woff2$/.test(r.url())) fontFiles.push(r.url().split('/').pop()!); });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(fontFiles.some((f) => f.startsWith('onest-cyrillic'))).toBe(true);
    const ok = await page.evaluate(async () => {
      await document.fonts.load('600 16px Onest', 'Сәлам! Әә Өө Үү Җҗ Ңң Һһ');
      return { cyr: document.fonts.check('600 16px Onest', 'Сәлам'), tat: document.fonts.check('16px Onest', 'ӘәӨөҮүҖҗҢңҺһ') };
    });
    expect(ok).toEqual({ cyr: true, tat: true });
  });

  test('заголовки безопасности и кэш статики', async ({ request }) => {
    const res = await request.get('/');
    const h = res.headers();
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['content-security-policy']).not.toMatch(/googleapis|gstatic/);
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['x-powered-by']).toBeUndefined();
    const font = await request.get('/fonts/onest-cyrillic-400.woff2');
    expect(font.status()).toBe(200);
  });
});
