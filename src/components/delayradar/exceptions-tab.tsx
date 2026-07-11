import type { ExceptionRow } from "@/src/lib/data/types";
import { cn } from "@/src/lib/utils";

import { ExceptionTable } from "./exception-table";

export function ExceptionsTab({
  filteredExceptions,
  triageFilter,
  onTriageFilterChange,
  triageCounts,
  exceptionSearch,
  onExceptionSearchChange,
  severityFilter,
  onSeverityFilterChange,
  actionFilter,
  onActionFilterChange,
  carrierFilter,
  onCarrierFilterChange,
  carrierOptions,
  exceptionTypeFilter,
  onExceptionTypeFilterChange,
  exceptionTypeOptions,
  workflowFilter,
  onWorkflowFilterChange,
  selectedExceptionId,
  onSelectException,
  noMovementThresholdHours,
}: {
  filteredExceptions: ExceptionRow[];
  triageFilter: string;
  onTriageFilterChange: (value: string) => void;
  triageCounts: { fresh: number; aging: number; stale: number };
  exceptionSearch: string;
  onExceptionSearchChange: (value: string) => void;
  severityFilter: string;
  onSeverityFilterChange: (value: string) => void;
  actionFilter: string;
  onActionFilterChange: (value: string) => void;
  carrierFilter: string;
  onCarrierFilterChange: (value: string) => void;
  carrierOptions: string[];
  exceptionTypeFilter: string;
  onExceptionTypeFilterChange: (value: string) => void;
  exceptionTypeOptions: string[];
  workflowFilter: string;
  onWorkflowFilterChange: (value: string) => void;
  selectedExceptionId: string;
  onSelectException: (id: string) => void;
  noMovementThresholdHours: number;
}) {
  return (
    <>
      <div className="toolbar">
        <div>
          <h2 className="section-title">Exceptions inbox</h2>
        </div>
        <span className="pill warn">
          {filteredExceptions.length} matching exceptions
        </span>
      </div>
      <div className="triage-row">
        <button
          className={cn(
            "nav-chip",
            triageFilter === "all" && "active",
          )}
          type="button"
          onClick={() => onTriageFilterChange("all")}
        >
          Any time
        </button>
        <button
          className={cn(
            "nav-chip",
            triageFilter === "fresh" && "active",
          )}
          type="button"
          onClick={() => onTriageFilterChange("fresh")}
        >
          &lt;24h ({triageCounts.fresh})
        </button>
        <button
          className={cn(
            "nav-chip",
            triageFilter === "aging" && "active",
          )}
          type="button"
          onClick={() => onTriageFilterChange("aging")}
        >
          1-3 days ({triageCounts.aging})
        </button>
        <button
          className={cn(
            "nav-chip",
            triageFilter === "stale" && "active",
          )}
          type="button"
          onClick={() => onTriageFilterChange("stale")}
        >
          3+ days ({triageCounts.stale})
        </button>
      </div>
      <div className="filter-grid">
        <label className="field">
          <span className="field-label">Search</span>
          <input
            className="input"
            type="search"
            placeholder="Order, customer, tracking"
            value={exceptionSearch}
            onChange={(event) =>
              onExceptionSearchChange(event.target.value)
            }
          />
        </label>
        <label className="field">
          <span className="field-label">Severity</span>
          <select
            className="select"
            value={severityFilter}
            onChange={(event) =>
              onSeverityFilterChange(event.target.value)
            }
          >
            <option value="all">All severities</option>
            <option value="bad">High risk</option>
            <option value="warn">Medium risk</option>
            <option value="good">Low risk</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Customer action</span>
          <select
            className="select"
            value={actionFilter}
            onChange={(event) =>
              onActionFilterChange(event.target.value)
            }
          >
            <option value="all">All shipments</option>
            <option value="needs-action">
              Action needed
            </option>
            <option value="monitoring">Monitoring only</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Carrier</span>
          <select
            className="select"
            value={carrierFilter}
            onChange={(event) =>
              onCarrierFilterChange(event.target.value)
            }
          >
            <option value="all">All carriers</option>
            {carrierOptions.map((carrier) => (
              <option key={carrier} value={carrier}>
                {carrier}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Exception type</span>
          <select
            className="select"
            value={exceptionTypeFilter}
            onChange={(event) =>
              onExceptionTypeFilterChange(event.target.value)
            }
          >
            <option value="all">All exception types</option>
            {exceptionTypeOptions.map((exceptionType) => (
              <option key={exceptionType} value={exceptionType}>
                {exceptionType}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Workflow state</span>
          <select
            className="select"
            value={workflowFilter}
            onChange={(event) =>
              onWorkflowFilterChange(event.target.value)
            }
          >
            <option value="all">All states</option>
            <option value="open">Open</option>
            <option value="snoozed">Snoozed</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
      </div>
      <ExceptionTable
        rows={filteredExceptions}
        selectedId={selectedExceptionId}
        onSelect={onSelectException}
        noMovementThresholdHours={noMovementThresholdHours}
      />
    </>
  );
}
