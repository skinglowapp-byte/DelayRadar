import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { DelayRadarApp } from "@/src/components/delayradar-app";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function IndexRoute() {
  return <DelayRadarApp initialShop="" initialHost="" />;
}
