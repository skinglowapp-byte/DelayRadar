import type {
  AppBootstrap,
  ExceptionDetail,
  TemplateRow,
  WorkflowStateLabel,
} from "@/src/lib/data/types";
import { isActionNeededTriggerType } from "@/src/lib/notifications/message-mode";
import { getShopifySessionToken } from "@/src/lib/shopify/app-bridge-client";
import { interpolateTemplate, titleize } from "@/src/lib/utils";

export const DEMO_SHOP_DOMAIN = "demo-shop.myshopify.com";

export async function readJson<T>(input: RequestInfo, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const sessionToken = await getShopifySessionToken();

  if (sessionToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function toneClass(value: string) {
  switch (value) {
    case "good":
      return "good";
    case "warn":
      return "warn";
    case "bad":
      return "bad";
    default:
      return "muted";
  }
}

export function riskTone(riskScore: number) {
  if (riskScore >= 75) {
    return "bad";
  }

  if (riskScore >= 35) {
    return "warn";
  }

  return "good";
}

export function notificationTone(status: string) {
  switch (status.toLowerCase()) {
    case "sent":
      return "good";
    case "failed":
      return "bad";
    case "pending":
      return "warn";
    default:
      return "muted";
  }
}

export function triageTone(value: string) {
  switch (value) {
    case "stale":
      return "bad";
    case "aging":
      return "warn";
    default:
      return "good";
  }
}

export function priorityTone(value: string) {
  switch (value) {
    case "VIP":
      return "bad";
    case "High Value":
    case "Express":
      return "warn";
    default:
      return "muted";
  }
}

export function formatThresholdInput(cents: number) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

export function formatHourWindow(hours: number) {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  return `${hours} hours`;
}

export function triageLabel(value: string, noMovementThresholdHours: number) {
  const thresholdLabel = formatHourWindow(noMovementThresholdHours);

  switch (value) {
    case "stale":
      return `${thresholdLabel}+`;
    case "aging":
      return `24 hours-${thresholdLabel}`;
    default:
      return "<24h";
  }
}

export function toRuleState(
  rules: AppBootstrap["settings"]["emailRules"],
): Record<string, boolean> {
  return Object.fromEntries(
    rules.map((rule) => [rule.triggerType, rule.active]),
  );
}

export function emailRuleDescription(triggerType: string) {
  switch (triggerType) {
    case "DELAYED":
      return "Auto-send a delay update when a shipment is delayed in transit.";
    case "FAILED_DELIVERY":
      return "Auto-send when the carrier could not complete delivery.";
    case "ADDRESS_ISSUE":
      return "Auto-send when the carrier needs address confirmation.";
    case "AVAILABLE_FOR_PICKUP":
      return "Auto-send pickup reminders before the hold window expires.";
    default:
      return "Auto-send proactive customer email updates.";
  }
}

export function slackRuleDescription(triggerType: string) {
  switch (triggerType) {
    case "FAILED_DELIVERY":
      return "Alert the team when a carrier fails delivery and support likely needs to step in.";
    case "ADDRESS_ISSUE":
      return "Alert the team when the shipment is blocked on address confirmation.";
    case "LOST_IN_TRANSIT":
      return "Escalate likely lost parcels into Slack for refund or resend review.";
    case "RETURN_TO_SENDER":
      return "Alert when the carrier has started sending the parcel back upstream.";
    default:
      return "Alert the team for this exception type in Slack.";
  }
}

export function messageModeLabel(triggerType: string) {
  return isActionNeededTriggerType(triggerType) ? "Action needed" : "FYI";
}

export function messageModeTone(triggerType: string) {
  return isActionNeededTriggerType(triggerType) ? "warn" : "good";
}

export function messageModeDescription(triggerType: string) {
  switch (triggerType) {
    case "FAILED_DELIVERY":
      return "Ask the customer to confirm the next delivery step so the carrier can try again.";
    case "ADDRESS_ISSUE":
      return "Request address confirmation before the shipment can move again.";
    case "AVAILABLE_FOR_PICKUP":
      return "Prompt the customer to collect the parcel before the pickup hold expires.";
    case "RETURN_TO_SENDER":
      return "Flag that support intervention is likely needed before the shipment can be recovered.";
    case "LOST_IN_TRANSIT":
      return "Set expectations while support decides whether to resend, refund, or wait.";
    case "DELAYED":
      return "Keep the customer informed without asking them to do anything yet.";
    default:
      return "Share a proactive shipment update without creating unnecessary urgency.";
  }
}

export function workflowTone(state: WorkflowStateLabel) {
  switch (state) {
    case "resolved":
      return "good";
    case "snoozed":
      return "warn";
    default:
      return "muted";
  }
}

export function workflowLabel(state: WorkflowStateLabel) {
  switch (state) {
    case "resolved":
      return "Resolved";
    case "snoozed":
      return "Snoozed";
    default:
      return "Open";
  }
}

export function snoozePresets() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const in3Days = new Date(now);
  in3Days.setDate(in3Days.getDate() + 3);
  in3Days.setHours(9, 0, 0, 0);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(9, 0, 0, 0);

  return [
    { label: "Tomorrow 9 AM", value: tomorrow.toISOString() },
    { label: "3 days", value: in3Days.toISOString() },
    { label: "1 week", value: nextWeek.toISOString() },
  ];
}

export function recommendationTone(action: string) {
  switch (action) {
    case "RESEND":
    case "REFUND":
    case "REPLACEMENT_REVIEW":
      return "bad";
    case "CONTACT_CUSTOMER":
    case "CARRIER_TRACE":
      return "warn";
    default:
      return "muted";
  }
}

export function recommendationActionLabel(action: string) {
  switch (action) {
    case "RESEND":
      return "Resend";
    case "REFUND":
      return "Refund";
    case "WAIT":
      return "Wait";
    case "CONTACT_CUSTOMER":
      return "Contact";
    case "CARRIER_TRACE":
      return "Trace";
    case "REPLACEMENT_REVIEW":
      return "Replace/Refund";
    default:
      return action;
  }
}

export function confidenceTone(confidence: string) {
  switch (confidence) {
    case "high":
      return "good";
    case "medium":
      return "warn";
    default:
      return "muted";
  }
}

export function pickTemplate(payload: AppBootstrap, currentTemplateId: string) {
  return (
    payload.templates.find((entry) => entry.id === currentTemplateId) ??
    payload.templates[0] ??
    null
  );
}

export function pickManualTemplateId(
  detail: ExceptionDetail | null,
  templates: TemplateRow[],
) {
  if (!detail || templates.length === 0) {
    return "";
  }

  const exactMatch = templates.find(
    (template) => titleize(template.triggerType) === detail.exceptionType,
  );

  if (exactMatch) {
    return exactMatch.id;
  }

  if (detail.exceptionType === "No Tracking Movement") {
    const delayedTemplate = templates.find(
      (template) => template.triggerType === "DELAYED",
    );

    if (delayedTemplate) {
      return delayedTemplate.id;
    }
  }

  return templates[0]?.id ?? "";
}

export function previewShipmentTemplate(
  detail: ExceptionDetail | null,
  template: TemplateRow | null,
) {
  if (!detail || !template) {
    return null;
  }

  const variables = {
    customer_first_name: detail.customerName.split(" ")[0] ?? "there",
    order_name: detail.orderName,
    tracking_number: detail.trackingNumber,
    carrier_name: detail.carrier,
    latest_status: detail.exceptionType,
  };

  return {
    subject:
      interpolateTemplate(template.subject || template.name, variables) ||
      template.name,
    body: interpolateTemplate(template.body, variables),
  };
}

export function previewTemplateDraft(template: TemplateRow | null) {
  if (!template) {
    return null;
  }

  const variables = {
    customer_first_name: "Jordan",
    order_name: "#1045",
    tracking_number: "EZ6000000006",
    carrier_name: "USPS",
    latest_status: titleize(
      template.triggerType === "OTHER" ? "DELAYED" : template.triggerType,
    ),
  };

  return {
    subject:
      interpolateTemplate(template.subject || template.name, variables) ||
      template.name,
    body: interpolateTemplate(template.body, variables),
  };
}
