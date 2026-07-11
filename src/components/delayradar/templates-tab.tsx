import type { TemplateRow } from "@/src/lib/data/types";
import { cn, titleize } from "@/src/lib/utils";

import {
  messageModeDescription,
  messageModeLabel,
  messageModeTone,
  previewTemplateDraft,
  toneClass,
} from "./helpers";

export function TemplatesTab({
  templates,
  hasEmailProvider,
  shopEmail,
  templateId,
  templateDraft,
  onTemplateSelect,
  onTemplateDraftChange,
  testSendTarget,
  onTestSendTargetChange,
  onSendTemplateTest,
  onSaveTemplate,
  isSaving,
}: {
  templates: TemplateRow[];
  hasEmailProvider: boolean;
  shopEmail: string;
  templateId: string;
  templateDraft: TemplateRow | null;
  onTemplateSelect: (id: string) => void;
  onTemplateDraftChange: (
    updater: (current: TemplateRow | null) => TemplateRow | null,
  ) => void;
  testSendTarget: string;
  onTestSendTargetChange: (value: string) => void;
  onSendTemplateTest: () => void;
  onSaveTemplate: () => void;
  isSaving: boolean;
}) {
  const templatePreview = previewTemplateDraft(templateDraft);
  const effectiveTestSendTarget = testSendTarget.trim() || shopEmail;

  return (
    <>
      <div className="toolbar">
        <div>
          <span className="eyebrow">Proactive comms</span>
          <h2 className="section-title">Customer messaging templates</h2>
        </div>
        <span className="pill good">
          {hasEmailProvider
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
                onChange={(event) => onTemplateSelect(event.target.value)}
              >
                {templates.map((template) => (
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
                  onTemplateDraftChange((current) =>
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
                  onTemplateDraftChange((current) =>
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
                      onTestSendTargetChange(event.target.value)
                    }
                  />
                  <span className="microcopy">
                    {shopEmail
                      ? `Defaults to ${shopEmail} if you leave this blank.`
                      : "Use an internal inbox to verify copy before enabling auto-send."}
                  </span>
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={onSendTemplateTest}
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
              onClick={onSaveTemplate}
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
  );
}
