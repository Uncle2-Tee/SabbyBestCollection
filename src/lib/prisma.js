import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

function pooledDatabaseUrl(databaseUrl) {
  if (!databaseUrl) return undefined;
  const url = new URL(databaseUrl);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
  return url.toString();
}

const databaseUrl = pooledDatabaseUrl(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(databaseUrl ? {
    datasources: {
      db: { url: databaseUrl },
    },
  } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
