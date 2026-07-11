"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import type { AppBootstrap, TemplateRow } from "@/src/lib/data/types";
import { cn } from "@/src/lib/utils";

import { ActivityPanel } from "./delayradar/activity-panel";
import { ExceptionDetailPanel } from "./delayradar/exception-detail-panel";
import { ExceptionsTab } from "./delayradar/exceptions-tab";
import {
  DEMO_SHOP_DOMAIN,
  formatThresholdInput,
  pickManualTemplateId,
  pickTemplate,
  readJson,
  toRuleState,
  toneClass,
} from "./delayradar/helpers";
import { InstallPanel } from "./delayradar/install-panel";
import { OverviewTab } from "./delayradar/overview-tab";
import { ReportsTab } from "./delayradar/reports-tab";
import { SettingsTab } from "./delayradar/settings-tab";
import { TemplatesTab } from "./delayradar/templates-tab";

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
  const feedbackRef = useRef<HTMLDivElement | null>(null);

  // The banner lives at the top of the page while most save buttons sit far
  // below it — bring feedback into view so actions never appear to no-op.
  useEffect(() => {
    if (notice || error) {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [notice, error]);

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

  const carrierOptions = useMemo(
    () =>
      Array.from(
        new Set((data?.exceptionInbox ?? []).map((row) => row.carrier)),
      ).sort((left, right) => left.localeCompare(right)),
    [data?.exceptionInbox],
  );

  const exceptionTypeOptions = useMemo(
    () =>
      Array.from(
        new Set((data?.exceptionInbox ?? []).map((row) => row.exceptionType)),
      ).sort((left, right) => left.localeCompare(right)),
    [data?.exceptionInbox],
  );

  const triageCounts = useMemo(() => {
    const rows = data?.exceptionInbox ?? [];

    return {
      fresh: rows.filter((row) => row.triageBucket === "fresh").length,
      aging: rows.filter((row) => row.triageBucket === "aging").length,
      stale: rows.filter((row) => row.triageBucket === "stale").length,
    };
  }, [data?.exceptionInbox]);

  const filteredExceptions = useMemo(
    () =>
      (data?.exceptionInbox ?? []).filter((row) => {
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
      }),
    [
      data?.exceptionInbox,
      severityFilter,
      actionFilter,
      carrierFilter,
      exceptionTypeFilter,
      triageFilter,
      workflowFilter,
      deferredQuery,
    ],
  );

  const filteredExceptionIds = useMemo(
    () => filteredExceptions.map((row) => row.id),
    [filteredExceptions],
  );

  useEffect(() => {
    if (filteredExceptionIds.length === 0) {
      if (selectedExceptionId) {
        setSelectedExceptionId("");
      }
      return;
    }

    if (!filteredExceptionIds.includes(selectedExceptionId)) {
      setSelectedExceptionId(filteredExceptionIds[0]);
    }
  }, [filteredExceptionIds, selectedExceptionId]);

  const selectedExceptionDetail = useMemo(
    () =>
      data?.exceptionDetails.find(
        (entry) => entry.shipmentId === selectedExceptionId,
      ) ?? null,
    [data?.exceptionDetails, selectedExceptionId],
  );

  const emailTemplates = useMemo(
    () => (data?.templates ?? []).filter((template) => template.channel === "EMAIL"),
    [data?.templates],
  );

  useEffect(() => {
    setManualTemplateId(
      pickManualTemplateId(selectedExceptionDetail, emailTemplates),
    );
  }, [selectedExceptionId, emailTemplates, selectedExceptionDetail]);

  // Demo mode has no backing shop record, so write calls would fail with a
  // confusing auth error — intercept them with a friendly notice instead.
  function blockDemoWrites() {
    if (data?.mode === "demo") {
      setError(null);
      setNotice(
        "Demo mode is read-only. Install DelayRadar on your store to save changes.",
      );
      return true;
    }

    return false;
  }

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
    if (!templateDraft || !shopInput || blockDemoWrites()) {
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
    if (!shopInput || blockDemoWrites()) {
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
    if (!shopInput || blockDemoWrites()) {
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
    if (!shopInput || blockDemoWrites()) {
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
    if (!shopInput || blockDemoWrites()) {
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
    if (!shopInput || blockDemoWrites()) {
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
    if (!shopInput || blockDemoWrites()) {
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
    if (!shopInput || !selectedExceptionDetail || !manualTemplateId || blockDemoWrites()) {
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
    if (!shopInput || !templateDraft || blockDemoWrites()) {
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
    if (!shopInput || !selectedExceptionDetail || blockDemoWrites()) {
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

  function retryFailedJobs() {
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
  }

  function handleTemplateSelect(id: string) {
    const nextTemplate =
      data?.templates.find((template) => template.id === id) ?? null;
    setTemplateId(id);
    setTemplateDraft(nextTemplate);
  }

  const modeBadge =
    data?.mode === "live"
      ? "Live"
      : data?.mode === "demo"
        ? "Demo"
        : "Install";

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

          <div ref={feedbackRef}>
            {error ? <div className="error-banner">{error}</div> : null}
            {notice ? <div className="success-banner">{notice}</div> : null}
          </div>

          {data?.mode === "install" ? (
            <InstallPanel
              shopInput={shopInput}
              onShopInputChange={setShopInput}
              onPreviewDemoShop={previewDemoShop}
              isSaving={isSaving}
              assumptions={data.assumptions}
            />
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
                    <OverviewTab
                      data={data}
                      onSelectException={(id) => {
                        setSelectedExceptionId(id);
                        setActiveTab("exceptions");
                      }}
                    />
                  ) : null}

                  {activeTab === "exceptions" ? (
                    <ExceptionsTab
                      filteredExceptions={filteredExceptions}
                      triageFilter={triageFilter}
                      onTriageFilterChange={setTriageFilter}
                      triageCounts={triageCounts}
                      exceptionSearch={exceptionSearch}
                      onExceptionSearchChange={setExceptionSearch}
                      severityFilter={severityFilter}
                      onSeverityFilterChange={setSeverityFilter}
                      actionFilter={actionFilter}
                      onActionFilterChange={setActionFilter}
                      carrierFilter={carrierFilter}
                      onCarrierFilterChange={setCarrierFilter}
                      carrierOptions={carrierOptions}
                      exceptionTypeFilter={exceptionTypeFilter}
                      onExceptionTypeFilterChange={setExceptionTypeFilter}
                      exceptionTypeOptions={exceptionTypeOptions}
                      workflowFilter={workflowFilter}
                      onWorkflowFilterChange={setWorkflowFilter}
                      selectedExceptionId={selectedExceptionId}
                      onSelectException={setSelectedExceptionId}
                      noMovementThresholdHours={
                        data?.settings.noMovementThresholdHours ?? 72
                      }
                    />
                  ) : null}

                  {activeTab === "templates" ? (
                    <TemplatesTab
                      templates={data?.templates ?? []}
                      hasEmailProvider={data?.settings.hasEmailProvider ?? false}
                      shopEmail={data?.shop?.email ?? ""}
                      templateId={templateId}
                      templateDraft={templateDraft}
                      onTemplateSelect={handleTemplateSelect}
                      onTemplateDraftChange={setTemplateDraft}
                      testSendTarget={testSendTarget}
                      onTestSendTargetChange={setTestSendTarget}
                      onSendTemplateTest={sendTemplateTest}
                      onSaveTemplate={saveTemplate}
                      isSaving={isSaving}
                    />
                  ) : null}

                  {activeTab === "reports" ? (
                    <ReportsTab carrierReport={data?.carrierReport ?? []} />
                  ) : null}

                  {activeTab === "settings" ? (
                    <SettingsTab
                      health={data?.health ?? null}
                      settings={data?.settings ?? null}
                      isSaving={isSaving}
                      noMovementThresholdHours={noMovementThresholdHours}
                      onNoMovementThresholdHoursChange={setNoMovementThresholdHours}
                      emailRuleState={emailRuleState}
                      onEmailRuleToggle={(triggerType, active) =>
                        setEmailRuleState((current) => ({
                          ...current,
                          [triggerType]: active,
                        }))
                      }
                      onSaveNotificationSettings={saveNotificationSettings}
                      priorityOrderValueThreshold={priorityOrderValueThreshold}
                      onPriorityOrderValueThresholdChange={setPriorityOrderValueThreshold}
                      vipTagPattern={vipTagPattern}
                      onVipTagPatternChange={setVipTagPattern}
                      lostInTransitThresholdHours={lostInTransitThresholdHours}
                      onLostInTransitThresholdHoursChange={setLostInTransitThresholdHours}
                      onSavePrioritySettings={savePrioritySettings}
                      slackWebhookUrl={slackWebhookUrl}
                      onSlackWebhookUrlChange={setSlackWebhookUrl}
                      digestHour={digestHour}
                      onDigestHourChange={setDigestHour}
                      notifyHighRiskOnly={notifyHighRiskOnly}
                      onNotifyHighRiskOnlyChange={setNotifyHighRiskOnly}
                      slackRuleState={slackRuleState}
                      onSlackRuleToggle={(triggerType, active) =>
                        setSlackRuleState((current) => ({
                          ...current,
                          [triggerType]: active,
                        }))
                      }
                      onSendSlackTest={sendSlackTest}
                      onQueueDailyDigest={queueDailyDigest}
                      onSaveSlackSettings={saveSlackSettings}
                      onRetryFailedJobs={retryFailedJobs}
                    />
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
                    <ActivityPanel
                      timeline={data?.timeline ?? []}
                      assumptions={data?.assumptions ?? []}
                    />
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
