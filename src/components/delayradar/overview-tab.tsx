import type { AppBootstrap } from "@/src/lib/data/types";
import { cn } from "@/src/lib/utils";

import { ExceptionTable } from "./exception-table";
import { CarrierCoverageBanner, ShipmentMonitorTable } from "./shipment-monitor";

export function OverviewTab({
  data,
  onSelectException,
}: {
  data: AppBootstrap | null;
  onSelectException: (id: string) => void;
}) {
  return (
    <>
      {data?.onboarding && !data.onboarding.allComplete ? (
        <div className="onboarding-checklist">
          <div className="toolbar">
            <div>
              <span className="eyebrow">Getting started</span>
              <h2 className="section-title">Setup checklist</h2>
            </div>
            <span className={cn("pill", data.onboarding.completedCount === data.onboarding.totalCount ? "good" : "warn")}>
              {data.onboarding.completedCount}/{data.onboarding.totalCount} complete
            </span>
          </div>
          <div className="onboarding-progress">
            <div
              className="onboarding-progress-bar"
              style={{ width: `${(data.onboarding.completedCount / data.onboarding.totalCount) * 100}%` }}
            />
          </div>
          <div className="onboarding-steps">
            {data.onboarding.steps.map((step) => (
              <div
                className={cn("onboarding-step", step.complete && "complete")}
                key={step.key}
              >
                <span className="onboarding-check">
                  {step.complete ? "✓" : "○"}
                </span>
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="toolbar">
        <div>
          <span className="eyebrow">Shipment monitor</span>
          <h2 className="section-title">Recently tracked shipments</h2>
        </div>
        <span className="pill muted">
          {data?.recentShipments.length ?? 0} recent shipments
        </span>
      </div>
      {data?.carrierCoverage ? (
        <CarrierCoverageBanner coverage={data.carrierCoverage} />
      ) : null}
      <ShipmentMonitorTable
        rows={data?.recentShipments ?? []}
        backfill={data?.backfill}
      />
      <div className="toolbar">
        <div>
          <span className="eyebrow">Exception inbox</span>
          <h2 className="section-title">Highest-risk shipments</h2>
        </div>
        <span className="pill warn">
          {data?.exceptionInbox.length ?? 0} active exceptions
        </span>
      </div>
      <ExceptionTable
        rows={(data?.exceptionInbox ?? []).slice(0, 6)}
        compact
        onSelect={onSelectException}
        noMovementThresholdHours={
          data?.settings.noMovementThresholdHours ?? 72
        }
      />
      <div className="callout">
        <strong>Workflow focus</strong>
        <p className="microcopy">
          DelayRadar stays tightly scoped to delivery exceptions and
          proactive comms. That is the single highest-ROI slice before
          you layer on returns or auto-refund logic.
        </p>
      </div>
    </>
  );
}
