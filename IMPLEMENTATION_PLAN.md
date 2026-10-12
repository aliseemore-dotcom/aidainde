# IMPLEMENTATION_PLAN — «Куда сегодня?»

Продуктовые требования не меняются: источник истины — `CLAUDE_CODE_SPEC.md`. Отклонения и пробелы — в `DECISIONS.md`; граф теста — в `QUIZ_GRAPH.md`.

## 1. Что за продукт (в двух строках)
Мобильно-первичный сайт: человек отвечает на 8–14 вопросов (настроение, компания, место, направление, дата, бюджет) и получает детерминированную подборку реальных мест, событий и домашних идей Казани из собственного каталога. Параллельно есть свободный каталог `/explore` и админка для ручного наполнения. AI в MVP нет.

## 2. Слои и границы

```text
UI (Next.js App Router, Tailwind, shadcn/ui)   ← дизайн подключается сюда, логики не содержит
 │   components/quiz, components/catalog, app/(public)/*, app/admin/*
 ▼
Фичи — чистый TypeScript, без React и без IO
 │   features/quiz     config → graph → state → schema (Zod)   [ГОТОВО, проверено]
 │                     eligibility (жёсткие фильтры) → scoring (баллы 0–100) → fallback → reasons
 │   features/catalog  queries / validators / types
 ▼
API (route handlers, Zod на входе, единый envelope ошибок, rate limit)
 │   /api/quiz/complete, /api/results/:token, /api/catalog, /api/{places,events,activities}/:slug, /api/admin/*
 ▼
Данные: PostgreSQL (Supabase) + Drizzle ORM; Supabase Auth только для админов
     lib/date-kazan (Europe/Moscow, серверное время), lib/errors, lib/security, lib/env
```

Правила, которые держат архитектуру:
1. **Вся бизнес-логика теста — в `features/quiz`**, не в React. UI получает `QuizState` и вызывает `answerStep` / `goBack`; ветвление не дублируется в компонентах.
2. **Одна схема на клиенте и сервере.** Zod-схемы строятся из того же конфига; `POST /api/quiz/complete` делает `validateComplete` → `finalizeAnswers` → движок.
3. **Движок рекомендаций — чистые функции** `(answers, now, catalog) → results`. Время приходит аргументом (тесты полуночи и выходных без моков).
4. **Ответы не попадают в URL**; результаты — по непрозрачному токену, в БД хранится хэш.
5. **Контент не выдумывается.** Seed только с `isDemo=true`; production исключает demo.
6. **`/date` изолирован:** своя схема (`quizType=date`), общего состояния с `main` нет.

## 3. Карта репозитория (целевая)
Структура §12 спецификации без изменений. Сейчас создано:
```text
aidainde/
  IMPLEMENTATION_PLAN.md  QUIZ_GRAPH.md  DECISIONS.md
  src/features/quiz/{types,graph,direction,schema,state}.ts
  src/features/quiz/config/{common,branches,index}.ts
  src/tests/unit/graph.test.ts
```
Ветки теста собраны в одном `branches.ts` (вместо 6 файлов) — они однотипны и считаются одним помощником `q()`; при росте легко разнести (**отклонение от §12, не влияет на контракт**).

## 4. Этапы и критерии приёмки

| Этап | Содержание | Приёмка |
|---|---|---|
| **Sprint 0 — каркас** | Next.js + Tailwind + shadcn/ui, ESLint/Prettier, Drizzle + миграции, `.env.example`, дизайн-токены, CI (typecheck, lint, test, build), preview на Vercel | typecheck/lint/build зелёные |
| **Sprint 1 — тест** *(ядро готово)* | **Готово:** конфиг, граф, state machine, Zod, 26 тестов, 400 комбинаций. **Осталось:** UI `QuizShell`/`QuestionCard`/`Progress`, черновик в storage с TTL, фокус и клавиатура, back/forward браузера | 400 комбинаций без тупиков ✔; e2e «назад с G2_MIND на G1» |
| **Sprint 2 — каталог и админ** | Схема БД (с поправками G-01…G-04), CRUD, публикация/черновики, медиа с `rightsStatus`, карточки, фильтры `/explore`, RBAC | анонимы не видят draft и admin; сущности реально сохраняются |
| **Sprint 3 — выдача** | `date-kazan`, `eligibility`, `tag-map`, `scoring`, fallback, «Почему подходит», `/results`, `quiz_sessions` | сценарии §14; стабильна на пустом каталоге |
| **Sprint 4 — финал** | Контент, SEO/OG, sitemap, a11y-проход, мониторинг, приватная аналитика | путь на production-домене; demo не показывается |

Дизайн подключается в Sprint 0–1 поверх готовых хуков состояния и токенов: компоненты получают данные пропсами и не знают о графе.

## 5. Вопросы к владельцу продукта (не блокируют Sprint 0)
1. D-01: закрыто — проект вынесен в отдельный репозиторий `aidainde`.
2. D-06: 14 экранов в самом длинном пути против «максимум 11» — допустимо или сокращать?
3. D-02: какие направления считать «строго indoor» при выборе «На улицу»?
4. D-05: пропускать вопрос «на человека/на всех» при бюджете «Бесплатно»/«Неважно»?
5. Откуда брать первые достоверные данные каталога (≥ 50 мест) и кто их верифицирует?
