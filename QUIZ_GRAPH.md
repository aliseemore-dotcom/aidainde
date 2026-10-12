# QUIZ_GRAPH — граф основного теста (`quizType=main`, `schemaVersion=1`)

Источник истины — конфиг `src/features/quiz/config/*.ts`; этот файл его описывает. Тексты вопросов и ответов — дословно из спецификации §5–§7. Любое изменение графа = изменение конфига + тестов + этого файла + `QUIZ_SCHEMA_VERSION`.

```text
Q1 → Q2 → Q3 → Q4 ─┬─ home ───────────────→ HOME.H1 → H2 ────────────┐
                    └─ outside|indoor|any → DIRECTION                 │
   DIRECTION ─ walks    → WALKS.W1 → W2 ──────────────────────────────┤
             ─ venues   → VENUES.V1 → V2 ─────────────────────────────┤
             ─ games    → GAMES.G1 ─ mind     → G2_MIND ─┐            │
                                   ─ physical → G2_PHYSICAL ┤→ G3 ────┤
                                   ─ digital  → G2_DIGITAL ─┤         │
                                   ─ social   → G2_SOCIAL ──┤         │
                                   ─ surprise ──────────────┘         │
             ─ culture  → CULTURE.C1 → C2 ────────────────────────────┤
             ─ wellness → WELLNESS.R1 → R2 ───────────────────────────┤
                                                                      ▼
 DATE → [DATE_PICKER] → BUDGET → [BASIS] → [PARTY_SIZE] → [CHILD_AGES] → [TRANSPORT] → RESULTS
```

## Шаги и условия

| Шаг | Пишет в | Тип | Условие показа |
|---|---|---|---|
| `COMMON.Q1` | `socialEnergy` | single | всегда |
| `COMMON.Q2` | `companion` | single | всегда |
| `COMMON.Q3` | `mood` | single | всегда |
| `COMMON.Q4` | `setting` | single | всегда; `home` → `BRANCH.HOME.H1` |
| `COMMON.DIRECTION` | `direction` | single (меню ≤ 4, «показать все» = 5) | `setting ≠ home` |
| `BRANCH.WALKS.W1/W2` | `branchAnswers.W1/W2` | single | `direction=walks` |
| `BRANCH.VENUES.V1/V2` | `branchAnswers.V1/V2` | single | `direction=venues` |
| `BRANCH.GAMES.G1` | `branchAnswers.G1` | single | `direction=games` |
| `BRANCH.GAMES.G2_MIND/PHYSICAL/DIGITAL/SOCIAL` | `branchAnswers.G2_*` | single | по значению `G1` (`surprise` пропускает G2) |
| `BRANCH.GAMES.G3` | `branchAnswers.G3` | single | всегда в ветке games |
| `BRANCH.CULTURE.C1/C2` | `branchAnswers.C1/C2` | single | `direction=culture` |
| `BRANCH.WELLNESS.R1/R2` | `branchAnswers.R1/R2` | single | `direction=wellness` |
| `BRANCH.HOME.H1/H2` | `branchAnswers.H1/H2` | single | `setting=home` |
| `COMMON.DATE` | `dayChoice` | single | всегда |
| `COMMON.DATE_PICKER` | `targetDate` | date | `dayChoice=date` |
| `COMMON.BUDGET` | `budgetTier` | single | всегда |
| `COMMON.BASIS` | `budgetBasis` | single | `companion≠solo` и `budgetTier∉{free,any}` (D-05) |
| `COMMON.PARTY_SIZE` | `partySize` | number | `companion∈{group,family}` (3–30 / 2–30) |
| `COMMON.CHILD_AGES` | `childAgeBands` | multi | `companion=family` |
| `COMMON.TRANSPORT` | `transport` | single | `W1=escape` или `W2=outskirts` |
| `RESULTS` | — | terminal | — |

## Направления (`direction.ts`)
Баллы: `outside` walks+5; `indoor` venues/games/culture/wellness +2; энергия high/medium/low и настроение — по таблице §5. Сортировка по баллам, затем tie-break `games, venues, walks, culture, wellness`. Скрытие по условиям — D-02.

## Инварианты (проверяются тестами)
1. ID шагов глобально уникальны; значения опций уникальны внутри шага; у выбора ≥ 2 опций.
2. Граф ацикличен; все шаги достижимы; единственный сток — `RESULTS`.
3. `next` — чистая функция валидных ответов; результат всегда ∈ `nextCandidates`.
4. Смена ответа шага удаляет ответы всех последующих шагов старого пути.
5. Состояние сериализуемо; восстановление черновика перепроверяется воспроизведением пути.
6. Выведенные значения (`finalizeAnswers`) не являются ответами пользователя.
