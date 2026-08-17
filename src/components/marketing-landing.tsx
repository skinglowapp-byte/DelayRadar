const features = [
  {
    title: "Catches what tracking pages don't",
    body: "Delays, failed attempts, address issues, uncollected pickups, lost-in-transit, and packages that simply stopped scanning — the exceptions, not the happy path.",
  },
  {
    title: "Reaches the customer first",
    body: "The right message goes out automatically, from your brand, while there's still time to fix it — not after they've emailed you.",
  },
  {
    title: "Fires into the tools you already use",
    body: "Push the exception into Klaviyo as an event and run it through your own branded flows. Or route it to Slack. DelayRadar doesn't ask your team to live in another dashboard.",
  },
  {
    title: "Triages by what it costs you",
    body: "VIP tags, high-value orders, and expedited shipping lift a shipment's rank, so the parcel that will hurt most gets handled first.",
  },
  {
    title: "Tells you what to do about it",
    body: "Resend, refund, wait, or trace — every high-risk shipment carries a recommended next step, so recovery isn't a judgement call every time.",
  },
  {
    title: "Sits on top of your stack",
    body: "Keep ShipStation, Shippo, AfterShip, or whatever you already run. DelayRadar is the recovery layer, not a replacement.",
  },
];

const steps = [
  {
    n: "1",
    title: "Connect your store",
    body: "Install from Shopify with read-only access to orders and fulfillments. Your recent shipments are backfilled automatically.",
  },
  {
    n: "2",
    title: "We watch for trouble",
    body: "Every parcel is monitored for the scans that mean something has gone wrong — and ranked by what that failure will actually cost you.",
  },
  {
    n: "3",
    title: "Recovery starts on its own",
    body: "The customer hears from you, your team gets the alert where they already work, and the next step is already decided.",
  },
];

const faqs = [
  {
    q: "I already use AfterShip / 17TRACK / ParcelPanel. Why would I add this?",
    a: "Keep them. Those tools tell your customer where the parcel is — they're built around the shipment that arrives fine. DelayRadar is built around the one that doesn't: it detects the failure, decides how much it matters, contacts the customer, and tells your team what to do. If your tracking app already recovers your failed deliveries for you, you don't need us.",
  },
  {
    q: "Does DelayRadar change my shipping setup?",
    a: "No. It reads your orders and fulfillments (read-only) and monitors tracking. You keep your existing label, tracking, and shipping tools.",
  },
  {
    q: "Do I have to work inside another dashboard?",
    a: "No. Exceptions can fire into Klaviyo as an event so they run through your existing flows, or into Slack where your team already is. The dashboard is there when you want it, not a place you have to live.",
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
    a: "Yes. Replies go to your address, and once your sending domain is verified, emails go out as your brand. Or skip our sender entirely and run the whole thing through your Klaviyo.",
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
          <a href="#compare">vs. tracking apps</a>
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
            We don’t track your shipments. We rescue the ones going wrong.
          </h1>
          <p className="lp-sub">
            Keep your tracking app. DelayRadar handles the deliveries that
            fail — it catches the delay, the failed attempt, the parcel that
            stopped scanning, contacts the customer before they contact you,
            and tells your team exactly what to do next.
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
            Tracking tells your customer where the parcel is. It doesn’t do
            anything when the parcel is stuck.
          </h2>
          <p className="lp-section-copy">
            Your tracking page is built for the shipment that arrives. The one
            that doesn’t arrive becomes an angry email, a refund request, and a
            customer who doesn’t order again — and you find out about it days
            late, from them. DelayRadar exists for that shipment: it notices
            first, reaches out first, and hands your team a decision instead of
            a mystery.
          </p>
        </div>
      </section>

      <section className="lp-section" id="how">
        <span className="eyebrow lp-eyebrow">How it works</span>
        <h2 className="lp-section-title">
          Detect, triage, contact, resolve — without you watching.
        </h2>
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

      <section className="lp-section" id="compare">
        <span className="eyebrow lp-eyebrow">Already have a tracking app?</span>
        <h2 className="lp-section-title">Good. Keep it.</h2>
        <p className="lp-section-copy">
          DelayRadar isn’t a tracking page, a branded order-status portal, or
          another notification tool competing for the same job. Those tools are
          designed around the shipment that goes fine — they show progress and
          send “out for delivery”. DelayRadar is designed around the shipment
          that goes wrong, and it starts working at the exact moment the others
          run out of things to say. Install it alongside whatever you already
          run; it reads your Shopify orders directly and doesn’t touch your
          existing setup.
        </p>
      </section>

      <section className="lp-section" id="features">
        <span className="eyebrow lp-eyebrow">What you get</span>
        <h2 className="lp-section-title">
          The recovery layer for your shipping stack.
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
            <li>Up to 500 monitored shipments a month</li>
            <li>Proactive customer email + templates</li>
            <li>Klaviyo events and Slack alerts</li>
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
        <h2 className="lp-section-title">
          Stop finding out from the customer.
        </h2>
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
          recovery app for Shopify.
        </span>
      </footer>
    </main>
  );
}
