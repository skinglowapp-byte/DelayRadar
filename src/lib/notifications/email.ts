export type EmailDeliveryResult = {
  provider: "postmark" | "sendgrid" | "none";
  status: "sent" | "skipped";
  externalMessageId?: string;
};

export async function sendEmail(input: {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}) {
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  const sendgridKey = process.env.SENDGRID_API_KEY;

  if (postmarkToken) {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": postmarkToken,
      },
      body: JSON.stringify({
        From: process.env.POSTMARK_FROM_EMAIL,
        To: input.to,
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
          email: process.env.SENDGRID_FROM_EMAIL,
        },
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
