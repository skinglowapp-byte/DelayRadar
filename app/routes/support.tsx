export default function SupportRoute() {
  return (
    <main
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "2rem 1rem",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        lineHeight: 1.6,
        color: "#1a1a1a",
      }}
    >
      <h1>Support</h1>

      <p>
        Need help with DelayRadar? We're here for you. Reach out using any of
        the options below and we'll get back to you as quickly as possible.
      </p>

      <h2>Email Support</h2>
      <p>
        Send us an email at{" "}
        <a href="mailto:support@delayradar.io">support@delayradar.io</a> and
        we'll respond within one business day.
      </p>
      <p>When contacting support, please include:</p>
      <ul>
        <li>Your Shopify store domain (e.g. your-store.myshopify.com)</li>
        <li>A description of the issue or question</li>
        <li>Any relevant tracking numbers or order names</li>
        <li>Screenshots if applicable</li>
      </ul>

      <h2>Common Questions</h2>

      <h3>How do I connect my store?</h3>
      <p>
        Install DelayRadar from the Shopify App Store. The app will guide you
        through OAuth authorization and automatically run your first fulfillment
        sync.
      </p>

      <h3>How do I set up email notifications?</h3>
      <p>
        Go to the <strong>Settings</strong> tab in DelayRadar and configure your
        email provider (Postmark or SendGrid). Then customize your notification
        templates in the <strong>Templates</strong> tab.
      </p>

      <h3>How do I connect Slack?</h3>
      <p>
        In the <strong>Settings</strong> tab, paste your Slack incoming webhook
        URL. You can use the "Send test" button to verify the connection before
        enabling exception alerts and daily digests.
      </p>

      <h3>What tracking providers are supported?</h3>
      <p>
        DelayRadar currently uses EasyPost for carrier tracking. This works
        with all major carriers (USPS, UPS, FedEx, DHL, and more) without
        changing your existing shipping tools.
      </p>

      <h3>How do I uninstall?</h3>
      <p>
        You can uninstall DelayRadar from your Shopify admin under{" "}
        <strong>Apps</strong>. Your access token is revoked immediately and all
        data is deleted upon receiving Shopify's data erasure request.
      </p>

      <h2>Legal</h2>
      <ul>
        <li>
          <a href="/privacy">Privacy Policy</a>
        </li>
        <li>
          <a href="/terms">Terms of Service</a>
        </li>
      </ul>
    </main>
  );
}
