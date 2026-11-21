import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/** Chỉ dùng phía server (API route / cron). Dùng service role key. */
export function getAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY • 缺少 Supabase 环境变量');
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
