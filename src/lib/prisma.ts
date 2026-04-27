import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export const prisma = hasDatabaseUrl()
  ? globalThis.prismaGlobal ?? new PrismaClient()
  : null;

if (prisma) {
  globalThis.prismaGlobal = prisma;
}
