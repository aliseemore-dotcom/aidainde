import {
  boolean, date, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text,
  timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const contentStatus = pgEnum('content_status', ['draft', 'published', 'cancelled', 'sold_out', 'archived']);
export const indoorOutdoor = pgEnum('indoor_outdoor', ['indoor', 'outdoor', 'both', 'unknown']);
export const priceUnit = pgEnum('price_unit', ['per_person', 'total', 'unknown']);
export const contentType = pgEnum('content_type', ['place', 'event', 'activity']);
export const tagGroup = pgEnum('tag_group', [
  'category', 'mood', 'energy', 'company', 'format', 'setting', 'accessibility', 'physicalLoad', 'gameStyle', 'competitionMode',
]);
export const rightsStatus = pgEnum('rights_status', ['owned', 'licensed', 'permission', 'unknown']);
export const adminRole = pgEnum('admin_role', ['editor', 'admin']);
export const occurrenceStatus = pgEnum('occurrence_status', ['published', 'cancelled', 'sold_out']);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const stamps = {
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
};

/** Общие поля, нужные движку рекомендаций (G-01: isDemo во всех контентных таблицах). */
const shared = {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: contentStatus('status').notNull().default('draft'),
  isDemo: boolean('is_demo').notNull().default(false),
  publishedAt: ts('published_at'),
  ...stamps,
};

export const places = pgTable('places', {
  ...shared,
  /** тип места (ресторан, музей…): значения — features/catalog/place-kinds.ts; null = не указан */
  kind: text('kind'),
  address: text('address').notNull(),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  district: text('district'),
  contactsJson: jsonb('contacts_json').$type<{ phone?: string; email?: string; social?: string }>(),
  websiteUrl: text('website_url'),
  bookingUrl: text('booking_url'),
  openingHoursJson: jsonb('opening_hours_json').$type<Record<string, string>>(),
  priceMin: integer('price_min'),
  priceMax: integer('price_max'),
  priceCurrency: text('price_currency').notNull().default('RUB'),
  priceUnit: priceUnit('price_unit').notNull().default('unknown'),
  ageMin: integer('age_min'),
  ageMax: integer('age_max'),
  minParticipants: integer('min_participants'),
  maxParticipants: integer('max_participants'),
  soloFriendly: boolean('solo_friendly'),
  joinOpenGroup: boolean('join_open_group'),
  requiresBooking: boolean('requires_booking'),
  indoorOutdoor: indoorOutdoor('indoor_outdoor').notNull().default('unknown'),
  durationMinutes: integer('duration_minutes'),
  sourceUrl: text('source_url').notNull(),
  verifiedAt: ts('verified_at'),
}, (t) => [uniqueIndex('places_slug_uq').on(t.slug), index('places_status_idx').on(t.status)]);

export const events = pgTable('events', {
  ...shared,
  placeId: uuid('place_id').references(() => places.id, { onDelete: 'set null' }),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at'),
  timezone: text('timezone').notNull().default('Europe/Moscow'),
  priceMin: integer('price_min'),
  priceMax: integer('price_max'),
  priceUnit: priceUnit('price_unit').notNull().default('unknown'),
  ticketsUrl: text('tickets_url'),
  capacity: integer('capacity'),
  ageMin: integer('age_min'),
  ageMax: integer('age_max'),
  /** null = наследуется от площадки */
  indoorOutdoor: indoorOutdoor('indoor_outdoor'),
  soloFriendly: boolean('solo_friendly'),
  joinOpenGroup: boolean('join_open_group'),
  requiresBooking: boolean('requires_booking'),
  sourceUrl: text('source_url').notNull(),
  verifiedAt: ts('verified_at'),
  /** логическая дата истечения актуальности записи */
  expiresAt: ts('expires_at'),
}, (t) => [uniqueIndex('events_slug_uq').on(t.slug), index('events_starts_idx').on(t.startsAt), index('events_status_idx').on(t.status)]);

/** Дополнительные сеансы повторяющегося мероприятия (G-07). */
export const eventOccurrences = pgTable('event_occurrences', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at'),
  status: occurrenceStatus('status').notNull().default('published'),
  ticketsUrl: text('tickets_url'),
}, (t) => [index('occ_event_idx').on(t.eventId), index('occ_starts_idx').on(t.startsAt)]);

export const activities = pgTable('activities', {
  ...shared,
  /** простой текст с абзацами и списками «- »; рендерится без HTML (нет XSS) */
  stepsRichText: text('steps_rich_text'),
  durationMinutes: integer('duration_minutes'),
  costMin: integer('cost_min'),
  costMax: integer('cost_max'),
  requiredMaterialsJson: jsonb('required_materials_json').$type<string[]>(),
  minParticipants: integer('min_participants'),
  maxParticipants: integer('max_participants'),
  ageMin: integer('age_min'),
  ageMax: integer('age_max'),
  sourceUrl: text('source_url'),
}, (t) => [uniqueIndex('activities_slug_uq').on(t.slug), index('activities_status_idx').on(t.status)]);

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  key: text('key').notNull(),
  label: text('label').notNull(),
  group: tagGroup('group').notNull(),
}, (t) => [uniqueIndex('tags_key_uq').on(t.key)]);

export const contentTags = pgTable('content_tags', {
  contentType: contentType('content_type').notNull(),
  contentId: uuid('content_id').notNull(),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.contentType, t.contentId, t.tagId] }), index('content_tags_content_idx').on(t.contentType, t.contentId)]);

export const media = pgTable('media', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  contentType: contentType('content_type').notNull(),
  contentId: uuid('content_id').notNull(),
  url: text('url').notNull(),
  alt: text('alt').notNull(),
  order: integer('order').notNull().default(0),
  rightsStatus: rightsStatus('rights_status').notNull().default('unknown'),
}, (t) => [index('media_content_idx').on(t.contentType, t.contentId)]);

export const quizSessions = pgTable('quiz_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  publicTokenHash: text('public_token_hash').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  quizType: text('quiz_type').notNull(),
  answersJson: jsonb('answers_json').notNull(),
  /** диапазон дат, зафиксированный в момент выдачи (today/tomorrow/weekend считаются на сервере) */
  resolvedRangeJson: jsonb('resolved_range_json').$type<{ from: string; to: string }>().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
}, (t) => [uniqueIndex('quiz_sessions_token_uq').on(t.publicTokenHash), index('quiz_sessions_expires_idx').on(t.expiresAt)]);

export const recommendationLogs = pgTable('recommendation_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid('session_id').notNull().references(() => quizSessions.id, { onDelete: 'cascade' }),
  contentType: contentType('content_type').notNull(),
  contentId: uuid('content_id').notNull(),
  score: integer('score').notNull(),
  reasonCodes: jsonb('reason_codes').$type<string[]>().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const adminUsers = pgTable('admin_users', {
  userId: uuid('user_id').primaryKey(),
  role: adminRole('role').notNull().default('editor'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/** Журнал изменений каталога (§11: «лог изменений»). */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: uuid('admin_user_id').notNull(),
  action: text('action').notNull(),
  contentType: contentType('content_type'),
  contentId: uuid('content_id'),
  diffJson: jsonb('diff_json'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/** Агрегированные счётчики без персональных данных: день (по Казани) + ключ -> количество. */
export const metricsDaily = pgTable('metrics_daily', {
  day: date('day', { mode: 'string' }).notNull(),
  key: text('key').notNull(),
  n: integer('n').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.day, t.key] })]);
