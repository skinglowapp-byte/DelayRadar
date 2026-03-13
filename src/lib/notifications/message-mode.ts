const actionNeededTriggerTypes = new Set([
  "FAILED_DELIVERY",
  "ADDRESS_ISSUE",
  "AVAILABLE_FOR_PICKUP",
  "RETURN_TO_SENDER",
]);

export function isActionNeededTriggerType(triggerType: string) {
  return actionNeededTriggerTypes.has(triggerType);
}
