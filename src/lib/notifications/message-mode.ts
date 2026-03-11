import { ExceptionType } from "@prisma/client";

const actionNeededTriggerTypes = new Set<ExceptionType>([
  ExceptionType.FAILED_DELIVERY,
  ExceptionType.ADDRESS_ISSUE,
  ExceptionType.AVAILABLE_FOR_PICKUP,
  ExceptionType.RETURN_TO_SENDER,
]);

export function isActionNeededTriggerType(triggerType: string) {
  return actionNeededTriggerTypes.has(triggerType as ExceptionType);
}
