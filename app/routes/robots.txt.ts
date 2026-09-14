import { SITE_URL } from "@/src/lib/seo";

export const loader = () =>
  new Response(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /app",
      "Disallow: /api",
      "Disallow: /auth",
      "",
      `Sitemap: ${SITE_URL}/sitemap.xml`,
    ].join("\n"),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );

