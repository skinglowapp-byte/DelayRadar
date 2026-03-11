# DelayRadar Roadmap

This roadmap is optimized around the strongest MVP wedge: exception operations for Shopify brands. The product should feel carrier-agnostic and rules-driven, not like a replacement for the merchant's shipping stack.

## Product principles

- Keep one tracking provider for MVP, but present DelayRadar as the exception layer on top of any shipping stack
- Optimize for support leads and ops managers at brands shipping roughly 200 to 5,000 orders per month
- Treat normalized shipment states, exception rules, notification rules, and action history as the real product model
- Prove visibility first, then prove WISMO reduction, then add workflow depth and automation

## Version 1.0 ship line

This is the smallest version worth charging early users for:

- Shopify install and store connection
- Fulfillment sync and tracked shipment creation
- One tracking provider with webhook ingestion
- Exception normalization into a tight initial set
- Exceptions inbox with shipment detail context
- Manual email send using templates
- Daily digest
- Basic settings page

## Phase 0: Foundations

Status: complete

- Shopify app, OAuth, embedded shell, and Neon/Vercel setup
- Prisma schema for shops, shipments, events, templates, rules, jobs, and notifications
- Tracking-first ingestion and worker job processing
- Production deployment and Shopify dev workflow

## Phase 1: Exception Visibility

Status: complete

Goal: show merchants which shipments need attention and make that value obvious immediately.

Scope:

- Shopify connect, fulfillment ingestion, and tracked shipment creation
- Normalize shipment activity into a tight first exception set:
  - delayed in transit
  - failed delivery
  - address issue
  - available for pickup
  - no tracking movement threshold
- Dashboard with monitored shipments, open exceptions, and recent activity
- Exceptions inbox with filters for status, carrier, date, order, and customer
- Shipment detail context with event timeline, latest checkpoint, and recommended next action
- Keep manual backfill as the primary development ingestion path until protected customer data approval is granted

Current slices:

- Complete: store health, recent monitored shipments, tracker backlog visibility, and sync feedback
- Complete: exception filters, shipment detail panel, and notification visibility in the inbox workflow
- Complete: date-oriented triage views and no-movement threshold surfacing for stale tracked shipments
- Next: move into manual send and merchant-controlled messaging from the shipment context

Acceptance criteria:

- An installed store can see tracked shipments even when there are zero active exceptions
- Support can isolate urgent exceptions in a few clicks
- Each exception has enough timeline context to decide what to do without leaving the app
- A merchant can look at the inbox and immediately understand the value proposition

Success signal:

- Merchant reaction is effectively: "This saves my support team time."

## Phase 2: Proactive Customer Comms

Status: complete

Goal: reduce inbound WISMO tickets with clear merchant-controlled communication.

Scope:

- Email templates for each core exception type
- Manual send first, then optional auto-send once the message flow is validated
- Separate "action needed" versus "FYI" message paths
- Per-store notification settings:
  - notify on delayed
  - notify on failed delivery
  - notify on pickup available
  - notify after X days of no tracking movement
- Message history on each shipment
- Persist sent, skipped, and failed notification outcomes

Current slices:

- Complete: manual email send from the shipment detail panel with persisted notification history
- Complete: merchant-controlled notification toggles and no-movement thresholds in settings
- Complete: action-needed versus FYI message paths with template preview and test-send polish
- Next: move into Slack alerts and the first daily digest loop

Acceptance criteria:

- A merchant can send the right message from a shipment detail view without leaving the app
- The app shows which message was sent, to whom, and with what outcome
- Early users leave notifications enabled because the workflow is useful, not noisy

## Phase 3: Internal Alerts And Digest

Status: complete

Goal: make DelayRadar part of the daily ops rhythm, not just a dashboard.

Scope:

- Slack alerts for high-risk exceptions
- Daily digest via email or Slack
- Escalation thresholds and duplicate suppression
- Priority rules for cases such as VIP orders, high order value, express shipments, and rising lost-in-transit risk

Current slices:

- Complete: Slack shipment alerts now respect rule thresholds, suppress duplicates, and persist to notification history
- Complete: merchants can test Slack delivery and queue a digest from settings without leaving the app
- Complete: automatic digest scheduling via cron and Slack exception-type controls for noise reduction
- Complete: VIP, high-value, and expedited-order priority rules now lift inbox ranking and Slack urgency based on business impact
- Complete: internal workflow with assignment, review, snooze, resolve, and notes shipped in Phase 4

Acceptance criteria:

- High-risk exceptions route into the team's working channel reliably
- Digests summarize unresolved exceptions without spamming the team
- Merchants can trust DelayRadar to surface what matters most each day

## Phase 4: Internal Workflow

Status: complete

Goal: help teams manage exceptions collaboratively once alerts are flowing.

Scope:

- Assign, mark reviewed, and snooze actions
- Internal notes on shipments
- Open versus resolved workflow states
- Review history so teams know what was already handled

Current slices:

- Complete: workflow state (open, snoozed, resolved) and assignment fields on shipments with Prisma migration
- Complete: unified workflow API route handling assign, review, snooze, resolve, reopen, and add_note actions
- Complete: workflow action bar in the exception detail panel with inline assign, snooze presets, review, resolve, and reopen controls
- Complete: internal team notes section with add/view on each shipment exception
- Complete: workflow state filter in the exceptions inbox and state indicators on table rows
- Complete: recommendations, automation, and next-best-action logic shipped in Phase 5

Acceptance criteria:

- Teams can coordinate exception handling without external spreadsheets or ad hoc Slack threads
- Exception ownership and review state are visible inside the app

## Phase 5: Recommendations And Automation

Status: complete

Goal: turn detection into the next best action.

Scope:

- Recommend resend, refund, or wait logic
- Lost-in-transit threshold rules
- Auto-create support tasks
- Optional replacement or return workflows
- Carrier and lane exception reporting

Current slices:

- Complete: recommendation engine evaluating exception type, age, risk, priority, and delivery attempts to produce typed verdicts (resend, refund, wait, contact customer, carrier trace, replacement review)
- Complete: lost-in-transit threshold configurable per shop (default 7 days) with automatic escalation to resend/refund recommendations
- Complete: recommendation card in exception detail panel with confidence indicator, reasoning list, accept/override actions, and automatable badge
- Complete: carrier and lane exception reporting tab showing per-carrier exception rates, top exception types, lost-in-transit counts, and average resolution time
- Complete: accept_recommendation workflow action that resolves the exception and records the decision as a team note
- Next: move into hardening, onboarding polish, and launch readiness

Acceptance criteria:

- DelayRadar can suggest the next operational step for the highest-risk shipments
- Merchants start to rely on the app for decisions, not only visibility

## Phase 6: Hardening And Launch Readiness

Status: complete

Goal: move from pilot-ready MVP to a durable installable product.

Scope:

- Re-enable fulfillment webhooks after Shopify protected customer data approval
- Tighten idempotency, retry visibility, and operational diagnostics
- Improve onboarding, validation, and empty states for real merchants
- Add observability around sync health, notification failures, and worker backlog

Current slices:

- Complete: webhook idempotency via unique idempotencyKey on InboundWebhook with deduplication in both Shopify and EasyPost webhook handlers
- Complete: hasActiveJob guard to prevent duplicate job creation, cron endpoint to unstick stalled processing jobs
- Complete: operational health dashboard in Settings showing sync age, shipment counts, webhook/notification stats, worker backlog, and failed job retry
- Complete: onboarding checklist on Overview tab with 7-step guided setup progress bar (install, auth, sync, shipments, trackers, templates, Slack)
- Complete: health API endpoint and job retry endpoint for programmatic observability
- Next: move into Shopify protected customer data approval and production pilot

Acceptance criteria:

- DelayRadar stays in sync without manual intervention
- Core workflows are observable enough to support pilot stores and early paid users
