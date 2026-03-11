# DelayRadar

DelayRadar is an embedded Shopify app for delivery exception monitoring and proactive customer communication. The MVP is intentionally narrow: ingest Shopify fulfillments, register EasyPost trackers, rank exception risk, send proactive email, and escalate high-risk issues into Slack.

## Stack

- Shopify React Router template with React Router 7, Vite, and TypeScript
- Prisma + Postgres
- Shopify OAuth and webhook ingestion
- EasyPost tracking-first integration
- Queue table + worker script for tracker creation and notifications
- Neon-ready Prisma configuration using pooled and direct Postgres URLs

## What is included

- Embedded dashboard with overview, exceptions inbox, message templates, and settings
- Shopify install flow via OAuth callback routes
- Shopify webhook handler for `app/uninstalled`
- EasyPost webhook handler for tracker updates
- Prisma schema for shops, shipments, status events, templates, exception rules, Slack destinations, notifications, inbound webhooks, and queue jobs
- Worker script for background jobs:
  - create EasyPost trackers
  - send proactive exception emails
  - send Slack alerts and digests
  - backfill recent Shopify fulfillments

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables and fill in the real values:

```bash
cp .env.example .env
```

3. Run migrations and seed default data:

```bash
npm run db:deploy
npm run db:seed
```

4. Start Shopify CLI development:

```bash
npm run dev
```

This runs `shopify app dev` and uses the web command defined in [shopify.web.toml](/Users/mohamedsaleh/Desktop/Supabase Projects/delayradar/shopify.web.toml), so the local app URL stays aligned with the Shopify CLI tunnel while you develop.

5. Run the worker in a separate terminal:

```bash
npm run worker
```

## Shopify configuration

Update [shopify.app.toml](/Users/mohamedsaleh/Desktop/Supabase Projects/delayradar/shopify.app.toml) with your real Shopify app client ID and Vercel production URL. The web process is defined in [shopify.web.toml](/Users/mohamedsaleh/Desktop/Supabase Projects/delayradar/shopify.web.toml).

`shopify app dev` is configured and verified against the `euromrr-2.myshopify.com` dev store. Fulfillment webhooks are intentionally not subscribed in `shopify.app.toml` right now because Shopify blocks those topics until the app is approved for protected customer data. The existing backfill flow still works for development; add fulfillment webhook subscriptions back after protected data approval.

Required Shopify scopes for the MVP:

- `read_orders`
- `read_fulfillments`

## Environment variables

- `SHOPIFY_APP_URL`: public app URL for Shopify redirects
- `SHOPIFY_API_KEY`: Shopify API key / client ID
- `SHOPIFY_API_SECRET`: Shopify API secret
- `SCOPES`: Shopify scopes, usually injected by Shopify CLI during `shopify app dev`
- `DATABASE_URL`: Postgres connection string
- `DIRECT_URL`: direct Postgres connection string for Prisma migrations
- `EASYPOST_API_KEY`: EasyPost API key for tracker creation
- `EASYPOST_WEBHOOK_SECRET`: optional webhook secret for verifying EasyPost signatures
- `POSTMARK_SERVER_TOKEN` or `SENDGRID_API_KEY`: email delivery provider
- `SLACK_FALLBACK_WEBHOOK_URL`: optional future fallback

## MVP assumptions

- Single-store onboarding first
- EasyPost as the tracking provider for the first release
- Proactive email and Slack are in-scope; SMS, returns labels, and auto-refunds come later
- Existing shipping stack stays in place; DelayRadar monitors exceptions rather than replacing label tooling
