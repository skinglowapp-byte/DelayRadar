function isValidSlackWebhookUrl(webhookUrl: string) {
  try {
    const url = new URL(webhookUrl);

    return url.protocol === "https:" && url.hostname === "hooks.slack.com";
  } catch {
    return false;
  }
}

export async function sendSlackMessage(webhookUrl: string, text: string) {
  if (!isValidSlackWebhookUrl(webhookUrl)) {
    throw new Error("Slack webhook URL must be an https://hooks.slack.com URL.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed with ${response.status}`);
  }
}
