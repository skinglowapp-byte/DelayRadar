type CookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "lax" | "strict" | "none" | boolean;
  secure?: boolean;
};

function normalizeSameSite(value: CookieOptions["sameSite"]) {
  if (typeof value !== "string") {
    return value ? "Lax" : null;
  }

  const lower = value.toLowerCase();

  if (lower === "strict") {
    return "Strict";
  }

  if (lower === "none") {
    return "None";
  }

  return "Lax";
}

function serializeCookie(name: string, value: string, options: CookieOptions = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }

  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  const sameSite = normalizeSameSite(options.sameSite);

  if (sameSite) {
    parts.push(`SameSite=${sameSite}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

class ResponseCookies {
  constructor(private readonly headers: Headers) {}

  set(name: string, value: string, options: CookieOptions = {}) {
    this.headers.append("Set-Cookie", serializeCookie(name, value, options));
  }
}

export class NextResponse extends Response {
  readonly cookies: ResponseCookies;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body, init);
    this.cookies = new ResponseCookies(this.headers);
  }

  static json(data: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers,
    });
  }

  static redirect(url: string | URL, init?: number | ResponseInit) {
    const status = typeof init === "number" ? init : (init?.status ?? 302);
    const headers = new Headers(typeof init === "number" ? undefined : init?.headers);
    headers.set("Location", typeof url === "string" ? url : url.toString());

    return new NextResponse(null, {
      ...(typeof init === "number" ? undefined : init),
      status,
      headers,
    });
  }

  static next() {
    return new NextResponse(null);
  }
}
