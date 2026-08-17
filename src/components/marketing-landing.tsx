const features = [
  {
    title: "Exception detection",
    body: "Delays, failed deliveries, address issues, pickups, lost-in-transit, and no-movement — surfaced the moment the carrier scan says so.",
  },
  {
    title: "Proactive customer email",
    body: "Send the right message from a template automatically or by hand, so customers hear it from you before they open a ticket.",
  },
  {
    title: "Slack + daily digest",
    body: "Route high-risk exceptions into your team channel and get a once-a-day rollup by Slack or email.",
  },
  {
    title: "Priority that matches impact",
    body: "VIP tags, high-value orders, and expedited shipping lift ranking and urgency so the right shipments rise to the top.",
  },
  {
    title: "Next-best-action",
    body: "Resend, refund, wait, or trace — DelayRadar recommends the operational step for the highest-risk shipments.",
  },
  {
    title: "Works on your stack",
    body: "Tracking-first on EasyPost. Keep ShipStation, Shippo, or whatever you already use for labels — DelayRadar is the exception layer on top.",
  },
];

const steps = [
  {
    n: "1",
    title: "Connect your store",
    body: "Install from Shopify with read-only access to orders and fulfillments. We backfill your recent shipments automatically.",
  },
  {
    n: "2",
    title: "We watch every shipment",
    body: "DelayRadar tracks each parcel and flags exceptions as they happen, ranking them by real business impact.",
  },
  {
    n: "3",
    title: "You act before tickets land",
    body: "Send proactive updates, escalate to Slack, and follow the recommended next step — all without leaving the app.",
  },
];

const faqs = [
  {
    q: "Does DelayRadar change my shipping setup?",
    a: "No. It reads your orders and fulfillments (read-only) and monitors tracking. You keep your existing label and shipping tools.",
  },
  {
    q: "How much does it cost?",
    a: "$9.99/month with a 7-day free trial, billed through Shopify. Cancel anytime by uninstalling.",
  },
  {
    q: "Which carriers are supported?",
    a: "Tracking runs on EasyPost, which covers USPS, UPS, FedEx, DHL, and most major carriers.",
  },
  {
    q: "Do my customers get emails from my brand?",
    a: "Yes. Replies go to your address, and once your sending domain is verified, emails go out as your brand.",
  },
];

function DashboardMockup() {
  const rows = [
    { order: "#1042", customer: "Priya S.", type: "Delayed", risk: 56, tone: "warn" },
    { order: "#1038", customer: "Marcus L.", type: "Failed delivery", risk: 78, tone: "bad" },
    { order: "#1031", customer: "Ana R.", type: "No movement", risk: 72, tone: "bad" },
    { order: "#1029", customer: "Devi K.", type: "Address issue", risk: 61, tone: "warn" },
  ];

  return (
    <div className="lp-mockup" aria-hidden="true">
      <div className="lp-mockup-bar">
        <span className="badge hot">DelayRadar</span>
        <span className="badge">Exceptions inbox</span>
      </div>
      <div className="lp-mock-metrics">
        <div>
          <span className="lp-mock-metric-value">18</span>
          <span className="lp-mock-metric-label">Monitored</span>
        </div>
        <div>
          <span className="lp-mock-metric-value">4</span>
          <span className="lp-mock-metric-label">Open exceptions</span>
        </div>
        <div>
          <span className="lp-mock-metric-value">2</span>
          <span className="lp-mock-metric-label">Action needed</span>
        </div>
      </div>
      <div className="lp-mock-table">
        {rows.map((row) => (
          <div className="lp-mock-row" key={row.order}>
            <div className="lp-mock-order">
              <strong>{row.order}</strong>
              <span>{row.customer}</span>
            </div>
            <span className="lp-mock-type">{row.type}</span>
            <span className={`lp-mock-risk lp-mock-risk-${row.tone}`}>
              Risk {row.risk}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketingLanding() {
  return (
    <main className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="/">
          <span className="badge hot">DelayRadar</span>
        </a>
        <nav className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="/support">Support</a>
          <a className="button-secondary lp-nav-cta" href="#install">
            Install
          </a>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <span className="badge hot">For Shopify brands shipping 200–5,000 orders/mo</span>
          <h1 className="lp-headline">
            Catch delivery problems before they become “Where is my order?”
            tickets.
          </h1>
          <p className="lp-sub">
            DelayRadar watches every shipment, flags delays and failed
            deliveries the moment they happen, and helps you reach the customer
            first — so support stops drowning in WISMO.
          </p>

          <form
            id="install"
            className="lp-install-form"
            action="/auth/login"
            method="POST"
            target="_top"
          >
            <input
              className="input"
              type="text"
              name="shop"
              placeholder="your-store.myshopify.com"
              aria-label="Your Shopify store domain"
            />
            <button className="button" type="submit">
              Start free trial
            </button>
          </form>
          <p className="lp-hero-note">
            <strong>$9.99/mo</strong> · 7-day free trial ·{" "}
            <a href="/demo">see a live demo →</a>
          </p>
        </div>
        <div className="lp-hero-visual">
          <DashboardMockup />
        </div>
      </section>

      <section className="lp-problem">
        <div className="lp-problem-inner">
          <h2 className="lp-section-title">
            Every delayed package is a support ticket waiting to happen.
          </h2>
          <p className="lp-section-copy">
            Customers notice a stalled shipment before you do, and by the time
            they email “where is my order?”, the goodwill is already gone.
            DelayRadar flips that — you reach out first, with the right message,
            while there’s still time to fix it.
          </p>
        </div>
      </section>

      <section className="lp-section" id="how">
        <span className="eyebrow lp-eyebrow">How it works</span>
        <h2 className="lp-section-title">Live in minutes, useful on day one.</h2>
        <div className="lp-steps">
          {steps.map((step) => (
            <div className="lp-step" key={step.n}>
              <span className="lp-step-num">{step.n}</span>
              <h3 className="lp-step-title">{step.title}</h3>
              <p className="lp-step-copy">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section" id="features">
        <span className="eyebrow lp-eyebrow">What you get</span>
        <h2 className="lp-section-title">
          The exception layer for your shipping stack.
        </h2>
        <div className="lp-features">
          {features.map((feature) => (
            <div className="lp-feature" key={feature.title}>
              <h3 className="lp-feature-title">{feature.title}</h3>
              <p className="lp-feature-copy">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section lp-pricing-section" id="pricing">
        <span className="eyebrow lp-eyebrow">Pricing</span>
        <h2 className="lp-section-title">One simple plan.</h2>
        <div className="lp-pricing">
          <div className="lp-price-head">
            <span className="lp-price-amount">$9.99</span>
            <span className="lp-price-period">/ month</span>
          </div>
          <p className="lp-price-trial">7-day free trial · cancel anytime</p>
          <ul className="lp-price-list">
            <li>Unlimited monitored shipments</li>
            <li>Proactive customer email + templates</li>
            <li>Slack alerts and daily digest</li>
            <li>Priority rules and next-best-action</li>
            <li>Carrier &amp; lane exception reporting</li>
          </ul>
          <a className="button lp-price-cta" href="#install">
            Start free trial
          </a>
        </div>
      </section>

      <section className="lp-section" id="faq">
        <span className="eyebrow lp-eyebrow">FAQ</span>
        <h2 className="lp-section-title">Questions, answered.</h2>
        <div className="lp-faq">
          {faqs.map((faq) => (
            <div className="lp-faq-item" key={faq.q}>
              <h3 className="lp-faq-q">{faq.q}</h3>
              <p className="lp-faq-a">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-cta-band">
        <h2 className="lp-section-title">Stop chasing delayed packages.</h2>
        <a className="button lp-price-cta" href="#install">
          Start your free trial
        </a>
      </section>

      <footer className="lp-footer">
        <span className="badge hot">DelayRadar</span>
        <nav className="lp-footer-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/support">Support</a>
          <a href="mailto:support@delayradar.io">support@delayradar.io</a>
        </nav>
        <span className="lp-footer-fine">
          © 2026 Saleh &amp; Associates LLC. DelayRadar is a delivery-exception
          monitoring app for Shopify.
        </span>
      </footer>
    </main>
  );
}
