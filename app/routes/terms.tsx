export default function TermsOfServiceRoute() {
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
      <h1>Terms of Service</h1>
      <p>
        <strong>Last updated:</strong> March 17, 2026
      </p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By installing or using DelayRadar ("the App"), you agree to these Terms
        of Service. If you do not agree, please uninstall the App immediately.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        DelayRadar is an embedded Shopify app that monitors delivery exceptions,
        surfaces shipment risk, and enables proactive customer communication. The
        App integrates with your Shopify store, EasyPost for tracking, and
        optional email (Postmark/SendGrid) and Slack services that you configure.
      </p>

      <h2>3. Account and Access</h2>
      <ul>
        <li>
          You must have an active Shopify store to use DelayRadar.
        </li>
        <li>
          The App requests read-only access to your orders and fulfillments
          (<code>read_orders</code>, <code>read_fulfillments</code>). It does
          not modify your Shopify store data.
        </li>
        <li>
          You are responsible for keeping your third-party API credentials
          (EasyPost, Postmark, SendGrid, Slack) secure.
        </li>
      </ul>

      <h2>4. Data and Privacy</h2>
      <p>
        Your use of the App is also governed by our{" "}
        <a href="/privacy">Privacy Policy</a>. We collect only the minimum data
        necessary to provide delivery exception monitoring and proactive
        notifications.
      </p>

      <h2>5. Customer Communications</h2>
      <p>
        DelayRadar sends emails and Slack messages on your behalf based on the
        rules and templates you configure. You are responsible for ensuring that
        your customer communications comply with applicable laws, including
        CAN-SPAM, GDPR, and any other relevant regulations.
      </p>

      <h2>6. Service Availability</h2>
      <p>
        We strive to keep DelayRadar available and reliable, but we do not
        guarantee uninterrupted service. The App depends on third-party services
        (Shopify, EasyPost, email providers) that are outside our control. We are
        not liable for delays or failures caused by those services.
      </p>

      <h2>7. Limitation of Liability</h2>
      <p>
        DelayRadar is provided "as is" without warranties of any kind. To the
        maximum extent permitted by law, we shall not be liable for any
        indirect, incidental, special, or consequential damages arising from
        your use of the App, including but not limited to lost revenue, missed
        deliveries, or customer complaints.
      </p>

      <h2>8. Termination</h2>
      <p>
        You may stop using DelayRadar at any time by uninstalling it from your
        Shopify admin. Upon uninstall, your access token is revoked immediately.
        If Shopify sends a shop data erasure request, all associated data is
        permanently deleted.
      </p>

      <h2>9. Changes to Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the App
        after changes are posted constitutes acceptance of the revised Terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        For questions about these Terms, contact us at{" "}
        <a href="mailto:support@delayradar.io">support@delayradar.io</a>.
      </p>
    </main>
  );
}
