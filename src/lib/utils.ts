export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function titleize(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatRelativeTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Not yet";
  }

  const target = value instanceof Date ? value : new Date(value);
  const deltaMs = Date.now() - target.getTime();
  const deltaSeconds = Math.round(Math.abs(deltaMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (deltaSeconds < 60) {
    return rtf.format(Math.round(-deltaMs / 1000), "second");
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);

  if (deltaMinutes < 60) {
    return rtf.format(Math.round(-deltaMs / 60000), "minute");
  }

  const deltaHours = Math.round(deltaMinutes / 60);

  if (deltaHours < 24) {
    return rtf.format(Math.round(-deltaMs / 3600000), "hour");
  }

  const deltaDays = Math.round(deltaHours / 24);

  if (deltaDays < 30) {
    return rtf.format(Math.round(-deltaMs / 86400000), "day");
  }

  const deltaMonths = Math.round(deltaDays / 30);

  if (deltaMonths < 12) {
    return rtf.format(Math.round(-deltaDays / 30), "month");
  }

  return rtf.format(Math.round(-deltaDays / 365), "year");
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value instanceof Date ? value : new Date(value));
}

export function formatCurrency(value: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(value);
}

export function interpolateTemplate(
  template: string,
  variables: Record<string, string | null | undefined>,
) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => {
    const replacement = variables[key];
    return replacement?.trim() ? replacement : "";
  });
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function toHtmlBody(text: string) {
  return `<p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>`;
}

export function safeJsonParse<T>(value: string) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Constant-time string comparison for secrets (cron tokens, etc.). Returns
 * false for length mismatches without leaking timing information.
 */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verify a `Bearer <secret>` Authorization header against CRON_SECRET in
 * constant time. Fails closed when the secret is unset.
 */
export function isAuthorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return safeEqual(header, expected);
}
