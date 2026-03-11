import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/_index/route.tsx"),
  route("auth/login", "routes/auth.login/route.tsx"),
  route("auth/*", "routes/auth.$.tsx"),
  route("app", "routes/app.tsx", [
    index("routes/app._index.tsx"),
  ]),
  route("api/*", "routes/api.$.ts"),
] satisfies RouteConfig;
