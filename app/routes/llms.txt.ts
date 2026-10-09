import { SITE_NAME, SITE_URL, SUPPORT_EMAIL } from "@/src/lib/seo";

export const loader = () =>
  new Response(
    `# ${SITE_NAME}

ReturnSense is a Shopify post-purchase recovery command center for merchants that want to protect margin after checkout by turning carrier exceptions into customer recovery, resend, refund, and retention decisions.

Core positioning:
- Carrier exception intelligence for Shopify orders
- Post-purchase margin protection before a support ticket starts
- Carrier lane intelligence for service-level and fulfillment decisions
- Recovery outcome learning across wait, contact, trace, resend, replacement, and refund decisions

Important pages:
- ${SITE_URL}/
- ${SITE_URL}/demo
- ${SITE_URL}/support
- ${SITE_URL}/privacy
- ${SITE_URL}/terms

Operator: Saleh & Associates LLC
Support: ${SUPPORT_EMAIL}
`,
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
