import { ExceptionType } from "@prisma/client";

export const managedSlackRules = [
  {
    triggerType: ExceptionType.FAILED_DELIVERY,
    label: "Failed delivery",
  },
  {
    triggerType: ExceptionType.ADDRESS_ISSUE,
    label: "Address issue",
  },
  {
    triggerType: ExceptionType.LOST_IN_TRANSIT,
    label: "Lost in transit",
  },
  {
    triggerType: ExceptionType.RETURN_TO_SENDER,
    label: "Return to sender",
  },
] as const;

export const managedSlackRuleTypes = managedSlackRules.map(
  (rule) => rule.triggerType,
);
