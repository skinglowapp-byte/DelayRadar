export type EmailDeliveryResult = {
  provider: "postmark" | "sendgrid" | "none";
  status: "sent" | "skipped";
  externalMessageId?: string;
};

export type EmailSender = {
  /** Custom From address — only honored when the domain is provider-verified. */
  email?: string | null;
  name?: string | null;
  verified?: boolean;
  /** Reply-To address (always applied when present, no verification needed). */
  replyTo?: string | null;
};

function formatFrom(email: string, name?: string | null) {
  return name?.trim() ? `${name.trim()} <${email}>` : email;
}

/**
 * Resolve the effective From address. A shop's custom sender address is used
 * only when it's been verified with the provider; otherwise we fall back to
 * the app's global sender and rely on Reply-To to route replies to the merchant.
 */
function resolveFrom(
  globalFrom: string | undefined,
  sender?: EmailSender,
): { email: string; name?: string | null } | null {
  if (sender?.verified && sender.email) {
    return { email: sender.email, name: sender.name };
  }

  if (globalFrom) {
    return { email: globalFrom, name: sender?.name };
  }

  return null;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  sender?: EmailSender;
}) {
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const replyTo = input.sender?.replyTo?.trim() || undefined;

  if (postmarkToken) {
    const from = resolveFrom(process.env.POSTMARK_FROM_EMAIL, input.sender);

    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": postmarkToken,
      },
      body: JSON.stringify({
        From: from ? formatFrom(from.email, from.name) : process.env.POSTMARK_FROM_EMAIL,
        To: input.to,
        ...(replyTo ? { ReplyTo: replyTo } : {}),
        Subject: input.subject,
        HtmlBody: input.htmlBody,
        TextBody: input.textBody,
        MessageStream: "outbound",
      }),
    });

    if (!response.ok) {
      throw new Error(`Postmark send failed with ${response.status}`);
    }

    const payload = (await response.json()) as { MessageID?: string };

    return {
      provider: "postmark",
      status: "sent",
      externalMessageId: payload.MessageID,
    } satisfies EmailDeliveryResult;
  }

  if (sendgridKey) {
    const from = resolveFrom(process.env.SENDGRID_FROM_EMAIL, input.sender);

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendgridKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: input.to }],
            subject: input.subject,
          },
        ],
        from: {
          email: from?.email ?? process.env.SENDGRID_FROM_EMAIL,
          ...(from?.name ? { name: from.name } : {}),
        },
        ...(replyTo ? { reply_to: { email: replyTo } } : {}),
        content: [
          { type: "text/plain", value: input.textBody },
          { type: "text/html", value: input.htmlBody },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`SendGrid send failed with ${response.status}`);
    }

    return {
      provider: "sendgrid",
      status: "sent",
    } satisfies EmailDeliveryResult;
  }

  return {
    provider: "none",
    status: "skipped",
  } satisfies EmailDeliveryResult;
}

/**
 * Build the EmailSender for a shop: custom From only if verified, and Reply-To
 * set to the merchant's chosen reply address (or shop email) so replies reach
 * them even when the message is sent from the shared app domain.
 */
export function shopEmailSender(shop: {
  senderName: string | null;
  senderEmail: string | null;
  senderVerified: boolean;
  replyToEmail: string | null;
  email: string | null;
}): EmailSender {
  return {
    email: shop.senderEmail,
    name: shop.senderName,
    verified: shop.senderVerified,
    replyTo: shop.replyToEmail || shop.senderEmail || shop.email,
  };
}
