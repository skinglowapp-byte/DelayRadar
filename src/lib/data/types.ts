export type Tone = "good" | "warn" | "bad" | "muted";
export type TriageBucket = "fresh" | "aging" | "stale";
export type WorkflowStateLabel = "open" | "snoozed" | "resolved";

export type RecommendationAction =
  | "RESEND"
  | "REFUND"
  | "WAIT"
  | "CONTACT_CUSTOMER"
  | "CARRIER_TRACE"
  | "REPLACEMENT_REVIEW";

export type RecommendationConfidence = "high" | "medium" | "low";

export type RecommendationVerdict = {
  action: RecommendationAction;
  label: string;
  reasoning: string[];
  confidence: RecommendationConfidence;
  automatable: boolean;
};

export type MetricCardData = {
  label: string;
  value: string;
  footnote: string;
  tone: Tone;
};

export type NoteRow = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type ExceptionRow = {
  id: string;
  orderName: string;
  customerName: string;
  trackingNumber: string;
  carrier: string;
  statusLabel: string;
  exceptionType: string;
  severity: Tone;
  customerAction: boolean;
  lastCheckpointAt: string;
  riskScore: number;
  carrierRiskScore: number;
  priorityLabel: string;
  recommendedAction: string;
  triageBucket: TriageBucket;
  workflowState: WorkflowStateLabel;
  assignedTo: string | null;
  reviewedAt: string | null;
  snoozedUntil: string | null;
};

export type NotificationHistoryRow = {
  id: string;
  channel: string;
  status: string;
  target: string;
  templateName: string;
  subject: string;
  bodyPreview: string;
  sentAt: string;
};

export type NotificationRuleSummary = {
  triggerType: string;
  label: string;
  active: boolean;
};

export type TemplateRow = {
  id: string;
  name: string;
  channel: string;
  triggerType: string;
  subject: string;
  body: string;
  active: boolean;
};

export type MonitoredShipmentRow = {
  id: string;
  orderName: string;
  customerName: string;
  trackingNumber: string;
  carrier: string;
  latestStatus: string;
  latestStatusTone: Tone;
  exceptionType: string | null;
  trackerState: string;
  lastCheckpointAt: string;
  riskScore: number;
};

export type TimelineEntry = {
  id: string;
  title: string;
  body: string;
  occurredAt: string;
  tone: Tone;
};

export type ExceptionDetail = {
  shipmentId: string;
  orderName: string;
  customerName: string;
  customerEmail: string | null;
  trackingNumber: string;
  carrier: string;
  latestStatus: string;
  exceptionType: string;
  recommendedAction: string;
  recommendation: RecommendationVerdict;
  customerAction: boolean;
  riskScore: number;
  carrierRiskScore: number;
  priorityLabel: string;
  priorityReasons: string[];
  orderValueLabel: string | null;
  shippingMethodLabel: string | null;
  lastCheckpointAt: string;
  triageBucket: TriageBucket;
  workflowState: WorkflowStateLabel;
  assignedTo: string | null;
  reviewedAt: string | null;
  snoozedUntil: string | null;
  events: TimelineEntry[];
  notifications: NotificationHistoryRow[];
  notes: NoteRow[];
};

export type CarrierReportRow = {
  carrier: string;
  totalShipments: number;
  exceptionCount: number;
  exceptionRate: number;
  avgRiskScore: number;
  topExceptionType: string;
  lostInTransitCount: number;
  avgResolutionHours: number | null;
};

export type AppSettingsSummary = {
  trackingProvider: string;
  currencyCode: string;
  slackConfigured: boolean;
  digestHour: number;
  notifyHighRiskOnly: boolean;
  hasEmailProvider: boolean;
  noMovementThresholdHours: number;
  lostInTransitThresholdHours: number;
  priorityOrderValueThresholdCents: number;
  vipTagPattern: string;
  emailRules: NotificationRuleSummary[];
  slackRules: NotificationRuleSummary[];
};

export type ShopSummary = {
  domain: string;
  name: string;
  email: string | null;
  statusLabel: string;
  modeLabel: string;
  lastSyncedAt: string;
};

export type SyncHealthSummary = {
  lastSyncedAt: string | null;
  syncAgeLabel: string;
  syncTone: Tone;
  totalShipments: number;
  activeTrackers: number;
  webhooksLast24h: number;
  webhookFailuresLast24h: number;
  workerBacklog: number;
  workerFailedJobs: number;
  notificationsSentLast24h: number;
  notificationFailuresLast24h: number;
};

export type OnboardingStep = {
  key: string;
  label: string;
  complete: boolean;
  href?: string;
};

export type OnboardingChecklist = {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  allComplete: boolean;
};

export type BackfillStatus = {
  state: "idle" | "queued" | "running" | "complete";
  lastSyncedAt: string | null;
  totalShipments: number;
};

export type CarrierCoverageEntry = {
  carrier: string;
  shipmentCount: number;
  supported: boolean;
};

export type CarrierCoverage = {
  entries: CarrierCoverageEntry[];
  supportedShipmentCount: number;
  unsupportedShipmentCount: number;
  unsupportedCarriers: string[];
  hasShipments: boolean;
};

export type AppBootstrap = {
  mode: "install" | "demo" | "live";
  prefilledShop: string;
  shop: ShopSummary | null;
  metrics: MetricCardData[];
  exceptionInbox: ExceptionRow[];
  exceptionDetails: ExceptionDetail[];
  recentShipments: MonitoredShipmentRow[];
  templates: TemplateRow[];
  timeline: TimelineEntry[];
  carrierReport: CarrierReportRow[];
  health: SyncHealthSummary;
  onboarding: OnboardingChecklist;
  backfill: BackfillStatus;
  carrierCoverage: CarrierCoverage;
  settings: AppSettingsSummary;
  assumptions: string[];
};
