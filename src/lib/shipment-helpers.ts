export const DEFAULT_NO_MOVEMENT_THRESHOLD_HOURS = 72;

export function checkpointDate(shipment: {
  latestCheckpointAt: Date | null;
  updatedAt: Date;
}) {
  return shipment.latestCheckpointAt ?? shipment.updatedAt;
}

export function noMovementRiskScore(
  ageHours: number,
  noMovementThresholdHours: number,
) {
  if (ageHours >= noMovementThresholdHours + 48) {
    return 84;
  }

  if (ageHours >= noMovementThresholdHours + 24) {
    return 72;
  }

  return 58;
}
