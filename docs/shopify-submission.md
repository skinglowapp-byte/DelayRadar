# ReturnSense — Shopify App Store submission kit

Everything you paste into the Partner Dashboard, plus the protected-customer-data
request answers. Partner Dashboard: https://partners.shopify.com →
Apps → ReturnSense.

---

## 1. App Store listing

This is the combined app (DelayRadar + ReturnSense), client_id
`4801d24015598934b6c447731cbac1a6`. Edit the listing on THIS app in the
Partner Dashboard (the one originally named DelayRadar). The old standalone
ReturnSense app (client_id `fda68ea2…`, returnsenseapp.com) is being retired
and must not carry this listing.

Partner Dashboard → your app → **Distribution → Manage listing**.

### App icon
1200×1200 PNG, no rounded corners, no text baked in. Needs a ReturnSense icon:
the one in `Documents for Apps/DelayRadar Shopify Items/` is still DelayRadar.

### App name (30 char max)
```
ReturnSense
```

### App card subtitle (62 char max)
```
Stop failed deliveries from turning into refunds and returns.
```

### App introduction (100 char max)
```
Catch failed deliveries early, reach the customer first, and prevent the refund or return.
```

### App details (500 char max)
```
ReturnSense is the post-purchase recovery app for Shopify. It watches every fulfillment for delays, failed attempts, address issues, stalled packages, and lost-in-transit, ranks each case by what it will cost you, and contacts the customer before they contact you. Support gets a clear next step for every case: wait, trace, resend, exchange, or refund review. Alerts flow into Klaviyo and Slack. Works alongside AfterShip, ShipStation, and your returns app.
```

### Features (80 char max each)
```
Catches failed deliveries, address issues, and stalled or lost packages early
Emails the customer from your brand before they open a ticket
Ranks every case by order value, VIP status, and shipping speed
Recommends wait, trace, resend, exchange, or refund for each shipment
Sends exception events to Klaviyo flows and alerts to Slack
```

### Demo store URL
```
https://www.delayradar.io/demo
```

### Screenshots (minimum 3, 1600×900 PNG)
Retake under the ReturnSense name (the March set shows DelayRadar). Use /demo:
1. **Exceptions inbox**: list with risk pills and filters.
2. **Exception detail**: timeline, recommended action, send email.
3. **Returns prevention tab**: preventable-return risk and refund reviews.
4. **Overview**: metrics and onboarding checklist.
5. (optional) **Reports**: carrier lane exception rates.

### Pricing (Managed Pricing in the Partner Dashboard, never in code)
- Plan name: **Starter** (must match `PLAN_SHIPMENT_LIMITS` in
  `src/lib/plans.ts` exactly; a plan named anything else silently falls back to
  the default allowance)
- Price: **$9.99 / month**, 7-day free trial
- Includes 500 tracked shipments per month
- The app must not call the Billing API. The `$9.99` strings on the landing
  page and /terms are display only; keep them in sync by hand.

### Resources
- Privacy policy: `https://www.delayradar.io/privacy`
- Support / FAQ: `https://www.delayradar.io/support`
- Support email: `support@delayradar.io` (must actually receive mail)

### Category & search terms
- Primary category: **Orders and shipping** → Order tracking
- Search terms: `failed delivery`, `shipping exceptions`, `WISMO`,
  `returns prevention`, `delivery alerts`

### Works with
```
Klaviyo, Slack, EasyPost, Postmark, SendGrid
```

---

## 2. Protected customer data access

ReturnSense reads customer name, email, and phone to send delivery notifications —
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
ReturnSense monitors each order's shipment for delivery exceptions and sends the
customer proactive delivery-status emails on the merchant's behalf. We use the
customer's name to personalize the message, their email to send it, and their
phone only where the merchant enables SMS-style contact. We do not use customer
data for advertising, profiling, or resale.
```

### Data-handling attestations (all true for ReturnSense — check each "yes")
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
