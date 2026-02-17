import { readRawBody } from "./read-body.js";

function edgeBaseUrl() {
  if (process.env.SUPABASE_FUNCTIONS_URL) {
    return process.env.SUPABASE_FUNCTIONS_URL.replace(/\/$/, "");
  }
  if (!process.env.SUPABASE_URL) {
    throw new Error("SUPABASE_FUNCTIONS_URL or SUPABASE_URL must be configured");
  }
  return `${process.env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1`;
}

function copyHeader(req, headers, name) {
  const value = req.headers[name];
  if (value) {
    headers.set(name, Array.isArray(value) ? value.join(",") : value);
  }
}

export function proxyToEdge(functionName) {
  return async function handler(req, res) {
    const method = req.method || "POST";

    if (method === "OPTIONS") {
      res.status(200).end("ok");
      return;
    }

    try {
      const url = `${edgeBaseUrl()}/${functionName}`;
      const rawBody = method === "GET" ? undefined : await readRawBody(req);

      const headers = new Headers();
      headers.set("content-type", req.headers["content-type"] || "application/json");
      copyHeader(req, headers, "authorization");
      copyHeader(req, headers, "x-kiosk-secret");
      copyHeader(req, headers, "x-idempotency-key");
      copyHeader(req, headers, "x-internal-api-key");
      copyHeader(req, headers, "stripe-signature");

      const response = await fetch(url, {
        method,
        headers,
        body: rawBody,
      });

      const responseBody = await response.text();
      res.status(response.status);
      const contentType = response.headers.get("content-type") || "application/json";
      res.setHeader("content-type", contentType);
      res.send(responseBody);
    } catch (error) {
      res.status(500).json({ error: (error).message || "proxy_error" });
    }
  };
}
