import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { DelayRadarApp } from "@/src/components/delayradar-app";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  return {
    shop: url.searchParams.get("shop") ?? "",
    host: url.searchParams.get("host") ?? "",
  };
};

export default function EmbeddedAppIndexRoute() {
  const { shop, host } = useLoaderData<typeof loader>();

  return <DelayRadarApp initialShop={shop} initialHost={host} />;
}
