export function InstallPanel({
  shopInput,
  onShopInputChange,
  onPreviewDemoShop,
  isSaving,
  assumptions,
}: {
  shopInput: string;
  onShopInputChange: (value: string) => void;
  onPreviewDemoShop: () => void;
  isSaving: boolean;
  assumptions: string[];
}) {
  return (
    <div className="hero-grid">
      <div className="surface-panel install-card">
        <span className="eyebrow">Connect store</span>
        <h2 className="section-title">Install DelayRadar into Shopify</h2>
        <p className="section-copy">
          Enter a <span className="mono">.myshopify.com</span> domain to
          start OAuth. After install, DelayRadar seeds default email
          templates, registers webhook-driven ingestion, and queues an
          initial backfill of recent fulfillments.
        </p>
        <form
          action="/auth/login"
          method="POST"
          target="_top"
          className="install-form"
        >
          <input
            className="input"
            type="text"
            name="shop"
            placeholder="your-store.myshopify.com"
            value={shopInput}
            onChange={(event) => onShopInputChange(event.target.value)}
          />
          <button className="button" type="submit">
            Connect Shopify store
          </button>
        </form>
        <button
          className="button-secondary"
          type="button"
          onClick={onPreviewDemoShop}
          disabled={isSaving}
        >
          Preview with demo shop
        </button>
        <p className="microcopy" style={{ marginTop: "0.75rem" }}>
          <strong>$9.99/month</strong> · 7-day free trial · cancel anytime by
          uninstalling.
        </p>
        <p className="microcopy">
          <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> ·{" "}
          <a href="/support">Support</a>
        </p>
      </div>

      <div className="surface-panel stack">
        <span className="eyebrow">What you get</span>
        <div className="callout">
          <strong>Works on top of your existing shipping stack</strong>
          <p className="microcopy">
            DelayRadar monitors carrier tracking for exceptions — delays, failed
            deliveries, and lost packages — so you can keep ShipStation, Shippo,
            or whatever label tools you already use.
          </p>
        </div>
        <div className="timeline">
          {assumptions.map((item) => (
            <div className="timeline-item" key={item}>
              <span className="timeline-mark" />
              <div className="timeline-body">
                <strong>{item}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
