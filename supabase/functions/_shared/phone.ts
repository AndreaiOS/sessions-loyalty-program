export function normalizePhone(raw: string, defaultCountryCode = "+44") {
  const cleaned = raw.trim().replace(/[\s()-]/g, "");
  if (!cleaned) return null;

  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  if (cleaned.startsWith("00")) {
    return `+${cleaned.slice(2)}`;
  }

  const digitsOnly = cleaned.replace(/\D/g, "");
  if (!digitsOnly) return null;

  if (digitsOnly.startsWith("0")) {
    return `${defaultCountryCode}${digitsOnly.slice(1)}`;
  }

  return `${defaultCountryCode}${digitsOnly}`;
}

export async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
