import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/_index/route.tsx"),
  route("auth/login", "routes/auth.login/route.tsx"),
  route("auth/*", "routes/auth.$.tsx"),
  route("app", "routes/app.tsx", [
    index("routes/app._index.tsx"),
  ]),
  route("api/*", "routes/api.$.ts"),
  route("demo", "routes/demo.tsx"),
  route("favicon.ico", "routes/favicon.ico.ts"),
  route("llms.txt", "routes/llms.txt.ts"),
  route("privacy", "routes/privacy.tsx"),
  route("robots.txt", "routes/robots.txt.ts"),
  route("sitemap.xml", "routes/sitemap.xml.ts"),
  route("terms", "routes/terms.tsx"),
  route("support", "routes/support.tsx"),
] satisfies RouteConfig;
