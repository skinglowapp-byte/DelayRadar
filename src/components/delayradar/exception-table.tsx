import type { ExceptionRow } from "@/src/lib/data/types";
import { cn } from "@/src/lib/utils";

import {
  toneClass,
  triageLabel,
  workflowLabel,
  workflowTone,
} from "./helpers";

export function ExceptionTable({
  rows,
  compact = false,
  selectedId,
  onSelect,
  noMovementThresholdHours = 72,
}: {
  rows: ExceptionRow[];
  compact?: boolean;
  selectedId?: string;
  onSelect?: (id: string) => void;
  noMovementThresholdHours?: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        No exception shipments yet. Once Shopify fulfillments and tracking webhooks
        start arriving, this inbox will rank them by urgency and customer action
        required.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Status</th>
            <th>Tracking</th>
            {!compact ? <th>Action</th> : null}
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                !compact && selectedId === row.id && "table-row-active",
                compact && onSelect && "table-row-clickable",
              )}
              onClick={compact && onSelect ? () => onSelect(row.id) : undefined}
            >
              <td>
                {compact || !onSelect ? (
                  <strong>{row.orderName}</strong>
                ) : (
                  <button
                    className="table-link"
                    type="button"
                    aria-pressed={selectedId === row.id}
                    onClick={() => onSelect(row.id)}
                  >
                    {row.orderName}
                  </button>
                )}
                <div className="microcopy">{row.customerName}</div>
                <div className="microcopy">
                  {row.lastCheckpointAt} ·{" "}
                  {triageLabel(row.triageBucket, noMovementThresholdHours)}
                </div>
              </td>
              <td>
                <span className={cn("pill", toneClass(row.severity))}>
                  {row.exceptionType}
                </span>
                <div className="microcopy">{row.statusLabel}</div>
              </td>
              <td>
                <div>{row.carrier}</div>
                <div className="mono microcopy">{row.trackingNumber}</div>
              </td>
              {!compact ? <td>{row.recommendedAction}</td> : null}
              <td>
                <strong>{row.riskScore}</strong>
                <div className="microcopy">
                  Carrier {row.carrierRiskScore} · {row.priorityLabel} priority
                </div>
                {row.workflowState !== "open" ? (
                  <span
                    className={cn(
                      "pill",
                      toneClass(workflowTone(row.workflowState)),
                    )}
                  >
                    {workflowLabel(row.workflowState)}
                  </span>
                ) : null}
                {row.assignedTo ? (
                  <div className="microcopy">{row.assignedTo}</div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
