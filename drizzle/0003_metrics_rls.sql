-- Счётчики недоступны напрямую через Supabase API (RLS без политик).
ALTER TABLE "metrics_daily" ENABLE ROW LEVEL SECURITY;
