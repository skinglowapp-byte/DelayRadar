import { interpolateTemplate, titleize } from "@/src/lib/utils";

type ShipmentTemplateInput = {
  customerName: string | null;
  shopifyOrderName: string | null;
  trackingNumber: string;
  trackingCarrier: string | null;
  latestExceptionType: string | null;
};

type TemplateInput = {
  name: string;
  subject: string | null;
  body: string;
};

export function shipmentTemplateVariables(
  shipment: ShipmentTemplateInput,
): Record<string, string> {
  return {
    customer_first_name: shipment.customerName?.split(" ")[0] ?? "there",
    order_name: shipment.shopifyOrderName ?? shipment.trackingNumber,
    tracking_number: shipment.trackingNumber,
    carrier_name: shipment.trackingCarrier ?? "the carrier",
    latest_status: titleize(shipment.latestExceptionType ?? "OTHER"),
  };
}

export function renderShipmentTemplate(
  shipment: ShipmentTemplateInput,
  template: TemplateInput,
) {
  const variables = shipmentTemplateVariables(shipment);

  return {
    subject:
      interpolateTemplate(template.subject ?? template.name, variables) ||
      template.name,
    body: interpolateTemplate(template.body, variables),
  };
}
