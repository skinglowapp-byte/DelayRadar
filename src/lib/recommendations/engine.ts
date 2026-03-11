export type RecommendationAction =
  | "RESEND"
  | "REFUND"
  | "WAIT"
  | "CONTACT_CUSTOMER"
  | "CARRIER_TRACE"
  | "REPLACEMENT_REVIEW";

export type RecommendationConfidence = "high" | "medium" | "low";

export type RecommendationVerdict = {
  action: RecommendationAction;
  label: string;
  reasoning: string[];
  confidence: RecommendationConfidence;
  automatable: boolean;
};

export type RecommendationInput = {
  exceptionType: string;
  ageHours: number;
  riskScore: number;
  orderValueCents: number | null;
  isVip: boolean;
  isHighValue: boolean;
  customerAction: boolean;
  deliveryAttempts: number;
  noMovementThresholdHours: number;
  lostInTransitThresholdHours: number;
  hasPromisedDeliveryDate: boolean;
  promisedDeliveryPassed: boolean;
};

function verdict(
  action: RecommendationAction,
  label: string,
  reasoning: string[],
  confidence: RecommendationConfidence,
  automatable = false,
): RecommendationVerdict {
  return { action, label, reasoning, confidence, automatable };
}

export function evaluateRecommendation(
  input: RecommendationInput,
): RecommendationVerdict {
  const {
    exceptionType,
    ageHours,
    riskScore,
    isVip,
    isHighValue,
    customerAction,
    deliveryAttempts,
    noMovementThresholdHours,
    lostInTransitThresholdHours,
    hasPromisedDeliveryDate,
    promisedDeliveryPassed,
  } = input;

  const isNoMovement =
    exceptionType === "No Tracking Movement" ||
    exceptionType === "NO_TRACKING_MOVEMENT";

  // Rule 1: Lost in transit or severe no-movement past lost threshold
  if (
    exceptionType === "LOST_IN_TRANSIT" ||
    exceptionType === "Lost In Transit" ||
    (isNoMovement && ageHours >= lostInTransitThresholdHours)
  ) {
    if (isVip || isHighValue) {
      return verdict(
        "RESEND",
        "Recommend resend for VIP/high-value order",
        [
          `Shipment classified as lost or no movement for ${Math.round(ageHours)} hours.`,
          isVip
            ? "VIP customer — prioritize retention with immediate resend."
            : "High-value order — resend minimizes revenue risk.",
          `Risk score ${riskScore} confirms high urgency.`,
        ],
        "high",
      );
    }

    return verdict(
      "REFUND",
      "Recommend refund review",
      [
        `Shipment classified as lost or no movement for ${Math.round(ageHours)} hours.`,
        "Standard order — refund is the most cost-effective resolution.",
        `Risk score ${riskScore} confirms high urgency.`,
      ],
      "high",
    );
  }

  // Rule 2: Return to sender
  if (
    exceptionType === "RETURN_TO_SENDER" ||
    exceptionType === "Return To Sender"
  ) {
    return verdict(
      "REPLACEMENT_REVIEW",
      "Review replacement or refund",
      [
        "Carrier has initiated return to sender.",
        "Evaluate whether to reship to corrected address or issue a refund.",
        customerAction
          ? "Customer action was requested before the return started."
          : "No prior customer contact recorded.",
      ],
      "high",
    );
  }

  // Rule 3: Failed delivery with 2+ attempts
  if (
    (exceptionType === "FAILED_DELIVERY" ||
      exceptionType === "Failed Delivery") &&
    deliveryAttempts >= 2
  ) {
    return verdict(
      "CONTACT_CUSTOMER",
      "Contact customer — multiple failed deliveries",
      [
        `${deliveryAttempts} delivery attempts have failed.`,
        "Customer needs to confirm address or arrange alternative delivery.",
        "Automated outreach is appropriate at this stage.",
      ],
      "high",
      true,
    );
  }

  // Rule 4: Failed delivery with 1 attempt — wait 24h then escalate
  if (
    exceptionType === "FAILED_DELIVERY" ||
    exceptionType === "Failed Delivery"
  ) {
    if (ageHours < 24) {
      return verdict(
        "WAIT",
        "Wait for carrier retry",
        [
          "First delivery attempt failed less than 24 hours ago.",
          "Most carriers will retry within the next business day.",
          "Escalate if no movement after 24 hours.",
        ],
        "medium",
      );
    }

    return verdict(
      "CONTACT_CUSTOMER",
      "Contact customer after failed delivery",
      [
        "Delivery failed over 24 hours ago with no retry.",
        "Customer should confirm address or schedule redelivery.",
      ],
      "high",
      true,
    );
  }

  // Rule 5: Address issue
  if (
    exceptionType === "ADDRESS_ISSUE" ||
    exceptionType === "Address Issue"
  ) {
    return verdict(
      "CONTACT_CUSTOMER",
      "Request address confirmation",
      [
        "Carrier flagged an address issue blocking delivery.",
        "Customer needs to verify or correct shipping address.",
        "Automated outreach is appropriate.",
      ],
      "high",
      true,
    );
  }

  // Rule 6: No movement past threshold but not yet lost
  if (isNoMovement && ageHours >= noMovementThresholdHours) {
    return verdict(
      "CARRIER_TRACE",
      "Open carrier trace",
      [
        `No carrier scan for ${Math.round(ageHours)} hours, past the ${noMovementThresholdHours}-hour threshold.`,
        "File a carrier trace to locate the shipment.",
        "Send customer a proactive delay update.",
      ],
      "medium",
    );
  }

  // Rule 7: Available for pickup
  if (
    exceptionType === "AVAILABLE_FOR_PICKUP" ||
    exceptionType === "Available For Pickup"
  ) {
    return verdict(
      "CONTACT_CUSTOMER",
      "Send pickup reminder",
      [
        "Package is waiting at pickup point.",
        "Customer should be reminded before the hold window expires.",
      ],
      "medium",
      true,
    );
  }

  // Rule 8: Delayed with promised delivery passed
  if (
    (exceptionType === "DELAYED" || exceptionType === "Delayed") &&
    hasPromisedDeliveryDate &&
    promisedDeliveryPassed
  ) {
    return verdict(
      "CONTACT_CUSTOMER",
      "Notify customer of missed delivery date",
      [
        "Promised delivery date has passed.",
        "Customer should be informed proactively.",
        riskScore >= 60
          ? "High risk score — consider offering compensation."
          : "Moderate risk — a courtesy update is appropriate.",
      ],
      "medium",
    );
  }

  // Rule 9: Delayed without promise breach
  if (exceptionType === "DELAYED" || exceptionType === "Delayed") {
    return verdict(
      "WAIT",
      "Monitor and keep customer informed",
      [
        "Shipment is delayed but still within expected delivery window.",
        "Keep the customer informed without over-escalating.",
        "Escalate if the delay extends past the promised date or movement stalls.",
      ],
      "low",
    );
  }

  // Default: wait
  return verdict(
    "WAIT",
    "Monitor carrier updates",
    [
      "No immediate action required based on current exception signals.",
      "Continue monitoring for the next carrier update.",
    ],
    "low",
  );
}
