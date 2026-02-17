import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { env } from "./env.ts";

export function createServiceClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
