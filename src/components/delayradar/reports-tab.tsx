import type {
  CarrierLaneInsight,
  CarrierReportRow,
} from "@/src/lib/data/types";
import { cn } from "@/src/lib/utils";

import { toneClass } from "./helpers";

export function ReportsTab({
  carrierReport,
  carrierLaneInsights,
}: {
  carrierReport: CarrierReportRow[];
  carrierLaneInsights: CarrierLaneInsight[];
}) {
  const worst = carrierReport.find((row) => row.exceptionRate > 15);

  return (
    <>
      <div className="toolbar">
        <div>
          <span className="eyebrow">Lane intelligence</span>
          <h2 className="section-title">Carrier routes to watch</h2>
        </div>
        <span className="pill muted">
          Last 30 days
        </span>
      </div>
      {carrierLaneInsights.length > 0 ? (
        <div className="lane-grid">
          {carrierLaneInsights.map((lane) => (
            <div className="lane-card" key={lane.id}>
              <div className="split-inline">
                <div className="stack tight">
                  <strong>{lane.laneLabel}</strong>
                  <span className="microcopy">
                    {lane.shipmentCount} shipments · {lane.exceptionCount} exceptions
                  </span>
                </div>
                <span className={cn("pill", toneClass(lane.tone))}>
                  {lane.exceptionRate}% exceptions
                </span>
              </div>
              <div className="lane-meter" aria-hidden="true">
                <span style={{ width: `${Math.min(lane.exceptionRate, 100)}%` }} />
              </div>
              <div className="lane-stat-row">
                <span>Avg risk {lane.avgRiskScore}</span>
                <span>{lane.noMovementCount} scan gaps</span>
                <span>{lane.highPriorityCount} priority</span>
              </div>
              <p className="microcopy">{lane.recommendation}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          Lane intelligence appears once ReturnSense has enough recent shipments
          to compare carrier and service-level outcomes.
        </div>
      )}
      <div className="toolbar">
        <div>
          <span className="eyebrow">Carrier performance</span>
          <h2 className="section-title">Exception reporting</h2>
        </div>
        <span className="pill muted">
          {carrierReport.length} carriers tracked
        </span>
      </div>
      {carrierReport.length > 0 ? (
        <>
          {worst ? (
            <div className="callout">
              <strong>
                {worst.carrier} has a {worst.exceptionRate}% exception rate
              </strong>
              <p className="microcopy">
                Top exception type: {worst.topExceptionType}.
                {worst.lostInTransitCount > 0
                  ? ` ${worst.lostInTransitCount} shipments classified as lost in transit.`
                  : ""}
                {" "}Consider reviewing carrier SLAs for this lane.
              </p>
            </div>
          ) : null}
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Carrier</th>
                  <th>Shipments</th>
                  <th>Exceptions</th>
                  <th>Rate</th>
                  <th>Avg risk</th>
                  <th>Top type</th>
                  <th>Lost</th>
                  <th>Avg resolution</th>
                </tr>
              </thead>
              <tbody>
                {carrierReport.map((row) => (
                  <tr key={row.carrier}>
                    <td>
                      <strong>{row.carrier}</strong>
                    </td>
                    <td>{row.totalShipments}</td>
                    <td>{row.exceptionCount}</td>
                    <td>
                      <span
                        className={cn(
                          "pill",
                          toneClass(
                            row.exceptionRate > 20
                              ? "bad"
                              : row.exceptionRate > 10
                                ? "warn"
                                : "good",
                          ),
                        )}
                      >
                        {row.exceptionRate}%
                      </span>
                    </td>
                    <td>{row.avgRiskScore}</td>
                    <td>{row.topExceptionType}</td>
                    <td>
                      {row.lostInTransitCount > 0 ? (
                        <span className="pill bad">
                          {row.lostInTransitCount}
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td>
                      {row.avgResolutionHours !== null
                        ? `${row.avgResolutionHours}h`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty-state">
          No carrier data yet. Carrier reports populate once
          tracked shipments and exceptions start flowing through
          ReturnSense.
        </div>
      )}
    </>
  );
}
