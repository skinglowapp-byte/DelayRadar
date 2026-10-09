export const SITE_URL = "https://www.returnsenseapp.com";
export const SITE_NAME = "ReturnSense";
export const SUPPORT_EMAIL = "support@returnsenseapp.com";

export const publicRoutes = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
] as const;

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}
