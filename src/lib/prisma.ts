import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export const prisma = hasDatabaseUrl()
  ? globalThis.prismaGlobal ?? new PrismaClient()
  : null;

if (process.env.NODE_ENV !== "production" && prisma) {
  globalThis.prismaGlobal = prisma;
}
