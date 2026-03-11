import {
  ExceptionType,
  NotificationChannel,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const demoShop = await prisma.shop.upsert({
    where: { domain: "demo-shop.myshopify.com" },
    update: {
      isInstalled: true,
      shopName: "Demo Shop",
      timezone: "America/New_York",
    },
    create: {
      domain: "demo-shop.myshopify.com",
      isInstalled: true,
      shopName: "Demo Shop",
      timezone: "America/New_York",
    },
  });

  const templates = [
    {
      name: "Delayed shipment",
      channel: NotificationChannel.EMAIL,
      triggerType: ExceptionType.DELAYED,
      subject: "We’re watching your delivery closely",
      body:
        "Hi {{customer_first_name}}, your order {{order_name}} is delayed in transit. We’re monitoring the carrier and will send an update as soon as movement resumes.",
    },
    {
      name: "Action required",
      channel: NotificationChannel.EMAIL,
      triggerType: ExceptionType.ADDRESS_ISSUE,
      subject: "Action needed to keep your order moving",
      body:
        "Hi {{customer_first_name}}, the carrier needs an address confirmation for {{order_name}}. Reply to this email and our team will update the shipment right away.",
    },
    {
      name: "Failed delivery",
      channel: NotificationChannel.EMAIL,
      triggerType: ExceptionType.FAILED_DELIVERY,
      subject: "Action needed to complete delivery for {{order_name}}",
      body:
        "Hi {{customer_first_name}}, the carrier could not complete delivery for {{order_name}}. Reply to this email and our team will help arrange the next step.",
    },
    {
      name: "Available for pickup",
      channel: NotificationChannel.EMAIL,
      triggerType: ExceptionType.AVAILABLE_FOR_PICKUP,
      subject: "Your order is ready for pickup",
      body:
        "Hi {{customer_first_name}}, {{order_name}} is waiting at the carrier pickup location. Please collect it within the carrier’s hold window.",
    },
  ];

  for (const template of templates) {
    await prisma.messageTemplate.upsert({
      where: {
        shopId_channel_triggerType: {
          shopId: demoShop.id,
          channel: template.channel,
          triggerType: template.triggerType,
        },
      },
      update: {
        ...template,
        active: true,
        isDefault: true,
      },
      create: {
        shopId: demoShop.id,
        ...template,
        active: true,
        isDefault: true,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
