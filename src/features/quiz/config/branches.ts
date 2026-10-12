import type { Option, StepDef } from '../types';

const o = (value: string, label: string): Option => ({ value, label });
const DATE = 'COMMON.DATE';

/** Single-choice branch step; every option leads to `to` unless `route` is given. */
function q(
  id: string, title: string, options: Option[],
  to: string | { route: (v: string) => string; candidates: string[] },
): StepDef {
  const local = id.split('.').pop()!;
  const route = typeof to === 'string' ? () => to : to.route;
  return {
    id, kind: 'single', title, options, required: true,
    writesTo: `branchAnswers.${local}`,
    next: (a) => route(a.branchAnswers?.[local] ?? ''),
    nextCandidates: typeof to === 'string' ? [to] : to.candidates,
  };
}

const G = 'BRANCH.GAMES.';

export const branchSteps: StepDef[] = [
  // WALKS
  q('BRANCH.WALKS.W1', 'Какую прогулку сегодня заслуживаем?', [
    o('scenic', 'Без спешки, кофе и красивые виды'),
    o('explore', 'Исследовать незнакомые места'),
    o('active', 'Побольше движения'),
    o('escape', 'Сбежать за город'),
  ], 'BRANCH.WALKS.W2'),
  q('BRANCH.WALKS.W2', 'А насколько далеко готовы забраться?', [
    o('near', 'В черте города, без долгой дороги'),
    o('city', 'По всему городу — легко'),
    o('outskirts', 'За город тоже можно'),
  ], DATE),

  // VENUES
  q('BRANCH.VENUES.V1', 'Мы уже в заведении. Что там происходит?', [
    o('food_talk', 'Едим вкусное и болтаем'),
    o('play', 'Смеёмся, играем, соревнуемся'),
    o('music', 'Музыка, люди, движ'),
    o('quiet', 'Тихо, уютно, атмосферно'),
    o('unusual', 'Пробуем что-то необычное'),
  ], 'BRANCH.VENUES.V2'),
  q('BRANCH.VENUES.V2', 'На сколько энергии рассчитываем?', [
    o('sit', 'Хочется преимущественно сидеть'),
    o('some', 'Можно немного подвигаться'),
    o('active', 'Готовы вставать из-за стола'),
  ], DATE),

  // GAMES
  q(`${G}G1`, 'Ну что, во что сегодня ввяжемся?', [
    o('mind', 'Хочу пошевелить мозгами'),
    o('physical', 'Хочу двигаться и побеждать'),
    o('digital', 'В другой мир, пожалуйста'),
    o('social', 'Главное — посмеяться'),
    o('surprise', 'Удивите меня!'),
  ], {
    route: (v) => ({
      mind: `${G}G2_MIND`, physical: `${G}G2_PHYSICAL`, digital: `${G}G2_DIGITAL`,
      social: `${G}G2_SOCIAL`, surprise: `${G}G3`,
    }[v] ?? `${G}G3`),
    candidates: [`${G}G2_MIND`, `${G}G2_PHYSICAL`, `${G}G2_DIGITAL`, `${G}G2_SOCIAL`, `${G}G3`],
  }),
  q(`${G}G2_MIND`, 'Как будем разминать мозг?', [
    o('quiz', 'Квизы и вопросы'), o('escape', 'Загадки и квесты'),
    o('strategy', 'Стратегии и настолки'), o('any', 'Неважно'),
  ], `${G}G3`),
  q(`${G}G2_PHYSICAL`, 'Насколько активно?', [
    o('light', 'Без спортивных подвигов'), o('medium', 'Движение в удовольствие'),
    o('high', 'Хочу выложиться'),
  ], `${G}G3`),
  q(`${G}G2_DIGITAL`, 'Что больше цепляет?', [
    o('vr', 'VR и виртуальные приключения'), o('arcade', 'Аркады и игровые автоматы'),
    o('console', 'Консоли и видеоигры'), o('any', 'Без разницы'),
  ], `${G}G3`),
  q(`${G}G2_SOCIAL`, 'Что сделает вечер?', [
    o('boardgames', 'Настолки и разговоры'), o('party', 'Командные игры и смех'),
    o('performance', 'Караоке и интерактив'), o('any', 'Всего понемногу'),
  ], `${G}G3`),
  q(`${G}G3`, 'Сегодня всерьёз соревнуемся?', [
    o('competitive', 'Да, хочу победить!'), o('friendly', 'Немного азарта, без напряжения'),
    o('cooperative', 'Лучше вместе против задачи'), o('any', 'Главное — хорошо провести время'),
  ], DATE),

  // CULTURE
  q('BRANCH.CULTURE.C1', 'Чем сегодня хочется удивить мозг?', [
    o('visual', 'Красивым — искусство и архитектура'),
    o('story', 'Историями — театр, кино, лекции'),
    o('make', 'Хочу что-нибудь создать сам'),
    o('unusual', 'Чем-то совсем неожиданным'),
  ], 'BRANCH.CULTURE.C2'),
  q('BRANCH.CULTURE.C2', 'Как хочется участвовать?', [
    o('watch', 'Смотреть и слушать'), o('participate', 'Делать самому'), o('any', 'Не принципиально'),
  ], DATE),

  // WELLNESS
  q('BRANCH.WELLNESS.R1', 'Как будем перезагружаться?', [
    o('body', 'Расслабить тело'), o('cozy', 'Уют, напиток и никакой спешки'),
    o('mind', 'Тихое культурное занятие'), o('light', 'Немного движения без суеты'),
  ], 'BRANCH.WELLNESS.R2'),
  q('BRANCH.WELLNESS.R2', 'Сколько общения хочется?', [
    o('minimal', 'Минимум разговоров'), o('close', 'Можно со своими'), o('any', 'Как получится'),
  ], DATE),

  // HOME
  q('BRANCH.HOME.H1', 'Сегодня остаёмся дома — какой вечер устроим?', [
    o('games', 'Игровой'), o('cook', 'Кулинарный'), o('create', 'Творческий'), o('cozy', 'Максимально уютный'),
  ], 'BRANCH.HOME.H2'),
  q('BRANCH.HOME.H2', 'Сколько сил готовы вложить?', [
    o('minimal', 'Почти никаких'), o('some', 'Немного подготовиться можно'),
    o('project', 'Хочется целый мини-проект'),
  ], DATE),
];
