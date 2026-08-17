import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { MarketingLanding } from "@/src/components/marketing-landing";

export function meta() {
  return [
    { title: "DelayRadar — Delivery exception monitoring for Shopify" },
    {
      name: "description",
      content:
        "DelayRadar catches delivery delays, failed deliveries, and lost packages before they become WISMO tickets. For Shopify stores shipping 200–5,000 orders/month. $19.99/mo with a 7-day free trial.",
    },
  ];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function IndexRoute() {
  return <MarketingLanding />;
}
