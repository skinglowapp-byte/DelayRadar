import type { LinksFunction } from "react-router";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import stylesheet from "./globals.css?url";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://cdn.shopify.com/" },
  {
    rel: "stylesheet",
    href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css",
  },
  { rel: "stylesheet", href: stylesheet },
];

// App Bridge is injected by AppProvider on the embedded /app routes; the
// public landing page must not load it (it errors without a shop context).
export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
