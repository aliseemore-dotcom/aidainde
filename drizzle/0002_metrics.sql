CREATE TABLE "metrics_daily" (
	"day" date NOT NULL,
	"key" text NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "metrics_daily_day_key_pk" PRIMARY KEY("day","key")
);
