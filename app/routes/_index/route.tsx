import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { MarketingLanding } from "@/src/components/marketing-landing";

export function meta() {
  return [
    { title: "DelayRadar — Delivery exception recovery for Shopify" },
    {
      name: "description",
      content:
        "Keep your tracking app. DelayRadar handles the deliveries that fail — it catches delays, failed attempts, and lost packages, contacts the customer before they contact you, and tells your team what to do next. For Shopify stores shipping 200–5,000 orders/month.",
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
