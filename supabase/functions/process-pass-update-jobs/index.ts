import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/db.ts";
import { badRequest, ok, serverError, unauthorized } from "../_shared/http.ts";
import { requireInternalApiKey } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return badRequest("method_not_allowed");
  }

  if (!requireInternalApiKey(req)) {
    return unauthorized();
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: jobs, error: jobsError } = await supabase
    .from("pass_update_jobs")
    .select("id, customer_id, venue_id, reason, payload, attempts")
    .eq("status", "queued")
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(50);

  if (jobsError) {
    return serverError(jobsError.message);
  }

  let sent = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    try {
      await supabase
        .from("pass_update_jobs")
        .update({ status: "processing", attempts: Number(job.attempts ?? 0) + 1 })
        .eq("id", job.id);

      // MVP placeholder: mark as sent so queue behavior is testable.
      // Replace this block with provider API calls for Apple PassKit and Google Wallet Objects.
      await supabase
        .from("pass_update_jobs")
        .update({ status: "sent", last_error: null, next_attempt_at: now })
        .eq("id", job.id);

      sent += 1;
    } catch (error) {
      const nextAttempt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await supabase
        .from("pass_update_jobs")
        .update({
          status: "failed",
          last_error: (error as Error).message,
          next_attempt_at: nextAttempt,
        })
        .eq("id", job.id);

      failed += 1;
    }
  }

  return ok({ processed: (jobs ?? []).length, sent, failed });
});
