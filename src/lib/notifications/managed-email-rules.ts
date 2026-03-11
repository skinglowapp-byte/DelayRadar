import { ExceptionType } from "@prisma/client";

export const managedEmailRules = [
  {
    triggerType: ExceptionType.DELAYED,
    label: "Delayed shipment",
  },
  {
    triggerType: ExceptionType.FAILED_DELIVERY,
    label: "Failed delivery",
  },
  {
    triggerType: ExceptionType.ADDRESS_ISSUE,
    label: "Address issue",
  },
  {
    triggerType: ExceptionType.AVAILABLE_FOR_PICKUP,
    label: "Available for pickup",
  },
] as const;

export const managedEmailRuleTypes = managedEmailRules.map(
  (rule) => rule.triggerType,
);
