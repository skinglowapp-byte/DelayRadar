import type { AppBootstrap } from "@/src/lib/data/types";
import { cn, formatCurrency } from "@/src/lib/utils";

import {
  emailRuleDescription,
  formatHourWindow,
  slackRuleDescription,
  toneClass,
} from "./helpers";

export function SettingsTab({
  health,
  settings,
  isSaving,
  noMovementThresholdHours,
  onNoMovementThresholdHoursChange,
  emailRuleState,
  onEmailRuleToggle,
  onSaveNotificationSettings,
  priorityOrderValueThreshold,
  onPriorityOrderValueThresholdChange,
  vipTagPattern,
  onVipTagPatternChange,
  lostInTransitThresholdHours,
  onLostInTransitThresholdHoursChange,
  onSavePrioritySettings,
  slackWebhookUrl,
  onSlackWebhookUrlChange,
  digestHour,
  onDigestHourChange,
  notifyHighRiskOnly,
  onNotifyHighRiskOnlyChange,
  slackRuleState,
  onSlackRuleToggle,
  onSendSlackTest,
  onQueueDailyDigest,
  onSaveSlackSettings,
  onRetryFailedJobs,
}: {
  health: AppBootstrap["health"] | null;
  settings: AppBootstrap["settings"] | null;
  isSaving: boolean;
  noMovementThresholdHours: string;
  onNoMovementThresholdHoursChange: (value: string) => void;
  emailRuleState: Record<string, boolean>;
  onEmailRuleToggle: (triggerType: string, active: boolean) => void;
  onSaveNotificationSettings: () => void;
  priorityOrderValueThreshold: string;
  onPriorityOrderValueThresholdChange: (value: string) => void;
  vipTagPattern: string;
  onVipTagPatternChange: (value: string) => void;
  lostInTransitThresholdHours: string;
  onLostInTransitThresholdHoursChange: (value: string) => void;
  onSavePrioritySettings: () => void;
  slackWebhookUrl: string;
  onSlackWebhookUrlChange: (value: string) => void;
  digestHour: string;
  onDigestHourChange: (value: string) => void;
  notifyHighRiskOnly: boolean;
  onNotifyHighRiskOnlyChange: (value: boolean) => void;
  slackRuleState: Record<string, boolean>;
  onSlackRuleToggle: (triggerType: string, active: boolean) => void;
  onSendSlackTest: () => void;
  onQueueDailyDigest: () => void;
  onSaveSlackSettings: () => void;
  onRetryFailedJobs: () => void;
}) {
  return (
    <>
      {health ? (
        <div className="stack">
          <div className="toolbar">
            <div>
              <span className="eyebrow">Observability</span>
              <h2 className="section-title">System health</h2>
            </div>
            <span className={cn("pill", toneClass(health.syncTone))}>
              Last sync: {health.syncAgeLabel}
            </span>
          </div>
          <div className="health-grid">
            <div className="health-card">
              <span className="health-label">Shipments</span>
              <strong className="health-value">{health.totalShipments}</strong>
              <span className="microcopy">{health.activeTrackers} active trackers</span>
            </div>
            <div className="health-card">
              <span className="health-label">Webhooks (24h)</span>
              <strong className="health-value">{health.webhooksLast24h}</strong>
              <span className={cn("microcopy", health.webhookFailuresLast24h > 0 && "bad")}>
                {health.webhookFailuresLast24h} failures
              </span>
            </div>
            <div className="health-card">
              <span className="health-label">Worker backlog</span>
              <strong className={cn("health-value", health.workerBacklog > 10 ? "bad" : health.workerBacklog > 0 ? "warn" : "")}>
                {health.workerBacklog}
              </strong>
              <span className={cn("microcopy", health.workerFailedJobs > 0 && "bad")}>
                {health.workerFailedJobs} failed jobs
              </span>
            </div>
            <div className="health-card">
              <span className="health-label">Notifications (24h)</span>
              <strong className="health-value">{health.notificationsSentLast24h}</strong>
              <span className={cn("microcopy", health.notificationFailuresLast24h > 0 && "bad")}>
                {health.notificationFailuresLast24h} failures
              </span>
            </div>
          </div>
          {health.workerFailedJobs > 0 ? (
            <div className="callout warn">
              <strong>{health.workerFailedJobs} failed job{health.workerFailedJobs > 1 ? "s" : ""}</strong>
              <p className="microcopy">
                Failed jobs can be retried from the worker queue. Check your logs for error details.
              </p>
              <button
                className="button-secondary"
                type="button"
                disabled={isSaving}
                onClick={onRetryFailedJobs}
              >
                Retry all failed jobs
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="stack">
        <div className="toolbar">
          <div>
            <span className="eyebrow">Customer comms</span>
            <h2 className="section-title">Notification settings</h2>
          </div>
          <span
            className={cn(
              "pill",
              settings?.hasEmailProvider ? "good" : "warn",
            )}
          >
            {settings?.hasEmailProvider
              ? "Email provider ready"
              : "Email provider not configured"}
          </span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">
              No-movement threshold
            </span>
            <input
              className="input"
              type="number"
              min="24"
              max="240"
              step="24"
              value={noMovementThresholdHours}
              onChange={(event) =>
                onNoMovementThresholdHoursChange(event.target.value)
              }
            />
            <span className="helper-text">
              Shipments with no carrier scan beyond this window
              become stale exceptions in the inbox.
            </span>
          </label>
          <div className="detail-card">
            <span className="field-label">Tracking provider</span>
            <strong className="detail-value">
              {settings?.trackingProvider}
            </strong>
            <span className="microcopy">
              DelayRadar stays carrier-agnostic on top of your
              tracking stack.
            </span>
          </div>
        </div>
        <div className="rule-grid">
          {(settings?.emailRules ?? []).map((rule) => (
            <label className="toggle-card" key={rule.triggerType} aria-label={rule.label}>
              <input
                type="checkbox"
                checked={
                  emailRuleState[rule.triggerType] ?? rule.active
                }
                onChange={(event) =>
                  onEmailRuleToggle(rule.triggerType, event.target.checked)
                }
              />
              <div className="stack tight">
                <strong>{rule.label}</strong>
                <span className="microcopy">
                  {emailRuleDescription(rule.triggerType)}
                </span>
              </div>
            </label>
          ))}
        </div>
        <div className="split-inline">
          <span className="microcopy">
            These toggles govern automatic email sends. Manual
            sends from shipment detail remain available.
          </span>
          <button
            className="button"
            type="button"
            onClick={onSaveNotificationSettings}
            disabled={isSaving}
          >
            Save notification rules
          </button>
        </div>
      </div>

      <div className="stack">
        <div className="toolbar">
          <div>
            <span className="eyebrow">Business impact</span>
            <h2 className="section-title">Priority rules</h2>
          </div>
          <span className="pill muted">
            {settings?.currencyCode ?? "USD"} thresholds
          </span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">
              High-value threshold
            </span>
            <input
              className="input"
              type="number"
              min="10"
              step="1"
              value={priorityOrderValueThreshold}
              onChange={(event) =>
                onPriorityOrderValueThresholdChange(event.target.value)
              }
            />
            <span className="helper-text">
              Orders above{" "}
              {formatCurrency(
                Number.parseFloat(
                  priorityOrderValueThreshold || "0",
                ) || 0,
                settings?.currencyCode ?? "USD",
              )}{" "}
              get a higher internal priority score.
            </span>
          </label>
          <label className="field">
            <span className="field-label">VIP tag match</span>
            <input
              className="input"
              value={vipTagPattern}
              onChange={(event) =>
                onVipTagPatternChange(event.target.value)
              }
            />
            <span className="helper-text">
              Comma-separate tag patterns, for example{" "}
              <span className="mono">vip, influencer</span>.
            </span>
          </label>
          <label className="field">
            <span className="field-label">
              Lost-in-transit threshold (hours)
            </span>
            <input
              className="input"
              type="number"
              min="48"
              max="720"
              step="24"
              value={lostInTransitThresholdHours}
              onChange={(event) =>
                onLostInTransitThresholdHoursChange(event.target.value)
              }
            />
            <span className="helper-text">
              Shipments with no movement past{" "}
              {formatHourWindow(
                Number(lostInTransitThresholdHours) || 168,
              )}{" "}
              trigger a resend or refund recommendation.
            </span>
          </label>
        </div>
        <div className="split-inline">
          <span className="microcopy">
            DelayRadar boosts inbox ranking, Slack alerts, and
            digests when the shipment belongs to a VIP or
            high-value order.
          </span>
          <button
            className="button"
            type="button"
            onClick={onSavePrioritySettings}
            disabled={isSaving}
          >
            Save priority rules
          </button>
        </div>
      </div>

      <div className="stack">
        <div className="toolbar">
          <div>
            <span className="eyebrow">Escalations and sync</span>
            <h2 className="section-title">Slack settings</h2>
          </div>
          <span className="pill muted">
            Tracking provider: {settings?.trackingProvider}
          </span>
        </div>
        <div className="form-grid">
          <label className="field wide">
            <span className="field-label">Slack incoming webhook</span>
            <input
              className="input"
              placeholder="https://hooks.slack.com/services/..."
              value={slackWebhookUrl}
              onChange={(event) => onSlackWebhookUrlChange(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Daily digest hour</span>
            <select
              className="select"
              value={digestHour}
              onChange={(event) => onDigestHourChange(event.target.value)}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={String(hour)}>
                  {hour === 0
                    ? "12:00 AM"
                    : hour < 12
                      ? `${hour}:00 AM`
                      : hour === 12
                        ? "12:00 PM"
                        : `${hour - 12}:00 PM`}
                </option>
              ))}
            </select>
            <span className="helper-text">
              Digests are queued for this hour but only sent out
              during our twice-daily processing windows, so
              delivery can lag by up to several hours.
            </span>
          </label>
          <label className="field">
            <span className="field-label">Slack scope</span>
            <select
              className="select"
              value={notifyHighRiskOnly ? "high-risk" : "all"}
              onChange={(event) =>
                onNotifyHighRiskOnlyChange(event.target.value === "high-risk")
              }
            >
              <option value="high-risk">High-risk exceptions only</option>
              <option value="all">All exception notifications</option>
            </select>
          </label>
        </div>
        <div className="rule-grid">
          {(settings?.slackRules ?? []).map((rule) => (
            <label className="toggle-card" key={rule.triggerType} aria-label={rule.label}>
              <input
                type="checkbox"
                checked={
                  slackRuleState[rule.triggerType] ?? rule.active
                }
                onChange={(event) =>
                  onSlackRuleToggle(rule.triggerType, event.target.checked)
                }
              />
              <div className="stack tight">
                <strong>{rule.label}</strong>
                <span className="microcopy">
                  {slackRuleDescription(rule.triggerType)}
                </span>
              </div>
            </label>
          ))}
        </div>
        <div className="split-inline">
          <span className="microcopy">
            {settings?.slackConfigured
              ? "Slack destination is already configured for this store."
              : "No Slack destination configured yet."}{" "}
            Digest jobs are scheduled against the store&apos;s configured digest hour, and the worker still delivers them.
          </span>
          <div className="stack-form">
            <button
              className="button-secondary"
              type="button"
              onClick={onSendSlackTest}
              disabled={isSaving}
            >
              Send Slack test
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={onQueueDailyDigest}
              disabled={isSaving}
            >
              Queue digest now
            </button>
            <button
              className="button"
              type="button"
              onClick={onSaveSlackSettings}
              disabled={isSaving}
            >
              Save Slack settings
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
