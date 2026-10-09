# ReturnSense SEO operating brief

## Positioning

ReturnSense should not compete as "another Shopify tracking app" or "another Shopify returns app." The category language is:

- Shopify post-purchase recovery command center
- Post-purchase margin protection for Shopify
- Carrier exception intelligence for Shopify
- Carrier lane intelligence for Shopify operations
- Refund, resend, and replacement decision engine

The homepage should keep saying that ReturnSense works in the messy middle after checkout: when a carrier issue can still be converted into the right customer, support, refund, resend, or retention decision.

## Technical SEO

- Crawlable pages: `/` only for organic ranking until content hubs exist.
- Support/legal/demo pages: reachable from navigation/footer, but `noindex,follow`.
- Block app surfaces: `robots.txt` disallows `/app`, `/api`, and `/auth`.
- Sitemap: includes only indexable public URLs.
- Canonical: homepage canonical points to `https://www.delayradar.io/` until a ReturnSense domain is live.
- Rendering: the public landing route is server-rendered by React Router, so primary content is available without client-only rendering.
- Performance: avoid large hero media until optimized assets exist. If adding screenshots, use compressed WebP/AVIF, fixed dimensions, descriptive alt text, and lazy loading below the first viewport.
- Redirects: when `returnsense.*` goes live, use one-hop 301 redirects from the old DelayRadar public URLs to matching ReturnSense URLs. Do not chain domain redirect plus path redirect.
- Facets/pagination: none today. If content hubs add tags or filters, keep filtered combinations out of the sitemap and canonicalize to the main hub.

## Keyword Clusters

Primary commercial cluster:
- Shopify post-purchase recovery command center
- Shopify margin protection app
- Shopify carrier exception intelligence
- Shopify refund decision engine
- Shopify retention recovery app

Operational long-tail cluster:
- Shopify failed delivery customer recovery
- Shopify package no movement workflow
- Shopify return to sender automation
- Shopify delivery exception Slack alerts
- carrier lane performance Shopify

Comparison cluster:
- AfterShip alternative for delivery exceptions
- Shopify tracking app versus recovery app
- best Shopify app to reduce WISMO tickets
- Shopify app for post-checkout support decisions

Question cluster:
- How do I prevent returns from delayed shipments?
- What should support do when a package stops moving?
- When should a Shopify merchant resend instead of refund?
- How do failed deliveries become returns?

## Content Plan

Pillar page:
- `/post-purchase-recovery` — define the category, explain tracking vs returns vs recovery, show workflows and decision examples.

Cluster pages:
- `/delivery-exception-recovery`
- `/returns-prevention`
- `/carrier-lane-intelligence`
- `/refund-resend-decision-engine`
- `/klaviyo-delivery-exception-flows`
- `/shopify-wismo-reduction`

Original data moat:
- Publish anonymized monthly benchmarks once enough stores exist: exception rate by carrier/service level, no-movement windows, pickup-risk patterns, and recovery action outcomes.
- Use careful language: "observed," "estimated," "benchmarked," and "merchant-approved outcomes" instead of unsupported saved-revenue claims.

## Off-Page SEO

- Digital PR angle: "The hidden gap between tracking apps and returns apps is where merchants lose margin."
- Partner content: Shopify agencies, 3PL consultants, retention marketers, Klaviyo email specialists, and CX operations newsletters.
- Resource pages: pitch ReturnSense as a recovery workflow tool for Shopify CX and operations stacks, not a status-page replacement.
- Podcasts/interviews: focus on post-purchase margin leakage, refund prevention, and delivery recovery playbooks.
- Backlink monitoring: reclaim unlinked mentions for ReturnSense and DelayRadar during the rename window.
- Toxic links: do not disavow unless Search Console shows a manual action or clear spam attack.

## GEO and AI Search

- Keep `llms.txt` short, factual, and answer-oriented.
- Use answer-first page sections with extractable definitions.
- Add quotable statistics only when ReturnSense has real anonymized data.
- Build entity consistency: ReturnSense, Saleh & Associates LLC, Shopify post-purchase recovery, delivery exception recovery, returns prevention.
- Participate in merchant forums with useful workflows, not promotional drops.

## SERP Features

- FAQ rich result support is covered by homepage JSON-LD.
- Featured snippet targets should answer:
  - "What is post-purchase recovery?"
  - "How do you prevent returns caused by delivery issues?"
  - "When should a merchant resend instead of refund?"
- Sitelinks depend on stronger content architecture. Add focused hub pages before expecting them.
- Review stars require eligible third-party review sources; do not add fake Review schema.
