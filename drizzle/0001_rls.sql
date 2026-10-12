-- Прямой доступ к таблицам через Supabase API (роли anon / authenticated) закрыт полностью:
-- RLS включён, политик нет. Приложение ходит в БД только с сервера под ролью владельца,
-- а публичные данные отдаёт через собственные API с фильтром status='published'.
ALTER TABLE "places" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "event_occurrences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "content_tags" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "quiz_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "recommendation_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "admin_users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
