import { corsHeaders } from "./cors.ts";

export function withCors(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function ok(body: Record<string, unknown>) {
  return withCors(200, body);
}

export function badRequest(message: string) {
  return withCors(400, { error: message });
}

export function unauthorized(message = "unauthorized") {
  return withCors(401, { error: message });
}

export function forbidden(message = "forbidden") {
  return withCors(403, { error: message });
}

export function notFound(message = "not_found") {
  return withCors(404, { error: message });
}

export function serverError(message = "internal_error") {
  return withCors(500, { error: message });
}

export async function parseJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
