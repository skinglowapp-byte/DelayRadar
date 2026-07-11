import type { ExceptionDetail, TemplateRow } from "@/src/lib/data/types";
import { cn, titleize } from "@/src/lib/utils";

import {
  confidenceTone,
  messageModeDescription,
  messageModeLabel,
  messageModeTone,
  notificationTone,
  previewShipmentTemplate,
  priorityTone,
  recommendationActionLabel,
  recommendationTone,
  riskTone,
  snoozePresets,
  toneClass,
  triageLabel,
  triageTone,
  workflowLabel,
  workflowTone,
} from "./helpers";

export function ExceptionDetailPanel({
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
