import { formatCurrency } from "@/src/lib/utils";

type ShipmentPriorityInput = {
  baseRiskScore: number;
  orderValueCents: number | null | undefined;
  orderTags: string | null | undefined;
  shippingMethodLabel: string | null | undefined;
  priorityOrderValueThresholdCents: number;
  vipTagPattern: string | null | undefined;
  currencyCode: string | null | undefined;
};

export type ShipmentPrioritySummary = {
  effectiveRiskScore: number;
  priorityLabel: string;
  priorityReasons: string[];
  isVip: boolean;
  isHighValue: boolean;
  isExpedited: boolean;
};

function parseTagList(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function parseVipPatterns(value: string | null | undefined) {
  if (!value) {
    return ["vip"];
  }

  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isExpeditedShippingMethod(label: string | null | undefined) {
  if (!label) {
    return false;
  }

  return /express|priority|overnight|next day|2-day|2 day|expedited/i.test(
    label,
  );
}

function clampRisk(value: number) {
  return Math.max(0, Math.min(99, Math.round(value)));
}

export function evaluateShipmentPriority(
  input: ShipmentPriorityInput,
): ShipmentPrioritySummary {
  const tags = parseTagList(input.orderTags);
  const vipPatterns = parseVipPatterns(input.vipTagPattern);
  const isVip = vipPatterns.some((pattern) =>
    tags.some((tag) => tag === pattern || tag.includes(pattern)),
  );
  const isHighValue =
    typeof input.orderValueCents === "number" &&
    input.orderValueCents >= input.priorityOrderValueThresholdCents;
  const isExpedited = isExpeditedShippingMethod(input.shippingMethodLabel);
  const priorityReasons: string[] = [];
  let effectiveRiskScore = input.baseRiskScore;

  if (isVip) {
    effectiveRiskScore += 18;
    priorityReasons.push(
      `VIP tag matched ${parseVipPatterns(input.vipTagPattern)
        .map((pattern) => `"${pattern}"`)
        .join(", ")}.`,
    );
  }

  if (isHighValue && typeof input.orderValueCents === "number") {
    effectiveRiskScore += 12;
    priorityReasons.push(
      `Order value ${formatCurrency(
        input.orderValueCents / 100,
        input.currencyCode ?? "USD",
      )} exceeds the ${formatCurrency(
        input.priorityOrderValueThresholdCents / 100,
        input.currencyCode ?? "USD",
      )} priority threshold.`,
    );
  }

  if (isExpedited) {
    effectiveRiskScore += 8;
    priorityReasons.push(
      `Shipping method "${input.shippingMethodLabel}" indicates an expedited order.`,
    );
  }

  return {
    effectiveRiskScore: clampRisk(effectiveRiskScore),
    priorityLabel: isVip
      ? "VIP"
      : isHighValue
        ? "High Value"
        : isExpedited
          ? "Express"
          : "Standard",
    priorityReasons,
    isVip,
    isHighValue,
    isExpedited,
  };
}
