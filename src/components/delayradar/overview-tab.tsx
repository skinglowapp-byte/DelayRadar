import type { AppBootstrap } from "@/src/lib/data/types";
import { cn } from "@/src/lib/utils";

import { ExceptionTable } from "./exception-table";
import { CarrierCoverageBanner, ShipmentMonitorTable } from "./shipment-monitor";

export function OverviewTab({
  data,
  onSelectException,
  onNavigateTab,
}: {
  data: AppBootstrap | null;
  onSelectException: (id: string) => void;
  onNavigateTab: (tab: string) => void;
}) {
  const topLane = data?.carrierLaneInsights[0] ?? null;

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
            {data.onboarding.steps.map((step) => {
              const content = (
                <>
                  <span className="onboarding-check">
                    {step.complete ? "✓" : "○"}
                  </span>
                  <span>{step.label}</span>
                </>
              );

              // Incomplete, actionable steps become buttons that jump to the
              // relevant tab; completed or non-actionable steps stay static.
              if (step.tab && !step.complete) {
                return (
                  <button
                    type="button"
                    className={cn("onboarding-step", "onboarding-step-action")}
                    key={step.key}
                    onClick={() => onNavigateTab(step.tab!)}
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div
                  className={cn("onboarding-step", step.complete && "complete")}
                  key={step.key}
                >
                  {content}
                </div>
              );
            })}
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
      {topLane ? (
        <div className={cn("lane-intel-card", topLane.tone)}>
          <div>
            <span className="eyebrow">Carrier lane intelligence</span>
            <h2 className="section-title">{topLane.laneLabel}</h2>
            <p className="section-copy">{topLane.recommendation}</p>
          </div>
          <div className="lane-intel-stats">
            <div>
              <strong>{topLane.exceptionRate}%</strong>
              <span>Exception rate</span>
            </div>
            <div>
              <strong>{topLane.avgRiskScore}</strong>
              <span>Avg risk</span>
            </div>
            <div>
              <strong>{topLane.highPriorityCount}</strong>
              <span>Priority orders</span>
            </div>
          </div>
        </div>
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
          ReturnSense starts with delivery exceptions because they are the
          highest-ROI return-prevention signal. ReturnSense now feeds the unified
          returns and recovery workflow.
        </p>
      </div>
    </>
  );
}
