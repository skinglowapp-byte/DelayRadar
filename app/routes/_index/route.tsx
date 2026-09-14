import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { MarketingLanding } from "@/src/components/marketing-landing";
import { absoluteUrl, SITE_NAME } from "@/src/lib/seo";

export const links = () => [
  { rel: "canonical", href: absoluteUrl("/") },
];

export function meta() {
  const title = `${SITE_NAME} | Shopify Post-Purchase Recovery App`;
  const description =
    "ReturnSense helps Shopify brands prevent avoidable returns by recovering delivery exceptions before they become refunds, tickets, or chargebacks.";

  return [
    { title },
    {
      name: "description",
      content: description,
    },
    { name: "robots", content: "index,follow" },
    {
      name: "keywords",
      content:
        "Shopify post-purchase recovery, delivery exception recovery, returns prevention, carrier lane intelligence, Shopify refund prevention",
    },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: absoluteUrl("/") },
    { property: "og:site_name", content: SITE_NAME },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
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
