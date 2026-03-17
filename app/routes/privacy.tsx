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

      <h2>Data retention and deletion</h2>
      <p>
        Your data is retained for as long as the app is installed. When you
        uninstall DelayRadar, your access token is immediately revoked. If
        Shopify sends a <em>shop/redact</em> request, all shop data —
        including shipments, templates, notifications, and notes — is
        permanently deleted within 48 hours.
      </p>
      <p>
        Customer personal information (name, email, phone) is scrubbed from
        shipment records when Shopify sends a <em>customers/redact</em>{" "}
        request.
      </p>

      <h2>Data security</h2>
      <p>
        Access tokens are encrypted at rest. All API communication uses HTTPS.
        Webhook payloads are verified using HMAC signatures. Write operations
        require a verified Shopify session token (JWT).
      </p>

      <h2>Your rights</h2>
      <p>
        You may request a copy of your data or request deletion at any time by
        contacting us. Uninstalling the app triggers automatic data cleanup.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions or data requests, contact us at{" "}
        <strong>privacy@delayradar.io</strong>.
      </p>
    </main>
  );
}
