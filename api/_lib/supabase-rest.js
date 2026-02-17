function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const SUPABASE_URL = () => requireEnv("SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = () => requireEnv("SUPABASE_SERVICE_ROLE_KEY");

export async function supabaseRest(path, { method = "GET", body, headers = {} } = {}) {
  const url = `${SUPABASE_URL()}/rest/v1/${path}`;
  const requestHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY(),
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY()}`,
    ...headers,
  };

  if (body !== undefined) {
    requestHeaders["content-type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase REST error (${response.status}): ${text}`);
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
