import type {
  BackfillStatus,
  CarrierCoverage,
  MonitoredShipmentRow,
} from "@/src/lib/data/types";
import { cn } from "@/src/lib/utils";

import { toneClass } from "./helpers";

export function CarrierCoverageBanner({ coverage }: { coverage: CarrierCoverage }) {
  if (!coverage.hasShipments) {
    return null;
  }

  const supportedNames = coverage.entries
    .filter((entry) => entry.supported)
    .slice(0, 6)
    .map((entry) => entry.carrier);
  const unsupportedNames = coverage.unsupportedCarriers.slice(0, 6);

  if (unsupportedNames.length === 0) {
    return (
      <div className="callout">
        <strong>Carrier coverage</strong>
        <p className="microcopy">
          Tracking these carriers from your recent fulfillments:{" "}
          {supportedNames.join(", ")}.
        </p>
      </div>
    );
  }

  return (
    <div className="callout warn">
      <strong>Some carriers aren&apos;t supported yet</strong>
      <p className="microcopy">
        Covered:{" "}
        {supportedNames.length > 0 ? supportedNames.join(", ") : "—"}.
      </p>
      <p className="microcopy">
        Not yet supported: {unsupportedNames.join(", ")}. Shipments on these
        carriers will be skipped until we add tracking support — message us
        and we&apos;ll prioritise it.
      </p>
    </div>
  );
}

export function ShipmentMonitorTable({
  rows,
  backfill,
}: {
  rows: MonitoredShipmentRow[];
  backfill?: BackfillStatus;
}) {
  if (rows.length === 0) {
    if (backfill?.state === "queued" || backfill?.state === "running") {
      return (
        <div className="empty-state">
          <strong>Scanning your recent fulfillments…</strong>
          <p className="microcopy">
            DelayRadar is pulling your latest tracked orders from Shopify. This
            usually takes 1–2 minutes after install. Refresh in a moment to see
            your shipments here.
          </p>
        </div>
      );
    }

    if (backfill?.state === "complete") {
      return (
        <div className="empty-state">
          <strong>You&apos;re all caught up.</strong>
          <p className="microcopy">
            We synced your recent fulfillments and didn&apos;t find any shipments
            with delivery exceptions. New shipments will be monitored
            automatically — we&apos;ll alert you the moment one runs late.
          </p>
        </div>
      );
    }

    return (
      <div className="empty-state">
        <strong>No fulfillments synced yet.</strong>
        <p className="microcopy">
          Use <em>Queue fulfillment sync</em> above to backfill your recent
          orders, or fulfil an order with a tracking number — DelayRadar will
          start monitoring it automatically.
        </p>
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
            <th>Tracker</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.orderName}</strong>
                <div className="microcopy">{row.customerName}</div>
                <div className="microcopy">{row.lastCheckpointAt}</div>
              </td>
              <td>
                <span className={cn("pill", toneClass(row.latestStatusTone))}>
                  {row.latestStatus}
                </span>
                <div className="microcopy">
                  {row.exceptionType ?? "No active exception"}
                </div>
              </td>
              <td>
                <div>{row.carrier}</div>
                <div className="mono microcopy">{row.trackingNumber}</div>
              </td>
              <td>
                <span className="microcopy">{row.trackerState}</span>
              </td>
              <td>
                <strong>{row.riskScore}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
