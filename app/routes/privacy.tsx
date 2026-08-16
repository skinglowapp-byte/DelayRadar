export function meta() {
  return [
    { title: "Privacy Policy — DelayRadar" },
    {
      name: "description",
      content:
        "How DelayRadar collects, uses, retains, and deletes store and customer data for delivery-exception monitoring.",
    },
  ];
}

export default function PrivacyPolicyRoute() {
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
      <h1>Privacy Policy</h1>
      <p>
        <strong>Last updated:</strong> March 17, 2026
      </p>

      <h2>What data we collect</h2>
      <p>
        DelayRadar collects the minimum data needed to monitor delivery
        exceptions for your Shopify store:
      </p>
      <ul>
        <li>
          <strong>Store information:</strong> Your Shopify store domain, name,
          email, timezone, and currency (provided during OAuth installation).
        </li>
        <li>
          <strong>Fulfillment data:</strong> Order names, tracking numbers,
          carrier names, and shipping method labels from your Shopify
          fulfillments.
        </li>
        <li>
          <strong>Customer contact info:</strong> Customer name, email, and
          phone number associated with fulfilled orders — used solely to send
          proactive delivery notifications on your behalf.
        </li>
        <li>
          <strong>Tracking events:</strong> Carrier status updates from
          EasyPost, including timestamps, status codes, and exception details.
        </li>
      </ul>

      <h2>How we use your data</h2>
      <ul>
        <li>Detect and surface delivery exceptions (delays, failed deliveries, lost packages).</li>
        <li>Send proactive customer emails and Slack alerts that you configure.</li>
        <li>Generate carrier performance reports and risk scoring.</li>
        <li>Power the exceptions inbox, workflow management, and daily digests.</li>
      </ul>

      <h2>Data sharing</h2>
      <p>
        We do not sell or share your data with third parties. Data is shared
        only with the services you configure:
      </p>
      <ul>
        <li><strong>EasyPost</strong> — tracking numbers are sent to create tracker webhooks.</li>
        <li><strong>Postmark or SendGrid</strong> — customer emails are sent through your configured email provider.</li>
        <li><strong>Slack</strong> — exception alerts are sent to your configured Slack webhook.</li>
      </ul>

      <h2>Where your data is stored (sub-processors)</h2>
      <p>
        DelayRadar runs on Vercel (application hosting) and stores data in a
        Neon PostgreSQL database, both located in the United States. Tracking is
        performed by EasyPost, and, where you configure them, email is delivered
        by Postmark or SendGrid and alerts by Slack. Your data is shared with
        these processors only to provide the service described above.
      </p>

      <h2>Data retention and deletion</h2>
      <p>
        Store and shipment records are retained for as long as the app is
        installed. Operational logs are pruned automatically: processed webhook
        records after 30 days and completed background jobs after 14 days.
      </p>
      <p>
        When you uninstall DelayRadar, your access token is immediately revoked.
        If Shopify sends a <em>shop/redact</em> request, all data for that shop
        — including shipments, status events, templates, notifications, notes,
        queued jobs, and stored webhook payloads — is permanently deleted.
      </p>
      <p>
        When Shopify sends a <em>customers/redact</em> request, that customer&rsquo;s
        personal information is scrubbed everywhere we hold it: shipment records,
        notification logs (recipient, subject, and body), and stored tracking
        event payloads.
      </p>

      <h2>Data security</h2>
      <p>
        Your Shopify offline access token is encrypted at rest (AES-256-GCM).
        All API communication uses HTTPS. Inbound webhook payloads are verified
        using HMAC signatures, and signature headers are not retained. Write
        operations require a verified Shopify session token (JWT), and every
        query is scoped to your store.
      </p>

      <h2>Your rights</h2>
      <p>
        You may request a copy of your data or request deletion at any time by
        contacting us. Uninstalling the app triggers automatic data cleanup.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions or data requests, contact us at{" "}
        <a href="mailto:support@delayradar.io">support@delayradar.io</a>.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <a href="/terms">Terms of Service</a>
        </li>
        <li>
          <a href="/support">Support</a>
        </li>
      </ul>
    </main>
  );
}
