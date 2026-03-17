"use client";

import {
  useDeferredValue,
  useEffect,
  useState,
  useTransition,
} from "react";

import type {
  AppBootstrap,
  CarrierReportRow,
  ExceptionDetail,
  ExceptionRow,
  MonitoredShipmentRow,
  NoteRow,
  OnboardingChecklist,
  RecommendationVerdict,
  SyncHealthSummary,
  TemplateRow,
  WorkflowStateLabel,
} from "@/src/lib/data/types";
import { isActionNeededTriggerType } from "@/src/lib/notifications/message-mode";
import { getShopifySessionToken } from "@/src/lib/shopify/app-bridge-client";
import { cn, formatCurrency, interpolateTemplate, titleize } from "@/src/lib/utils";

type DelayRadarAppProps = {
  initialShop: string;
  initialHost: string;
};

type TabKey = "overview" | "exceptions" | "templates" | "reports" | "settings";

const tabs: Array<{ id: TabKey; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "exceptions", label: "Exceptions inbox" },
  { id: "templates", label: "Templates" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
];

const DEMO_SHOP_DOMAIN = "demo-shop.myshopify.com";

async function readJson<T>(input: RequestInfo, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const sessionToken = await getShopifySessionToken();

  if (sessionToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

function toneClass(value: string) {
  switch (value) {
    case "good":
      return "good";
    case "warn":
      return "warn";
    case "bad":
      return "bad";
    default:
      return "muted";
  }
}

function riskTone(riskScore: number) {
  if (riskScore >= 75) {
    return "bad";
  }

  if (riskScore >= 35) {
    return "warn";
  }

  return "good";
}

function notificationTone(status: string) {
  switch (status.toLowerCase()) {
    case "sent":
      return "good";
    case "failed":
      return "bad";
    case "pending":
      return "warn";
    default:
      return "muted";
  }
}

function triageTone(value: string) {
  switch (value) {
    case "stale":
      return "bad";
    case "aging":
      return "warn";
    default:
      return "good";
  }
}

function priorityTone(value: string) {
  switch (value) {
    case "VIP":
      return "bad";
    case "High Value":
    case "Express":
      return "warn";
    default:
      return "muted";
  }
}

function formatThresholdInput(cents: number) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

function formatHourWindow(hours: number) {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  return `${hours} hours`;
}

function triageLabel(value: string, noMovementThresholdHours: number) {
  const thresholdLabel = formatHourWindow(noMovementThresholdHours);

  switch (value) {
    case "stale":
      return `${thresholdLabel}+`;
    case "aging":
      return `24 hours-${thresholdLabel}`;
    default:
      return "<24h";
  }
}

function toRuleState(
  rules: AppBootstrap["settings"]["emailRules"],
): Record<string, boolean> {
  return Object.fromEntries(
    rules.map((rule) => [rule.triggerType, rule.active]),
  );
}

function emailRuleDescription(triggerType: string) {
  switch (triggerType) {
    case "DELAYED":
      return "Auto-send a delay update when a shipment is delayed in transit.";
    case "FAILED_DELIVERY":
      return "Auto-send when the carrier could not complete delivery.";
    case "ADDRESS_ISSUE":
      return "Auto-send when the carrier needs address confirmation.";
    case "AVAILABLE_FOR_PICKUP":
      return "Auto-send pickup reminders before the hold window expires.";
    default:
      return "Auto-send proactive customer email updates.";
  }
}

function slackRuleDescription(triggerType: string) {
  switch (triggerType) {
    case "FAILED_DELIVERY":
      return "Alert the team when a carrier fails delivery and support likely needs to step in.";
    case "ADDRESS_ISSUE":
      return "Alert the team when the shipment is blocked on address confirmation.";
    case "LOST_IN_TRANSIT":
      return "Escalate likely lost parcels into Slack for refund or resend review.";
    case "RETURN_TO_SENDER":
      return "Alert when the carrier has started sending the parcel back upstream.";
    default:
      return "Alert the team for this exception type in Slack.";
  }
}

function messageModeLabel(triggerType: string) {
  return isActionNeededTriggerType(triggerType) ? "Action needed" : "FYI";
}

function messageModeTone(triggerType: string) {
  return isActionNeededTriggerType(triggerType) ? "warn" : "good";
}

function messageModeDescription(triggerType: string) {
  switch (triggerType) {
    case "FAILED_DELIVERY":
      return "Ask the customer to confirm the next delivery step so the carrier can try again.";
    case "ADDRESS_ISSUE":
      return "Request address confirmation before the shipment can move again.";
    case "AVAILABLE_FOR_PICKUP":
      return "Prompt the customer to collect the parcel before the pickup hold expires.";
    case "RETURN_TO_SENDER":
      return "Flag that support intervention is likely needed before the shipment can be recovered.";
    case "LOST_IN_TRANSIT":
      return "Set expectations while support decides whether to resend, refund, or wait.";
    case "DELAYED":
      return "Keep the customer informed without asking them to do anything yet.";
    default:
      return "Share a proactive shipment update without creating unnecessary urgency.";
  }
}

function workflowTone(state: WorkflowStateLabel) {
  switch (state) {
    case "resolved":
      return "good";
    case "snoozed":
      return "warn";
    default:
      return "muted";
  }
}

function workflowLabel(state: WorkflowStateLabel) {
  switch (state) {
    case "resolved":
      return "Resolved";
    case "snoozed":
      return "Snoozed";
    default:
      return "Open";
  }
}

function snoozePresets() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const in3Days = new Date(now);
  in3Days.setDate(in3Days.getDate() + 3);
  in3Days.setHours(9, 0, 0, 0);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(9, 0, 0, 0);

  return [
    { label: "Tomorrow 9 AM", value: tomorrow.toISOString() },
    { label: "3 days", value: in3Days.toISOString() },
    { label: "1 week", value: nextWeek.toISOString() },
  ];
}

function recommendationTone(action: string) {
  switch (action) {
    case "RESEND":
    case "REFUND":
    case "REPLACEMENT_REVIEW":
      return "bad";
    case "CONTACT_CUSTOMER":
    case "CARRIER_TRACE":
      return "warn";
    default:
      return "muted";
  }
}

function recommendationActionLabel(action: string) {
  switch (action) {
    case "RESEND":
      return "Resend";
    case "REFUND":
      return "Refund";
    case "WAIT":
      return "Wait";
    case "CONTACT_CUSTOMER":
      return "Contact";
    case "CARRIER_TRACE":
      return "Trace";
    case "REPLACEMENT_REVIEW":
      return "Replace/Refund";
    default:
      return action;
  }
}

function confidenceTone(confidence: string) {
  switch (confidence) {
    case "high":
      return "good";
    case "medium":
      return "warn";
    default:
      return "muted";
  }
}

function pickTemplate(payload: AppBootstrap, currentTemplateId: string) {
  return (
    payload.templates.find((entry) => entry.id === currentTemplateId) ??
    payload.templates[0] ??
    null
  );
}

function pickManualTemplateId(
  detail: ExceptionDetail | null,
  templates: TemplateRow[],
) {
  if (!detail || templates.length === 0) {
    return "";
  }

  const exactMatch = templates.find(
    (template) => titleize(template.triggerType) === detail.exceptionType,
  );

  if (exactMatch) {
    return exactMatch.id;
  }

  if (detail.exceptionType === "No Tracking Movement") {
    const delayedTemplate = templates.find(
      (template) => template.triggerType === "DELAYED",
    );

    if (delayedTemplate) {
      return delayedTemplate.id;
    }
  }

  return templates[0]?.id ?? "";
}

function previewShipmentTemplate(
  detail: ExceptionDetail | null,
  template: TemplateRow | null,
) {
  if (!detail || !template) {
    return null;
  }

  const variables = {
    customer_first_name: detail.customerName.split(" ")[0] ?? "there",
    order_name: detail.orderName,
    tracking_number: detail.trackingNumber,
    carrier_name: detail.carrier,
    latest_status: detail.exceptionType,
  };

  return {
    subject:
      interpolateTemplate(template.subject || template.name, variables) ||
      template.name,
    body: interpolateTemplate(template.body, variables),
  };
}

function previewTemplateDraft(template: TemplateRow | null) {
  if (!template) {
    return null;
  }

  const variables = {
    customer_first_name: "Jordan",
    order_name: "#1045",
    tracking_number: "EZ6000000006",
    carrier_name: "USPS",
    latest_status: titleize(
      template.triggerType === "OTHER" ? "DELAYED" : template.triggerType,
    ),
  };

  return {
    subject:
      interpolateTemplate(template.subject || template.name, variables) ||
      template.name,
    body: interpolateTemplate(template.body, variables),
  };
}

function ExceptionTable({
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
              className={cn(!compact && selectedId === row.id && "table-row-active")}
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

function ExceptionDetailPanel({
  detail,
  templates,
  selectedTemplateId,
  hasEmailProvider,
  isSending,
  noMovementThresholdHours,
  onTemplateChange,
  onSendTemplate,
  onWorkflowAction,
  noteBody,
  onNoteBodyChange,
}: {
  detail: ExceptionDetail | null;
  templates: TemplateRow[];
  selectedTemplateId: string;
  hasEmailProvider: boolean;
  isSending: boolean;
  noMovementThresholdHours: number;
  onTemplateChange: (id: string) => void;
  onSendTemplate: () => void;
  onWorkflowAction: (action: string, extra?: Record<string, string>) => void;
  noteBody: string;
  onNoteBodyChange: (value: string) => void;
}) {
  if (!detail) {
    return (
      <div className="empty-state">
        Select an exception to inspect the shipment timeline, customer comms
        history, and recommended next step.
      </div>
    );
  }

  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? null;
  const templatePreview = previewShipmentTemplate(detail, selectedTemplate);
  const canSendTemplate = Boolean(detail.customerEmail && selectedTemplate);
  const messageModeTriggerType =
    selectedTemplate?.triggerType ??
    (detail.customerAction ? "FAILED_DELIVERY" : "DELAYED");

  return (
    <div className="stack">
      <div className="split-inline">
        <div>
          <span className="eyebrow">Shipment detail</span>
          <h2 className="section-title">{detail.orderName}</h2>
          <p className="section-copy">{detail.customerName}</p>
        </div>
        <div className="stack tight" style={{ alignItems: "flex-end" }}>
          <span className={cn("pill", toneClass(riskTone(detail.riskScore)))}>
            Risk {detail.riskScore}
          </span>
          <span className={cn("pill", toneClass(priorityTone(detail.priorityLabel)))}>
            {detail.priorityLabel} priority
          </span>
        </div>
      </div>
      <div className="split-inline">
        <span className={cn("pill", toneClass(triageTone(detail.triageBucket)))}>
          Last movement bucket{" "}
          {triageLabel(detail.triageBucket, noMovementThresholdHours)}
        </span>
        <span className="microcopy">
          Last checkpoint {detail.lastCheckpointAt}
        </span>
      </div>

      <div className="workflow-bar">
        <span className={cn("pill", toneClass(workflowTone(detail.workflowState)))}>
          {workflowLabel(detail.workflowState)}
        </span>
        {detail.assignedTo ? (
          <span className="pill muted">Assigned to {detail.assignedTo}</span>
        ) : null}
        {detail.reviewedAt ? (
          <span className="pill good">Reviewed {detail.reviewedAt}</span>
        ) : null}
        {detail.workflowState === "snoozed" && detail.snoozedUntil ? (
          <span className="pill warn">
            Snoozed until{" "}
            {new Date(detail.snoozedUntil).toLocaleDateString()}
          </span>
        ) : null}
        <div className="workflow-actions">
          <div className="assign-inline">
            <input
              type="text"
              placeholder="Assign to..."
              defaultValue={detail.assignedTo ?? ""}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value !== (detail.assignedTo ?? "")) {
                  onWorkflowAction("assign", { assignedTo: value });
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  (event.target as HTMLInputElement).blur();
                }
              }}
            />
          </div>
          {!detail.reviewedAt ? (
            <button
              type="button"
              onClick={() => onWorkflowAction("review")}
              disabled={isSending}
            >
              Mark reviewed
            </button>
          ) : null}
          {detail.workflowState === "open" ? (
            <div className="snooze-inline">
              <select
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) {
                    onWorkflowAction("snooze", {
                      snoozedUntil: event.target.value,
                    });
                    event.target.value = "";
                  }
                }}
              >
                <option value="" disabled>
                  Snooze...
                </option>
                {snoozePresets().map((preset) => (
                  <option key={preset.label} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {detail.workflowState !== "resolved" ? (
            <button
              className="resolve-btn"
              type="button"
              onClick={() => onWorkflowAction("resolve")}
              disabled={isSending}
            >
              Resolve
            </button>
          ) : (
            <button
              className="reopen-btn"
              type="button"
              onClick={() => onWorkflowAction("reopen")}
              disabled={isSending}
            >
              Reopen
            </button>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <span className="field-label">Exception</span>
          <strong className="detail-value">{detail.exceptionType}</strong>
          <span className="microcopy">{detail.latestStatus}</span>
        </div>
        <div className="detail-card">
          <span className="field-label">Last checkpoint</span>
          <strong className="detail-value">{detail.lastCheckpointAt}</strong>
          <span className="microcopy">
            {detail.customerAction ? "Customer action needed" : "Monitoring only"}
          </span>
        </div>
        <div className="detail-card">
          <span className="field-label">Carrier</span>
          <strong className="detail-value">{detail.carrier}</strong>
          <span className="mono microcopy">{detail.trackingNumber}</span>
        </div>
        <div className="detail-card">
          <span className="field-label">Business priority</span>
          <strong className="detail-value">{detail.priorityLabel}</strong>
          <span className="microcopy">
            Carrier {detail.carrierRiskScore}
            {detail.orderValueLabel ? ` · ${detail.orderValueLabel}` : ""}
            {detail.shippingMethodLabel ? ` · ${detail.shippingMethodLabel}` : ""}
          </span>
        </div>
      </div>

      <div className="recommendation-card">
        <div className="split-inline">
          <div className="stack tight">
            <span className="eyebrow">Recommended next step</span>
            <strong>{detail.recommendation.label}</strong>
          </div>
          <div className="stack tight" style={{ alignItems: "flex-end" }}>
            <span className={cn("pill", toneClass(recommendationTone(detail.recommendation.action)))}>
              {recommendationActionLabel(detail.recommendation.action)}
            </span>
            <span className={cn("pill", toneClass(confidenceTone(detail.recommendation.confidence)))}>
              {detail.recommendation.confidence} confidence
            </span>
          </div>
        </div>
        <ul className="recommendation-reasons">
          {detail.recommendation.reasoning.map((reason, index) => (
            <li key={index} className="microcopy">{reason}</li>
          ))}
        </ul>
        {detail.priorityReasons.length > 0 ? (
          <p className="microcopy">
            Priority factors: {detail.priorityReasons.join(" ")}
          </p>
        ) : null}
        {detail.recommendation.automatable ? (
          <span className="pill good">Automatable</span>
        ) : null}
        <div className="recommendation-actions">
          {detail.workflowState !== "resolved" ? (
            <>
              <button
                className="button"
                type="button"
                disabled={isSending}
                onClick={() =>
                  onWorkflowAction("accept_recommendation", {
                    recommendationLabel: detail.recommendation.label,
                    recommendationAction: detail.recommendation.action,
                  })
                }
              >
                Accept recommendation
              </button>
              {detail.recommendation.action !== "WAIT" ? (
                <button
                  className="button-secondary"
                  type="button"
                  disabled={isSending}
                  onClick={() => {
                    onWorkflowAction("add_note", {
                      noteBody: `Override: chose to wait instead of "${detail.recommendation.label}".`,
                    });
                  }}
                >
                  Override to wait
                </button>
              ) : null}
            </>
          ) : (
            <span className="pill good">Resolved</span>
          )}
        </div>
      </div>

      <div className="stack">
        <div className="toolbar">
          <div>
            <span className="eyebrow">Manual email</span>
            <h2 className="section-title">Send customer update</h2>
          </div>
          <span className={cn("pill", hasEmailProvider ? "good" : "warn")}>
            {hasEmailProvider ? "Provider ready" : "Provider not configured"}
          </span>
        </div>
        {templates.length > 0 ? (
          <div className="detail-card">
            <label className="field">
              <span className="field-label">Email template</span>
              <select
                className="select"
                value={selectedTemplateId}
                onChange={(event) => onTemplateChange(event.target.value)}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {template.active ? "" : " (inactive)"} ·{" "}
                    {titleize(template.triggerType)}
                  </option>
                ))}
              </select>
            </label>
            <div className="microcopy">
              {detail.customerEmail
                ? `Sends to ${detail.customerEmail}.`
                : "No customer email is stored on this shipment."}
            </div>
            <div className="split-inline">
              <span
                className={cn(
                  "pill",
                  toneClass(messageModeTone(messageModeTriggerType)),
                )}
              >
                {messageModeLabel(messageModeTriggerType)}
              </span>
              <span className="microcopy">
                {messageModeDescription(messageModeTriggerType)}
              </span>
            </div>
            {templatePreview ? (
              <div className="notification-card">
                <strong>{templatePreview.subject}</strong>
                <div className="microcopy">{templatePreview.body}</div>
              </div>
            ) : null}
            <div className="split-inline">
              <span className="microcopy">
                {hasEmailProvider
                  ? "Manual sends are logged on the shipment after delivery."
                  : "Without Postmark or SendGrid configured, DelayRadar will log this attempt as skipped."}
              </span>
              <button
                className="button"
                type="button"
                onClick={onSendTemplate}
                disabled={isSending || !canSendTemplate}
              >
                Send email
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            No email templates are available yet. Create one in Templates before
            sending customer updates from the inbox.
          </div>
        )}
      </div>

      <div className="stack">
        <div className="toolbar">
          <div>
            <span className="eyebrow">Tracking history</span>
            <h2 className="section-title">Recent timeline</h2>
          </div>
          <span className="pill muted">{detail.events.length} events</span>
        </div>
        <div className="timeline">
          {detail.events.map((event) => (
            <div className="timeline-item" key={event.id}>
              <span className="timeline-mark" />
              <div className="timeline-body">
                <div className={cn("pill", toneClass(event.tone))}>
                  {event.occurredAt}
                </div>
                <strong>{event.title}</strong>
                <span className="microcopy">{event.body}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="stack">
        <div className="toolbar">
          <div>
            <span className="eyebrow">Customer comms</span>
            <h2 className="section-title">Notification history</h2>
          </div>
          <span className="pill muted">
            {detail.notifications.length} logged
          </span>
        </div>
        {detail.notifications.length > 0 ? (
          <div className="notification-list">
            {detail.notifications.map((notification) => (
              <div className="notification-card" key={notification.id}>
                <div className="split-inline">
                  <strong>{notification.templateName}</strong>
                  <span
                    className={cn(
                      "pill",
                      toneClass(notificationTone(notification.status)),
                    )}
                  >
                    {notification.status}
                  </span>
                </div>
                <div className="microcopy">
                  {notification.channel} to {notification.target} ·{" "}
                  {notification.sentAt}
                </div>
                <div>{notification.subject}</div>
                <div className="microcopy">{notification.bodyPreview}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            No notifications have been logged for this shipment yet.
          </div>
        )}
      </div>

      <div className="stack">
        <div className="toolbar">
          <div>
            <span className="eyebrow">Internal workflow</span>
            <h2 className="section-title">Team notes</h2>
          </div>
          <span className="pill muted">{detail.notes.length} notes</span>
        </div>
        <div className="note-form">
          <textarea
            placeholder="Add an internal note..."
            rows={2}
            value={noteBody}
            onChange={(event) => onNoteBodyChange(event.target.value)}
          />
          <button
            className="button-secondary"
            type="button"
            disabled={isSending || !noteBody.trim()}
            onClick={() => {
              onWorkflowAction("add_note", { noteBody: noteBody.trim() });
              onNoteBodyChange("");
            }}
          >
            Add note
          </button>
        </div>
        {detail.notes.length > 0 ? (
          <div className="note-list">
            {detail.notes.map((note) => (
              <div className="note-card" key={note.id}>
                <div className="note-meta">
                  <strong>{note.author}</strong>
                  <span className="microcopy">{note.createdAt}</span>
                </div>
                <span>{note.body}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            No internal notes yet. Use notes to coordinate exception handling
            with your team.
          </div>
        )}
      </div>
    </div>
  );
}

function ShipmentMonitorTable({ rows }: { rows: MonitoredShipmentRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        No monitored shipments yet. Queue a fulfillment sync after install, then
        run the worker to backfill shipments and create trackers.
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

export function DelayRadarApp({
  initialShop,
  initialHost,
}: DelayRadarAppProps) {
  const [data, setData] = useState<AppBootstrap | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateRow | null>(null);
  const [templateId, setTemplateId] = useState<string>("");
  const [shopInput, setShopInput] = useState(initialShop);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [digestHour, setDigestHour] = useState("9");
  const [notifyHighRiskOnly, setNotifyHighRiskOnly] = useState(true);
  const [noMovementThresholdHours, setNoMovementThresholdHours] = useState("72");
  const [lostInTransitThresholdHours, setLostInTransitThresholdHours] = useState("168");
  const [priorityOrderValueThreshold, setPriorityOrderValueThreshold] =
    useState("150");
  const [vipTagPattern, setVipTagPattern] = useState("vip");
  const [emailRuleState, setEmailRuleState] = useState<Record<string, boolean>>(
    {},
  );
  const [slackRuleState, setSlackRuleState] = useState<Record<string, boolean>>(
    {},
  );
  const [testSendTarget, setTestSendTarget] = useState("");
  const [exceptionSearch, setExceptionSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [carrierFilter, setCarrierFilter] = useState("all");
  const [exceptionTypeFilter, setExceptionTypeFilter] = useState("all");
  const [triageFilter, setTriageFilter] = useState("all");
  const [selectedExceptionId, setSelectedExceptionId] = useState("");
  const [manualTemplateId, setManualTemplateId] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [noteBody, setNoteBody] = useState("");
  const [isSaving, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(exceptionSearch.trim().toLowerCase());

  function buildBootstrapPath(shop: string) {
    const search = new URLSearchParams();

    if (shop) {
      search.set("shop", shop);
    }

    return `/api/app/bootstrap${search.toString() ? `?${search.toString()}` : ""}`;
  }

  function applyBootstrap(payload: AppBootstrap, preferredTemplateId = "") {
    const nextTemplate = pickTemplate(payload, preferredTemplateId);

    setData(payload);
    setShopInput(payload.prefilledShop || initialShop);
    setSlackWebhookUrl("");
    setDigestHour(String(payload.settings.digestHour));
    setNotifyHighRiskOnly(payload.settings.notifyHighRiskOnly);
    setNoMovementThresholdHours(String(payload.settings.noMovementThresholdHours));
    setLostInTransitThresholdHours(String(payload.settings.lostInTransitThresholdHours));
    setPriorityOrderValueThreshold(
      formatThresholdInput(payload.settings.priorityOrderValueThresholdCents),
    );
    setVipTagPattern(payload.settings.vipTagPattern);
    setEmailRuleState(toRuleState(payload.settings.emailRules));
    setSlackRuleState(toRuleState(payload.settings.slackRules));
    setTestSendTarget(payload.shop?.email ?? "");
    setTemplateId(nextTemplate?.id ?? "");
    setTemplateDraft(nextTemplate);
  }

  async function fetchBootstrap(shop: string, retryIfEmbedded = true) {
    let payload = await readJson<AppBootstrap>(buildBootstrapPath(shop));

    // When embedded in Shopify admin, authenticate.admin() may have just
    // completed the OAuth flow and the afterAuth hook needs a moment to
    // persist the shop record. Retry a few times before giving up.
    if (
      retryIfEmbedded &&
      payload.mode === "install" &&
      shop &&
      initialHost
    ) {
      for (let attempt = 0; attempt < 4; attempt++) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 750 * (attempt + 1));
        });
        payload = await readJson<AppBootstrap>(buildBootstrapPath(shop));
        if (payload.mode !== "install") break;
      }
    }

    return payload;
  }

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        setNotice(null);
        const payload = await fetchBootstrap(initialShop);
        applyBootstrap(payload);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load DelayRadar data.",
        );
      }
    }

    void load();
  }, [initialShop]);

  const carrierOptions = Array.from(
    new Set((data?.exceptionInbox ?? []).map((row) => row.carrier)),
  ).sort((left, right) => left.localeCompare(right));

  const exceptionTypeOptions = Array.from(
    new Set((data?.exceptionInbox ?? []).map((row) => row.exceptionType)),
  ).sort((left, right) => left.localeCompare(right));

  const triageCounts = {
    fresh: (data?.exceptionInbox ?? []).filter((row) => row.triageBucket === "fresh")
      .length,
    aging: (data?.exceptionInbox ?? []).filter((row) => row.triageBucket === "aging")
      .length,
    stale: (data?.exceptionInbox ?? []).filter((row) => row.triageBucket === "stale")
      .length,
  };

  const filteredExceptions = (data?.exceptionInbox ?? []).filter((row) => {
    if (severityFilter !== "all" && row.severity !== severityFilter) {
      return false;
    }

    if (actionFilter === "needs-action" && !row.customerAction) {
      return false;
    }

    if (actionFilter === "monitoring" && row.customerAction) {
      return false;
    }

    if (carrierFilter !== "all" && row.carrier !== carrierFilter) {
      return false;
    }

    if (
      exceptionTypeFilter !== "all" &&
      row.exceptionType !== exceptionTypeFilter
    ) {
      return false;
    }

    if (triageFilter !== "all" && row.triageBucket !== triageFilter) {
      return false;
    }

    if (workflowFilter !== "all" && row.workflowState !== workflowFilter) {
      return false;
    }

    if (!deferredQuery) {
      return true;
    }

    return [
      row.orderName,
      row.customerName,
      row.trackingNumber,
      row.carrier,
      row.exceptionType,
      row.statusLabel,
    ]
      .join(" ")
      .toLowerCase()
      .includes(deferredQuery);
  });

  const filteredExceptionIds = filteredExceptions
    .map((row) => row.id)
    .join("|");

  useEffect(() => {
    const ids = filteredExceptionIds ? filteredExceptionIds.split("|") : [];

    if (ids.length === 0) {
      if (selectedExceptionId) {
        setSelectedExceptionId("");
      }
      return;
    }

    if (!ids.includes(selectedExceptionId)) {
      setSelectedExceptionId(ids[0]);
    }
  }, [filteredExceptionIds, selectedExceptionId]);

  const selectedExceptionDetail =
    data?.exceptionDetails.find(
      (entry) => entry.shipmentId === selectedExceptionId,
    ) ?? null;
  const emailTemplates = (data?.templates ?? []).filter(
    (template) => template.channel === "EMAIL",
  );
  const emailTemplateFingerprint = emailTemplates.map((entry) => entry.id).join("|");

  useEffect(() => {
    setManualTemplateId(
      pickManualTemplateId(selectedExceptionDetail, emailTemplates),
    );
  }, [selectedExceptionId, emailTemplateFingerprint, selectedExceptionDetail]);

  async function refresh() {
    const payload = await fetchBootstrap(shopInput);
    applyBootstrap(payload, templateId);
  }

  function previewDemoShop() {
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setNotice(null);
          setShopInput(DEMO_SHOP_DOMAIN);
          const payload = await fetchBootstrap(DEMO_SHOP_DOMAIN, false);
          applyBootstrap(payload, templateId);
          setNotice("Demo mode loaded.");
        } catch (previewError) {
          setError(
            previewError instanceof Error
              ? previewError.message
              : "Failed to load demo mode.",
          );
        }
      })();
    });
  }

  function saveTemplate() {
    if (!templateDraft || !shopInput) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setNotice(null);
          await readJson("/api/app/templates", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shop: shopInput,
              name: templateDraft.name,
              channel: templateDraft.channel,
              triggerType: templateDraft.triggerType,
              subject: templateDraft.subject,
              body: templateDraft.body,
              active: templateDraft.active,
            }),
          });
          await refresh();
          setNotice("Template saved.");
        } catch (saveError) {
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Failed to save the message template.",
          );
        }
      })();
    });
  }

  function saveSlackSettings() {
    if (!shopInput) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setNotice(null);
          const payload = await readJson<{
            ok: boolean;
            cleared: boolean;
            configured: boolean;
          }>("/api/app/settings/slack", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shop: shopInput,
              webhookUrl: slackWebhookUrl,
              clearWebhook: false,
              digestHour: Number(digestHour),
              notifyHighRiskOnly,
              slackRules: (data?.settings.slackRules ?? []).map((rule) => ({
                triggerType: rule.triggerType,
                active: slackRuleState[rule.triggerType] ?? rule.active,
              })),
            }),
          });
          await refresh();
          setNotice(
            payload.configured
              ? "Slack settings saved."
              : "Slack rules saved. Add a webhook URL to deliver alerts and digests.",
          );
        } catch (saveError) {
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Failed to save Slack settings.",
          );
        }
      })();
    });
  }

  function sendSlackTest() {
    if (!shopInput) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setNotice(null);
          await readJson("/api/app/settings/slack/test", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shop: shopInput,
              webhookUrl: slackWebhookUrl.trim() || undefined,
            }),
          });
          setNotice("Slack test sent.");
        } catch (saveError) {
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Failed to send the Slack test.",
          );
        }
      })();
    });
  }

  function queueDailyDigest() {
    if (!shopInput) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setNotice(null);
          const payload = await readJson<{
            ok: boolean;
            alreadyQueued: boolean;
            alreadySentToday: boolean;
          }>("/api/app/digest", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shop: shopInput,
              force: false,
            }),
          });
          await refresh();
          setNotice(
            payload.alreadySentToday
              ? "Today’s daily digest has already been delivered."
              : payload.alreadyQueued
              ? "A daily digest is already queued for this store."
              : "Daily digest queued. Run the worker to deliver it.",
          );
        } catch (saveError) {
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Failed to queue the daily digest.",
          );
        }
      })();
    });
  }

  function savePrioritySettings() {
    if (!shopInput) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setNotice(null);
          const threshold = Number.parseFloat(priorityOrderValueThreshold);

          if (!Number.isFinite(threshold) || threshold <= 0) {
            throw new Error("Enter a valid high-value threshold.");
          }

          await readJson("/api/app/settings/priority", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shop: shopInput,
              priorityOrderValueThresholdCents: Math.round(threshold * 100),
              vipTagPattern,
              lostInTransitThresholdHours: Number(lostInTransitThresholdHours),
            }),
          });
          await refresh();
          setNotice("Priority rules saved.");
        } catch (saveError) {
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Failed to save priority settings.",
          );
        }
      })();
    });
  }

  function saveNotificationSettings() {
    if (!shopInput) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setNotice(null);
          await readJson("/api/app/settings/notifications", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shop: shopInput,
              noMovementThresholdHours: Number(noMovementThresholdHours),
              emailRules: (data?.settings.emailRules ?? []).map((rule) => ({
                triggerType: rule.triggerType,
                active: emailRuleState[rule.triggerType] ?? rule.active,
              })),
            }),
          });
          await refresh();
          setNotice("Notification settings saved.");
        } catch (saveError) {
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Failed to save notification settings.",
          );
        }
      })();
    });
  }

  function queueSync() {
    if (!shopInput) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setNotice(null);
          await readJson("/api/app/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shop: shopInput,
            }),
          });
          await refresh();
          setNotice(
            "Fulfillment sync queued. Run the worker to ingest shipments and create trackers.",
          );
        } catch (syncError) {
          setError(
            syncError instanceof Error
              ? syncError.message
              : "Failed to queue a backfill sync.",
          );
        }
      })();
    });
  }

  function sendManualTemplate() {
    if (!shopInput || !selectedExceptionDetail || !manualTemplateId) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setNotice(null);
          const payload = await readJson<{
            ok: boolean;
            status: "sent" | "skipped";
            target: string;
          }>("/api/app/notifications/manual", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shop: shopInput,
              shipmentId: selectedExceptionDetail.shipmentId,
              templateId: manualTemplateId,
            }),
          });
          await refresh();
          setNotice(
            payload.status === "sent"
              ? `Email sent to ${payload.target}.`
              : `Email skipped for ${payload.target}. Configure Postmark or SendGrid to deliver emails.`,
          );
        } catch (sendError) {
          setError(
            sendError instanceof Error
              ? sendError.message
              : "Failed to send the shipment email.",
          );
        }
      })();
    });
  }

  function sendTemplateTest() {
    if (!shopInput || !templateDraft) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setNotice(null);
          const payload = await readJson<{
            ok: boolean;
            status: "sent" | "skipped";
            target: string;
          }>("/api/app/templates/test", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shop: shopInput,
              name: templateDraft.name,
              triggerType: templateDraft.triggerType,
              subject: templateDraft.subject,
              body: templateDraft.body,
              target: testSendTarget.trim() || undefined,
            }),
          });
          setNotice(
            payload.status === "sent"
              ? `Test email sent to ${payload.target}.`
              : `Test email skipped for ${payload.target}. Configure Postmark or SendGrid to deliver emails.`,
          );
        } catch (sendError) {
          setError(
            sendError instanceof Error
              ? sendError.message
              : "Failed to send the template test email.",
          );
        }
      })();
    });
  }

  function handleWorkflowAction(
    action: string,
    extra?: Record<string, string>,
  ) {
    if (!shopInput || !selectedExceptionDetail) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setNotice(null);
          await readJson("/api/app/workflow", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shop: shopInput,
              shipmentId: selectedExceptionDetail.shipmentId,
              action,
              ...extra,
            }),
          });
          await refresh();
          const labels: Record<string, string> = {
            assign: extra?.assignedTo
              ? `Assigned to ${extra.assignedTo}.`
              : "Assignment cleared.",
            review: "Marked as reviewed.",
            snooze: "Exception snoozed.",
            resolve: "Exception resolved.",
            reopen: "Exception reopened.",
            add_note: "Note added.",
            accept_recommendation: "Recommendation accepted and exception resolved.",
          };
          setNotice(labels[action] ?? "Workflow updated.");
        } catch (workflowError) {
          setError(
            workflowError instanceof Error
              ? workflowError.message
              : "Workflow action failed.",
          );
        }
      })();
    });
  }

  const modeBadge =
    data?.mode === "live"
      ? "Live"
      : data?.mode === "demo"
        ? "Demo"
        : "Install";
  const templatePreview = previewTemplateDraft(templateDraft);
  const effectiveTestSendTarget = testSendTarget.trim() || data?.shop?.email || "";

  if (!data && !error) {
    return (
      <main className="page-shell">
        <div className="app-frame">
          <section className="hero-panel" style={{ textAlign: "center", padding: "4rem 1rem" }}>
            <span className="badge hot">DelayRadar</span>
            <p className="hero-copy" style={{ marginTop: "1rem" }}>
              Loading your store data...
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="app-frame">
        <section className="hero-panel">
          <div className="hero-topline">
            <span className="badge hot">DelayRadar</span>
            <div className="split-inline">
              <span className="badge">{modeBadge} mode</span>
              {data?.shop ? (
                <span className="badge mono">{data.shop.domain}</span>
              ) : null}
            </div>
          </div>

          <div>
            <h1 className="hero-title">
              Catch delivery exceptions before they become WISMO tickets.
            </h1>
            <p className="hero-copy">
              DelayRadar is an embedded Shopify operations app for stores shipping
              200 to 5,000 orders per month. It watches fulfilments, creates
              trackers in your existing shipping stack, surfaces exception risk,
              and triggers proactive customer communication.
            </p>
          </div>

          {error ? <div className="error-banner">{error}</div> : null}
          {notice ? <div className="success-banner">{notice}</div> : null}

          {data?.mode === "install" ? (
            <div className="hero-grid">
              <div className="surface-panel install-card">
                <span className="eyebrow">Connect store</span>
                <h2 className="section-title">Install DelayRadar into Shopify</h2>
                <p className="section-copy">
                  Enter a <span className="mono">.myshopify.com</span> domain to
                  start OAuth. After install, DelayRadar seeds default email
                  templates, registers webhook-driven ingestion, and queues an
                  initial backfill of recent fulfillments.
                </p>
                <form
                  action="/auth/login"
                  method="POST"
                  target="_top"
                  className="install-form"
                >
                  <input
                    className="input"
                    type="text"
                    name="shop"
                    placeholder="your-store.myshopify.com"
                    value={shopInput}
                    onChange={(event) => setShopInput(event.target.value)}
                  />
                  <button className="button" type="submit">
                    Connect Shopify store
                  </button>
                </form>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={previewDemoShop}
                  disabled={isSaving}
                >
                  Preview with demo shop
                </button>
              </div>

              <div className="surface-panel stack">
                <span className="eyebrow">What ships in MVP</span>
                <div className="callout">
                  <strong>Tracking-first integration path</strong>
                  <p className="microcopy">
                    DelayRadar uses EasyPost trackers for exception monitoring so
                    merchants can keep ShipStation, Shippo, or other label tools in
                    place.
                  </p>
                </div>
                <div className="timeline">
                  {data.assumptions.map((item) => (
                    <div className="timeline-item" key={item}>
                      <span className="timeline-mark" />
                      <div className="timeline-body">
                        <strong>{item}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="hero-grid">
                <div className="stat-grid">
                  {data?.metrics.map((metric) => (
                    <div key={metric.label} className="metric-card">
                      <span className="metric-label">{metric.label}</span>
                      <span className="metric-value">{metric.value}</span>
                      <span className={cn("metric-footnote", toneClass(metric.tone))}>
                        {metric.footnote}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="surface-panel stack">
                  <div className="split-inline">
                    <div>
                      <span className="eyebrow">Store health</span>
                      <h2 className="section-title">{data?.shop?.name}</h2>
                    </div>
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={queueSync}
                      disabled={isSaving}
                    >
                      Queue fulfillment sync
                    </button>
                  </div>
                  <p className="section-copy">{data?.shop?.statusLabel}</p>
                  <div className="stack">
                    <div className="split-inline">
                      <span className="badge">{data?.shop?.modeLabel}</span>
                      <span className="microcopy">
                        Last synced {data?.shop?.lastSyncedAt}
                      </span>
                    </div>
                    <div className="callout">
                      <strong>Why this niche</strong>
                      <p className="microcopy">
                        Support leads and ops managers need fewer exception surprises,
                        fewer “Where is my order?” tickets, and fast customer messaging
                        without changing the shipping tools they already use.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="nav-row">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={cn("nav-chip", activeTab === tab.id && "active")}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="content-grid">
                <div className="surface-panel stack">
                  {activeTab === "overview" ? (
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
                                  {step.complete ? "\u2713" : "\u25CB"}
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
                      <ShipmentMonitorTable rows={data?.recentShipments ?? []} />
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
                  ) : null}

                  {activeTab === "exceptions" ? (
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
                          onClick={() => setTriageFilter("all")}
                        >
                          Any time
                        </button>
                        <button
                          className={cn(
                            "nav-chip",
                            triageFilter === "fresh" && "active",
                          )}
                          type="button"
                          onClick={() => setTriageFilter("fresh")}
                        >
                          &lt;24h ({triageCounts.fresh})
                        </button>
                        <button
                          className={cn(
                            "nav-chip",
                            triageFilter === "aging" && "active",
                          )}
                          type="button"
                          onClick={() => setTriageFilter("aging")}
                        >
                          1-3 days ({triageCounts.aging})
                        </button>
                        <button
                          className={cn(
                            "nav-chip",
                            triageFilter === "stale" && "active",
                          )}
                          type="button"
                          onClick={() => setTriageFilter("stale")}
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
                              setExceptionSearch(event.target.value)
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Severity</span>
                          <select
                            className="select"
                            value={severityFilter}
                            onChange={(event) =>
                              setSeverityFilter(event.target.value)
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
                              setActionFilter(event.target.value)
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
                              setCarrierFilter(event.target.value)
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
                              setExceptionTypeFilter(event.target.value)
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
                              setWorkflowFilter(event.target.value)
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
                        onSelect={setSelectedExceptionId}
                        noMovementThresholdHours={
                          data?.settings.noMovementThresholdHours ?? 72
                        }
                      />
                    </>
                  ) : null}

                  {activeTab === "templates" ? (
                    <>
                      <div className="toolbar">
                        <div>
                          <span className="eyebrow">Proactive comms</span>
                          <h2 className="section-title">Customer messaging templates</h2>
                        </div>
                        <span className="pill good">
                          {data?.settings.hasEmailProvider
                            ? "Email provider ready"
                            : "Email provider not configured"}
                        </span>
                      </div>
                      {templateDraft ? (
                        <div className="stack">
                          <div className="form-grid">
                            <label className="field">
                              <span className="field-label">Template</span>
                              <select
                                className="select"
                                value={templateId}
                                onChange={(event) => {
                                  const nextTemplate =
                                    data?.templates.find(
                                      (template) => template.id === event.target.value,
                                    ) ?? null;
                                  setTemplateId(event.target.value);
                                  setTemplateDraft(nextTemplate);
                                }}
                              >
                                {(data?.templates ?? []).map((template) => (
                                  <option key={template.id} value={template.id}>
                                    {template.name} · {titleize(template.triggerType)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field">
                              <span className="field-label">Subject</span>
                              <input
                                className="input"
                                value={templateDraft.subject}
                                onChange={(event) =>
                                  setTemplateDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          subject: event.target.value,
                                        }
                                      : current,
                                  )
                                }
                              />
                            </label>
                            <label className="field wide">
                              <span className="field-label">Body</span>
                              <textarea
                                className="textarea"
                                rows={8}
                                value={templateDraft.body}
                                onChange={(event) =>
                                  setTemplateDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          body: event.target.value,
                                        }
                                      : current,
                                  )
                                }
                              />
                            </label>
                          </div>
                          <div className="callout">
                            <div className="split-inline">
                              <span
                                className={cn(
                                  "pill",
                                  toneClass(messageModeTone(templateDraft.triggerType)),
                                )}
                              >
                                {messageModeLabel(templateDraft.triggerType)}
                              </span>
                              <span className="microcopy">
                                {messageModeDescription(templateDraft.triggerType)}
                              </span>
                            </div>
                          </div>
                          {templatePreview ? (
                            <div className="detail-grid">
                              <div className="notification-card">
                                <div className="split-inline">
                                  <strong>Live preview</strong>
                                  <span className="microcopy">
                                    Sample order #1045
                                  </span>
                                </div>
                                <div>{templatePreview.subject}</div>
                                <div className="microcopy">
                                  {templatePreview.body}
                                </div>
                              </div>
                              <div className="detail-card">
                                <span className="field-label">Send test email</span>
                                <div className="stack tight">
                                  <input
                                    className="input"
                                    type="email"
                                    placeholder="ops@brand.com"
                                    value={testSendTarget}
                                    onChange={(event) =>
                                      setTestSendTarget(event.target.value)
                                    }
                                  />
                                  <span className="microcopy">
                                    {data?.shop?.email
                                      ? `Defaults to ${data.shop.email} if you leave this blank.`
                                      : "Use an internal inbox to verify copy before enabling auto-send."}
                                  </span>
                                  <button
                                    className="button-secondary"
                                    type="button"
                                    onClick={sendTemplateTest}
                                    disabled={isSaving || !effectiveTestSendTarget}
                                  >
                                    Send test email
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          <div className="split-inline">
                            <span className="microcopy">
                              Variables: <span className="mono">{"{{customer_first_name}}"}</span>,{" "}
                              <span className="mono">{"{{order_name}}"}</span>,{" "}
                              <span className="mono">{"{{tracking_number}}"}</span>
                            </span>
                            <button
                              className="button"
                              type="button"
                              onClick={saveTemplate}
                              disabled={isSaving}
                            >
                              Save template
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="empty-state">
                          No templates exist yet. Install the app to seed defaults for
                          delayed, address issue, and pickup workflows.
                        </div>
                      )}
                    </>
                  ) : null}

                  {activeTab === "reports" ? (
                    <>
                      <div className="toolbar">
                        <div>
                          <span className="eyebrow">Carrier performance</span>
                          <h2 className="section-title">Exception reporting</h2>
                        </div>
                        <span className="pill muted">
                          {data?.carrierReport.length ?? 0} carriers tracked
                        </span>
                      </div>
                      {(data?.carrierReport ?? []).length > 0 ? (
                        <>
                          {(() => {
                            const worst = (data?.carrierReport ?? []).find(
                              (row) => row.exceptionRate > 15,
                            );
                            return worst ? (
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
                            ) : null;
                          })()}
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
                                {(data?.carrierReport ?? []).map((row) => (
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
                          DelayRadar.
                        </div>
                      )}
                    </>
                  ) : null}

                  {activeTab === "settings" ? (
                    <>
                      {data?.health ? (
                        <div className="stack">
                          <div className="toolbar">
                            <div>
                              <span className="eyebrow">Observability</span>
                              <h2 className="section-title">System health</h2>
                            </div>
                            <span className={cn("pill", toneClass(data.health.syncTone))}>
                              Last sync: {data.health.syncAgeLabel}
                            </span>
                          </div>
                          <div className="health-grid">
                            <div className="health-card">
                              <span className="health-label">Shipments</span>
                              <strong className="health-value">{data.health.totalShipments}</strong>
                              <span className="microcopy">{data.health.activeTrackers} active trackers</span>
                            </div>
                            <div className="health-card">
                              <span className="health-label">Webhooks (24h)</span>
                              <strong className="health-value">{data.health.webhooksLast24h}</strong>
                              <span className={cn("microcopy", data.health.webhookFailuresLast24h > 0 && "bad")}>
                                {data.health.webhookFailuresLast24h} failures
                              </span>
                            </div>
                            <div className="health-card">
                              <span className="health-label">Worker backlog</span>
                              <strong className={cn("health-value", data.health.workerBacklog > 10 ? "bad" : data.health.workerBacklog > 0 ? "warn" : "")}>
                                {data.health.workerBacklog}
                              </strong>
                              <span className={cn("microcopy", data.health.workerFailedJobs > 0 && "bad")}>
                                {data.health.workerFailedJobs} failed jobs
                              </span>
                            </div>
                            <div className="health-card">
                              <span className="health-label">Notifications (24h)</span>
                              <strong className="health-value">{data.health.notificationsSentLast24h}</strong>
                              <span className={cn("microcopy", data.health.notificationFailuresLast24h > 0 && "bad")}>
                                {data.health.notificationFailuresLast24h} failures
                              </span>
                            </div>
                          </div>
                          {data.health.workerFailedJobs > 0 ? (
                            <div className="callout warn">
                              <strong>{data.health.workerFailedJobs} failed job{data.health.workerFailedJobs > 1 ? "s" : ""}</strong>
                              <p className="microcopy">
                                Failed jobs can be retried from the worker queue. Check your logs for error details.
                              </p>
                              <button
                                className="button-secondary"
                                type="button"
                                disabled={isSaving}
                                onClick={() => {
                                  startTransition(async () => {
                                    await readJson("/api/app/jobs/retry", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        shop: data?.shop?.domain,
                                        retryAllFailed: true,
                                      }),
                                    });
                                  });
                                }}
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
                              data?.settings.hasEmailProvider ? "good" : "warn",
                            )}
                          >
                            {data?.settings.hasEmailProvider
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
                                setNoMovementThresholdHours(event.target.value)
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
                              {data?.settings.trackingProvider}
                            </strong>
                            <span className="microcopy">
                              DelayRadar stays carrier-agnostic on top of your
                              tracking stack.
                            </span>
                          </div>
                        </div>
                        <div className="rule-grid">
                          {(data?.settings.emailRules ?? []).map((rule) => (
                            <label className="toggle-card" key={rule.triggerType}>
                              <input
                                type="checkbox"
                                checked={
                                  emailRuleState[rule.triggerType] ?? rule.active
                                }
                                onChange={(event) =>
                                  setEmailRuleState((current) => ({
                                    ...current,
                                    [rule.triggerType]: event.target.checked,
                                  }))
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
                            onClick={saveNotificationSettings}
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
                            {data?.settings.currencyCode ?? "USD"} thresholds
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
                                setPriorityOrderValueThreshold(event.target.value)
                              }
                            />
                            <span className="helper-text">
                              Orders above{" "}
                              {formatCurrency(
                                Number.parseFloat(
                                  priorityOrderValueThreshold || "0",
                                ) || 0,
                                data?.settings.currencyCode ?? "USD",
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
                                setVipTagPattern(event.target.value)
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
                                setLostInTransitThresholdHours(event.target.value)
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
                            onClick={savePrioritySettings}
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
                            Tracking provider: {data?.settings.trackingProvider}
                          </span>
                        </div>
                        <div className="form-grid">
                          <label className="field wide">
                            <span className="field-label">Slack incoming webhook</span>
                            <input
                              className="input"
                              placeholder="https://hooks.slack.com/services/..."
                              value={slackWebhookUrl}
                              onChange={(event) => setSlackWebhookUrl(event.target.value)}
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">Daily digest hour</span>
                            <input
                              className="input"
                              type="number"
                              min="0"
                              max="23"
                              value={digestHour}
                              onChange={(event) => setDigestHour(event.target.value)}
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">Slack scope</span>
                            <select
                              className="select"
                              value={notifyHighRiskOnly ? "high-risk" : "all"}
                              onChange={(event) =>
                                setNotifyHighRiskOnly(event.target.value === "high-risk")
                              }
                            >
                              <option value="high-risk">High-risk exceptions only</option>
                              <option value="all">All exception notifications</option>
                            </select>
                          </label>
                        </div>
                        <div className="rule-grid">
                          {(data?.settings.slackRules ?? []).map((rule) => (
                            <label className="toggle-card" key={rule.triggerType}>
                              <input
                                type="checkbox"
                                checked={
                                  slackRuleState[rule.triggerType] ?? rule.active
                                }
                                onChange={(event) =>
                                  setSlackRuleState((current) => ({
                                    ...current,
                                    [rule.triggerType]: event.target.checked,
                                  }))
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
                            {data?.settings.slackConfigured
                              ? "Slack destination is already configured for this store."
                              : "No Slack destination configured yet."}{" "}
                            Digest jobs are scheduled against the store's configured digest hour, and the worker still delivers them.
                          </span>
                          <div className="stack-form">
                            <button
                              className="button-secondary"
                              type="button"
                              onClick={sendSlackTest}
                              disabled={isSaving}
                            >
                              Send Slack test
                            </button>
                            <button
                              className="button-secondary"
                              type="button"
                              onClick={queueDailyDigest}
                              disabled={isSaving}
                            >
                              Queue digest now
                            </button>
                            <button
                              className="button"
                              type="button"
                              onClick={saveSlackSettings}
                              disabled={isSaving}
                            >
                              Save Slack settings
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="surface-panel stack">
                  {activeTab === "exceptions" ? (
                    <ExceptionDetailPanel
                      detail={selectedExceptionDetail}
                      templates={emailTemplates}
                      selectedTemplateId={manualTemplateId}
                      hasEmailProvider={data?.settings.hasEmailProvider ?? false}
                      isSending={isSaving}
                      noMovementThresholdHours={
                        data?.settings.noMovementThresholdHours ?? 72
                      }
                      onTemplateChange={setManualTemplateId}
                      onSendTemplate={sendManualTemplate}
                      onWorkflowAction={handleWorkflowAction}
                      noteBody={noteBody}
                      onNoteBodyChange={setNoteBody}
                    />
                  ) : (
                    <>
                      <div>
                        <span className="eyebrow">Recent activity</span>
                        <h2 className="section-title">Processing timeline</h2>
                      </div>
                      <div className="timeline">
                        {(data?.timeline ?? []).map((item) => (
                          <div className="timeline-item" key={item.id}>
                            <span className="timeline-mark" />
                            <div className="timeline-body">
                              <div className={cn("pill", toneClass(item.tone))}>
                                {item.occurredAt}
                              </div>
                              <strong>{item.title}</strong>
                              <span className="microcopy">{item.body}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <span className="eyebrow">Assumptions</span>
                        <div className="timeline">
                          {(data?.assumptions ?? []).map((item) => (
                            <div className="timeline-item" key={item}>
                              <span className="timeline-mark" />
                              <div className="timeline-body">
                                <span className="microcopy">{item}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
