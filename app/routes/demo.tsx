import { DelayRadarApp } from "@/src/components/delayradar-app";

export function meta() {
  return [
    { title: "DelayRadar — live demo" },
    {
      name: "description",
      content:
        "Explore a read-only DelayRadar dashboard with sample delivery exceptions.",
    },
  ];
}

// Read-only preview backed by mock data (shop=demo-shop.myshopify.com resolves
// to the demo dataset in the bootstrap loader). No auth required.
export default function DemoRoute() {
  return (
    <DelayRadarApp initialShop="demo-shop.myshopify.com" initialHost="" />
  );
}
