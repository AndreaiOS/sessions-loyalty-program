function edgeBaseUrl() {
  if (process.env.SUPABASE_FUNCTIONS_URL) {
    return process.env.SUPABASE_FUNCTIONS_URL.replace(/\/$/, "");
  }

  if (!process.env.SUPABASE_URL) {
    throw new Error("SUPABASE_FUNCTIONS_URL/SUPABASE_URL missing");
  }

  return `${process.env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1`;
}

export async function invokeEdge(functionName, payload, { headers = {} } = {}) {
  const response = await fetch(`${edgeBaseUrl()}/${functionName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload ?? {}),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    data: parsed,
  };
}
