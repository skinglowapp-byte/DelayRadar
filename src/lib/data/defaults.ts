import {
  ExceptionType,
  NotificationChannel,
  type Prisma,
} from "@prisma/client";

import { managedSlackRules } from "@/src/lib/notifications/managed-slack-rules";
import { prisma } from "@/src/lib/prisma";

type DefaultTemplate = {
  name: string;
  channel: NotificationChannel;
  triggerType: ExceptionType;
  subject: string;
  body: string;
};

const defaultTemplates: DefaultTemplate[] = [
  {
    name: "Delayed shipment",
    channel: NotificationChannel.EMAIL,
    triggerType: ExceptionType.DELAYED,
    subject: "We’re tracking your shipment delay",
    body:
      "Hi {{customer_first_name}}, your order {{order_name}} is delayed in transit. We’re already monitoring the carrier and will send an update as soon as movement resumes.",
  },
  {
    name: "Address issue",
    channel: NotificationChannel.EMAIL,
    triggerType: ExceptionType.ADDRESS_ISSUE,
    subject: "Action needed for {{order_name}}",
    body:
      "Hi {{customer_first_name}}, the carrier needs an address confirmation for {{order_name}}. Reply here and our team will help keep the shipment moving.",
  },
  {
    name: "Failed delivery",
    channel: NotificationChannel.EMAIL,
    triggerType: ExceptionType.FAILED_DELIVERY,
    subject: "Action needed to complete delivery for {{order_name}}",
    body:
      "Hi {{customer_first_name}}, the carrier could not complete delivery for {{order_name}}. Reply here if you need help arranging the next step and we will get it moving again.",
  },
  {
    name: "Pickup reminder",
    channel: NotificationChannel.EMAIL,
    triggerType: ExceptionType.AVAILABLE_FOR_PICKUP,
    subject: "{{order_name}} is ready for pickup",
    body:
      "Hi {{customer_first_name}}, your package is waiting at the pickup location. Please collect it before the hold window expires.",
  },
];

export async function ensureDefaultAutomation(shopId: string) {
  if (!prisma) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const templateIds = new Map<string, string>();

    for (const template of defaultTemplates) {
      const stored = await tx.messageTemplate.upsert({
        where: {
          shopId_channel_triggerType: {
            shopId,
            channel: template.channel,
            triggerType: template.triggerType,
          },
        },
        update: {
          name: template.name,
          subject: template.subject,
          body: template.body,
          active: true,
        },
        create: {
          shopId,
          ...template,
          active: true,
          isDefault: true,
        },
      });

      templateIds.set(`${template.channel}:${template.triggerType}`, stored.id);
    }

    for (const template of defaultTemplates) {
      await tx.exceptionRule.upsert({
        where: {
          shopId_exceptionType_channel: {
            shopId,
            exceptionType: template.triggerType,
            channel: template.channel,
          },
        },
        update: {
          active: true,
          templateId: templateIds.get(`${template.channel}:${template.triggerType}`),
        },
        create: {
          shopId,
          exceptionType: template.triggerType,
          channel: template.channel,
          active: true,
          minRiskScore: 20,
          templateId: templateIds.get(`${template.channel}:${template.triggerType}`),
        },
      });
    }

    for (const rule of managedSlackRules) {
      await tx.exceptionRule.upsert({
        where: {
          shopId_exceptionType_channel: {
            shopId,
            exceptionType: rule.triggerType,
            channel: NotificationChannel.SLACK,
          },
        },
        update: {
          active: true,
          minRiskScore: 70,
          onlyWhenActionRequired: true,
        },
        create: {
          shopId,
          exceptionType: rule.triggerType,
          channel: NotificationChannel.SLACK,
          active: true,
          minRiskScore: 70,
          onlyWhenActionRequired: true,
        },
      });
    }
  });
}
