import { expect, test, type Page } from '@playwright/test';

const pick = (page: Page, label: string | RegExp) => page.getByRole('button', { name: label }).first().click();

test.describe('главная', () => {
  test('три равноправных входа и заголовок', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Хм, чем бы заняться в Казани?');
    for (const t of ['Подбери мне досуг', 'Хочу выбрать сам', 'У меня сегодня свидание']) {
      await expect(page.getByRole('link', { name: new RegExp(t) })).toBeVisible();
    }
    await page.screenshot({ path: 'test-results/home.png', fullPage: true });
  });

  test('/date — заглушка и не использует ответы теста', async ({ page }) => {
    await page.goto('/quiz');
    await pick(page, 'Хочу людей и движухи');
    await page.goto('/date');
    await expect(page.getByRole('heading', { name: 'Скоро запустим' })).toBeVisible();
  });
});

test.describe('тест', () => {
  test('один вопрос на экран, фокус на заголовке, назад и смена ответа очищают ветку', async ({ page }) => {
    await page.goto('/quiz');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Как у тебя сегодня с социальной батарейкой?');
    await page.screenshot({ path: 'test-results/quiz-q1.png', fullPage: true });
    await pick(page, 'Хочу людей и движухи');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await pick(page, 'Собираемся компанией');
    await pick(page, 'Вот это мы оторвались!');
    await pick(page, 'Под крышу, в тепло и уют');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('уловил настроение');
    // indoor: направления «Прогуляться» нет
    await expect(page.getByRole('button', { name: /Прогуляться/ })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/quiz-direction.png', fullPage: true });
    await pick(page, 'Поиграть и посоревноваться');
    await pick(page, 'Хочу пошевелить мозгами');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Как будем разминать мозг?');
    await pick(page, 'Квизы и вопросы');
    // назад до G1 и смена на digital
    await page.getByRole('button', { name: 'Назад' }).click();
    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ну что, во что сегодня ввяжемся?');
    await pick(page, 'В другой мир, пожалуйста');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Что больше цепляет?');
    const draft = await page.evaluate(() => localStorage.getItem('aydainde.quiz.draft'));
    expect(draft).not.toContain('"G2_MIND"');
  });

  test('клавиатура: цифры выбирают вариант', async ({ page }) => {
    await page.goto('/quiz');
    await page.keyboard.press('1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Кого берём с собой в это маленькое приключение?');
  });

  test('«дома» не ведёт во внешние ветки', async ({ page }) => {
    await page.goto('/quiz');
    await pick(page, 'Сам пока не понимаю');
    await pick(page, 'Я сегодня сам по себе');
    await pick(page, 'Как же хорошо отдохнул');
    await pick(page, 'Никуда не пойду, хочу дома');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сегодня остаёмся дома — какой вечер устроим?');
  });

  test('черновик восстанавливается после перезагрузки', async ({ page }) => {
    await page.goto('/quiz');
    await pick(page, 'Хочу людей и движухи');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Кого берём с собой в это маленькое приключение?');
  });

  test('чужая версия черновика: предупреждение и старт заново', async ({ page }) => {
    await page.goto('/quiz');
    await page.evaluate(() => localStorage.setItem('aydainde.quiz.draft', JSON.stringify({
      savedAt: Date.now(),
      state: { schemaVersion: 0, quizType: 'main', currentStepId: 'COMMON.Q2', answers: { socialEnergy: 'high' }, visitedStepIds: ['COMMON.Q1'] },
    })));
    await page.reload();
    await expect(page.getByText(/Тест с тех пор обновился/)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Как у тебя сегодня с социальной батарейкой?');
  });

  test('кнопка «назад» браузера возвращает на прошлый вопрос', async ({ page }) => {
    await page.goto('/quiz');
    await pick(page, 'Хочу людей и движухи');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Как у тебя сегодня с социальной батарейкой?');
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Кого берём с собой в это маленькое приключение?');
  });

  test('семья + прогулка за город: все условные экраны в нужном порядке; запрос уходит без ответов в URL', async ({ page }) => {
    let posted: unknown;
    await page.route('**/api/quiz/complete', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionToken: 'tok' }) });
    });
    await page.goto('/quiz');
    await pick(page, 'Только свои, пожалуйста');
    await pick(page, 'С семьёй / с детьми');
    await pick(page, 'Как же хорошо отдохнул');
    await pick(page, 'На улицу, хочу свежего воздуха');
    await pick(page, 'Прогуляться и сменить картинку');
    await pick(page, 'Сбежать за город');
    await pick(page, 'В черте города, без долгой дороги');
    await pick(page, 'В ближайшие выходные');
    await pick(page, 'До 3 000 ₽');
    await pick(page, 'На человека');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сколько всего человек?');
    await page.screenshot({ path: 'test-results/quiz-party.png', fullPage: true });
    await page.getByRole('button', { name: 'Больше' }).click();
    await page.getByRole('button', { name: 'Дальше' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Какого возраста дети?');
    await pick(page, '4–6');
    await page.getByRole('button', { name: 'Дальше' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Как будем добираться?');
    await pick(page, 'На машине');
    await page.waitForURL(/\/results\?session=tok$/);
    expect(JSON.stringify(posted)).toContain('"childAgeBands":["4-6"]');
    expect(page.url()).not.toContain('childAge');
  });

  test('ошибка сети при выдаче: «Повторить»', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/quiz/complete', async (route) => {
      calls++;
      if (calls === 1) return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionToken: 'tok2' }) });
    });
    await page.goto('/quiz');
    for (const l of ['Сам пока не понимаю', 'Я сегодня сам по себе', 'Как же хорошо отдохнул', 'Никуда не пойду, хочу дома', 'Игровой', 'Почти никаких', 'Сегодня', 'Бесплатно']) await pick(page, l);
    await expect(page.locator('.k-notice[role=alert]')).toContainText('Нет соединения');
    await page.getByRole('button', { name: 'Повторить' }).click();
    await page.waitForURL(/session=tok2/);
  });
});
