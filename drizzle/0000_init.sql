CREATE TYPE "public"."admin_role" AS ENUM('editor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'published', 'cancelled', 'sold_out', 'archived');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('place', 'event', 'activity');--> statement-breakpoint
CREATE TYPE "public"."indoor_outdoor" AS ENUM('indoor', 'outdoor', 'both', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."occurrence_status" AS ENUM('published', 'cancelled', 'sold_out');--> statement-breakpoint
CREATE TYPE "public"."price_unit" AS ENUM('per_person', 'total', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."rights_status" AS ENUM('owned', 'licensed', 'permission', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."tag_group" AS ENUM('category', 'mood', 'energy', 'company', 'format', 'setting', 'accessibility', 'physicalLoad', 'gameStyle', 'competitionMode');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"steps_rich_text" text,
	"duration_minutes" integer,
	"cost_min" integer,
	"cost_max" integer,
	"required_materials_json" jsonb,
	"min_participants" integer,
	"max_participants" integer,
	"age_min" integer,
	"age_max" integer,
	"source_url" text
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "admin_role" DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"content_type" "content_type",
	"content_id" uuid,
	"diff_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_tags" (
	"content_type" "content_type" NOT NULL,
	"content_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "content_tags_content_type_content_id_tag_id_pk" PRIMARY KEY("content_type","content_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "event_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"status" "occurrence_status" DEFAULT 'published' NOT NULL,
	"tickets_url" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"place_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"price_min" integer,
	"price_max" integer,
	"price_unit" "price_unit" DEFAULT 'unknown' NOT NULL,
	"tickets_url" text,
	"capacity" integer,
	"age_min" integer,
	"age_max" integer,
	"indoor_outdoor" "indoor_outdoor",
	"solo_friendly" boolean,
	"join_open_group" boolean,
	"requires_booking" boolean,
	"source_url" text NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" "content_type" NOT NULL,
	"content_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"rights_status" "rights_status" DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"address" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"district" text,
	"contacts_json" jsonb,
	"website_url" text,
	"booking_url" text,
	"opening_hours_json" jsonb,
	"price_min" integer,
	"price_max" integer,
	"price_currency" text DEFAULT 'RUB' NOT NULL,
	"price_unit" "price_unit" DEFAULT 'unknown' NOT NULL,
	"age_min" integer,
	"age_max" integer,
	"min_participants" integer,
	"max_participants" integer,
	"solo_friendly" boolean,
	"join_open_group" boolean,
	"requires_booking" boolean,
	"indoor_outdoor" "indoor_outdoor" DEFAULT 'unknown' NOT NULL,
	"duration_minutes" integer,
	"source_url" text NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quiz_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token_hash" text NOT NULL,
	"schema_version" integer NOT NULL,
	"quiz_type" text NOT NULL,
	"answers_json" jsonb NOT NULL,
	"resolved_range_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"content_type" "content_type" NOT NULL,
	"content_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"reason_codes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"group" "tag_group" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_occurrences" ADD CONSTRAINT "event_occurrences_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_logs" ADD CONSTRAINT "recommendation_logs_session_id_quiz_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."quiz_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activities_slug_uq" ON "activities" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "activities_status_idx" ON "activities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_tags_content_idx" ON "content_tags" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "occ_event_idx" ON "event_occurrences" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "occ_starts_idx" ON "event_occurrences" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_uq" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_starts_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "media_content_idx" ON "media" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "places_slug_uq" ON "places" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "places_status_idx" ON "places" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_sessions_token_uq" ON "quiz_sessions" USING btree ("public_token_hash");--> statement-breakpoint
CREATE INDEX "quiz_sessions_expires_idx" ON "quiz_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_key_uq" ON "tags" USING btree ("key");