import type { AppBootstrap } from "@/src/lib/data/types";
import { cn } from "@/src/lib/utils";

import { toneClass } from "./helpers";

export function ReturnsTab({ data }: { data: AppBootstrap | null }) {
  const exceptions = data?.exceptionInbox ?? [];
  const refundReviews = exceptions.filter((row) =>
    /refund|replacement|resend/i.test(row.recommendedAction),
  );
  const preventableReturns = exceptions.filter(
    (row) =>
      row.exceptionType === "Failed Delivery" ||
      row.exceptionType === "Address Issue" ||
      row.exceptionType === "Available For Pickup" ||
      row.exceptionType === "No Tracking Movement",
  );
  const highRiskReturns = preventableReturns.filter((row) => row.riskScore >= 70);
  const topLane = data?.carrierLaneInsights[0] ?? null;
  const recoveryOutcome = data?.recoveryOutcome;

  return (
    <>
      <div className="toolbar">
        <div>
          <span className="eyebrow">ReturnSense module</span>
          <h2 className="section-title">Returns prevention</h2>
        </div>
        <span className="pill muted">Delivery-aware</span>
      </div>

      <div className="return-sense-grid">
        <div className="return-sense-card">
          <span className="field-label">Preventable return risk</span>
          <strong>{preventableReturns.length}</strong>
          <p className="microcopy">
            Shipments where proactive delivery recovery can prevent a refund,
            replacement, or return request.
          </p>
        </div>
        <div className="return-sense-card">
          <span className="field-label">Refund or resend review</span>
          <strong>{refundReviews.length}</strong>
          <p className="microcopy">
            Cases where the recommendation engine is already steering support
            toward a revenue-impacting resolution.
          </p>
        </div>
        <div className="return-sense-card">
          <span className="field-label">High-risk saves</span>
          <strong>{highRiskReturns.length}</strong>
          <p className="microcopy">
            Priority orders that should be handled before the customer opens a
            ticket or starts a chargeback conversation.
          </p>
        </div>
      </div>

      {topLane ? (
        <div className={cn("callout", topLane.tone === "bad" && "warn")}>
          <strong>Shipping lane tied to return risk: {topLane.laneLabel}</strong>
          <p className="microcopy">
            {topLane.recommendation} ReturnSense can use this signal to adjust
            return-prevention messaging and future exchange/resend policy by
            carrier lane.
          </p>
        </div>
      ) : null}

      <div className="toolbar">
        <div>
          <span className="eyebrow">Outcome engine</span>
          <h2 className="section-title">Recovery decisions that improve policy</h2>
        </div>
        <span className="pill muted">
          {recoveryOutcome?.decisionCount ?? 0} active decisions
        </span>
      </div>

      <div className="outcome-engine-grid">
        <div className="outcome-scorecard">
          <div>
            <span className="field-label">Value at risk</span>
            <strong>
              {recoveryOutcome?.estimatedValueAtRiskLabel ?? "$0.00"}
            </strong>
            <p className="microcopy">
              Open cases where ReturnSense is deciding between wait, outreach,
              carrier trace, resend, replacement, or refund review.
            </p>
          </div>
          <div className="outcome-scorecard-row">
            <span>Automatable actions</span>
            <strong>{recoveryOutcome?.automatableCount ?? 0}</strong>
          </div>
        </div>

        <div className="action-mix-panel">
          {(recoveryOutcome?.recommendedActionMix.length ?? 0) > 0 ? (
            recoveryOutcome!.recommendedActionMix.map((item) => (
              <div className="action-mix-row" key={item.action}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.action.replaceAll("_", " ").toLowerCase()}</span>
                </div>
                <span className={cn("pill", toneClass(item.tone))}>
                  {item.count}
                </span>
              </div>
            ))
          ) : (
            <p className="microcopy">
              Action mix appears once ReturnSense has active exception decisions.
            </p>
          )}
        </div>
      </div>

      <div className="experiment-grid">
        {(recoveryOutcome?.experiments ?? []).map((experiment) => (
          <div className="experiment-card" key={experiment.id}>
            <div className="split-inline">
              <strong>{experiment.title}</strong>
              <span className={cn("pill", toneClass(experiment.tone))}>
                {experiment.confidence} confidence
              </span>
            </div>
            <p className="microcopy">{experiment.hypothesis}</p>
            <div className="experiment-footer">
              <span>{experiment.sampleSize} cases</span>
              <span>{experiment.playbook}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div>
          <span className="eyebrow">Unified workflow</span>
          <h2 className="section-title">Recommended recovery queue</h2>
        </div>
        <span className="pill warn">{refundReviews.length} revenue decisions</span>
      </div>

      {refundReviews.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Exception</th>
                <th>ReturnSense action</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {refundReviews.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.orderName}</strong>
                    <div className="microcopy">{row.customerName}</div>
                  </td>
                  <td>
                    <span className={cn("pill", toneClass(row.severity))}>
                      {row.exceptionType}
                    </span>
                    <div className="microcopy">{row.lastCheckpointAt}</div>
                  </td>
                  <td>{row.recommendedAction}</td>
                  <td>
                    <strong>{row.riskScore}</strong>
                    <div className="microcopy">{row.priorityLabel} priority</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          No resend, replacement, or refund reviews are active right now.
          ReturnSense will surface them here when delivery recovery crosses into
          a returns decision.
        </div>
      )}
    </>
  );
}
