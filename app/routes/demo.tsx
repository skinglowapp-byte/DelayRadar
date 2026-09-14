import { ReturnSenseApp } from "@/src/components/delayradar-app";

export function meta() {
  return [
    { title: "ReturnSense — live demo" },
    {
      name: "description",
      content:
        "Explore a read-only ReturnSense dashboard with sample delivery exceptions and returns-prevention workflows.",
    },
    { name: "robots", content: "noindex,follow" },
  ];
}

// Read-only preview backed by mock data (shop=demo-shop.myshopify.com resolves
// to the demo dataset in the bootstrap loader). No auth required.
export default function DemoRoute() {
  return (
    <ReturnSenseApp initialShop="demo-shop.myshopify.com" initialHost="" />
  );
}
