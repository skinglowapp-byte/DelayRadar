# DelayRadar — Shopify App Store submission kit

Everything you paste into the Partner Dashboard, plus the protected-customer-data
request answers. Partner Dashboard: https://partners.shopify.com →
Apps → DelayRadar.

---

## 1. App Store listing

Partner Dashboard → your app → **Distribution → Manage listing** (create an
"App Store listing" if you don't have one yet).

### App icon
Use `Documents for Apps/DelayRadar Shopify Items/DelayRadar_Logo_Shopify.png`
(Shopify wants a 1200×1200 PNG, no rounded corners, no text baked in — crop/pad
if needed).

### App name (30 char max)
```
DelayRadar
```

### App card subtitle / tagline (62 char max)
```
Catch delivery delays before they become support tickets
```

### App introduction (100 char max — one sentence)
```
Monitor every shipment for delays and failed deliveries, and message customers before they ask.
```

### App details (500 char max)
```
DelayRadar is the exception layer on top of your existing shipping stack. It watches every fulfillment for delays, failed deliveries, address issues, no-movement, and lost-in-transit — then helps you reach the customer first with proactive email. High-risk exceptions escalate to Slack, a daily digest keeps your team aligned, and priority rules surface VIP and high-value orders. Read-only access, tracking-first on EasyPost, and it works alongside ShipStation, Shippo, or whatever you already use.
```

### Feature list (3–5 features; short heading + one line each)
```
Exception detection — Delays, failed deliveries, address issues, pickups, no-movement, and lost-in-transit, flagged the moment the carrier scan says so.

Proactive customer email — Automatic or one-click messages from templates, so customers hear it from you before they open a ticket.

Slack alerts & daily digest — Route high-risk exceptions to your team channel and get a once-a-day rollup by Slack or email.

Priority that matches impact — VIP tags, high-value orders, and expedited shipping lift ranking and urgency.

Next-best-action — Resend, refund, wait, or trace, recommended for the highest-risk shipments.
```

### Demo store URL
```
https://www.delayradar.io/demo
```
(This is the read-only demo dashboard route added with the landing page.)

### Screenshots (minimum 3, 1600×900 PNG)
Capture these from the app (use the demo at /demo so there's realistic data):
1. **Exceptions inbox** — the list with risk pills and filters.
2. **Shipment detail panel** — timeline + recommended next action + send email.
3. **Overview** — metrics + recently tracked shipments + onboarding checklist.
4. (optional) **Settings** — notification rules / Slack / sender.
5. (optional) **Reports** — carrier exception rates.
Tip: on macOS, Shift-Cmd-4 then Space to grab a clean window; scale to 1600×900.

### Pricing
- Plan name: **Monthly**
- Price: **$9.99 / month**
- Free trial: **7 days**
- (Matches the billing block in `app/shopify.server.ts` and the /terms page.)

### Resources
- Privacy policy URL: `https://www.delayradar.io/privacy`
- FAQ / support URL: `https://www.delayradar.io/support`
- Support email: `support@delayradar.io`  ← must actually receive mail

### Category & search terms
- Primary category: **Orders and shipping** → Fulfillment / Order tracking
- Search terms: `shipping, tracking, delivery, delays, WISMO, order tracking,
  customer notifications, exceptions, EasyPost`

### Works with
```
EasyPost, Slack, Postmark, SendGrid
```

---

## 2. Protected customer data access

DelayRadar reads customer name, email, and phone to send delivery notifications —
that is **protected customer data**, so Shopify requires this approval before the
`fulfillments/create` and `fulfillments/update` webhooks (already in
`shopify.app.toml`) will actually deliver.

Partner Dashboard → your app → **API access → Protected customer data access →
Request access**.

### What to request
- **Protected customer data (Level 1):** Yes.
- **Protected customer fields (Level 2):** request **Name**, **Email**, **Phone**.
  (Address is optional — only request it if you later use the delivery
  destination; today the app stores name/email/phone.)

### Reason for access (paste per prompt)
```
DelayRadar monitors each order's shipment for delivery exceptions and sends the
customer proactive delivery-status emails on the merchant's behalf. We use the
customer's name to personalize the message, their email to send it, and their
phone only where the merchant enables SMS-style contact. We do not use customer
data for advertising, profiling, or resale.
```

### Data-handling attestations (all true for DelayRadar — check each "yes")
- **Only request data you need:** Yes — scopes are `read_orders`,
  `read_fulfillments` only; we store name/email/phone and shipment fields.
- **Encrypt in transit:** Yes — all traffic is HTTPS; webhooks are HMAC-verified.
- **Encrypt at rest:** Yes — the Shopify offline access token is AES-256-GCM
  encrypted; data is stored in a managed Postgres (Neon) with encryption at rest.
- **Data minimization / retention:** Yes — processed webhook records are pruned
  after 30 days and completed jobs after 14 days; we keep only what's needed to
  monitor shipments.
- **Customer data-request & erasure:** Yes — `customers/data_request`,
  `customers/redact`, and `shop/redact` webhooks are implemented (they scrub
  shipment records, notification logs, and stored payloads).
- **Limit staff access:** Yes — production data access is restricted to the app
  operator.
- **Published privacy policy:** Yes — https://www.delayradar.io/privacy

### After approval
Nothing to redeploy — the `fulfillments/create` / `fulfillments/update`
subscriptions are already declared in `shopify.app.toml`. Once Shopify grants
access, run `shopify app deploy` (needs your login) to (re)register them, and
real-time exception detection starts flowing instead of only the backfill.
```
shopify app deploy
```

---

## Note on `shopify app deploy`
Nothing in `shopify.app.toml` changed this session, so you do **not** need to run
it now. You only need it after protected-data approval (to activate the
fulfillment webhooks), or any time you edit the app config.
