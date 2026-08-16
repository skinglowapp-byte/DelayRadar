import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate, MONTHLY_PLAN } from "../shopify.server";

const isTestBilling = process.env.NODE_ENV !== "production";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);

  await billing.require({
    plans: [MONTHLY_PLAN],
    isTest: isTestBilling,
    onFailure: async () =>
      billing.request({ plan: MONTHLY_PLAN, isTest: isTestBilling }),
  });

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export default function AppRoute() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
