import { PrismaClient } from '@prisma/client';

// Singleton Prisma client — reuse the same instance across the app.
// In production this connects through PgBouncer (DATABASE_URL).
// In dev/demo it connects directly to Postgres (DIRECT_DATABASE_URL == DATABASE_URL).
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
