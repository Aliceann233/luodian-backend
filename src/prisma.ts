import { PrismaClient } from '@prisma/client';

type GlobalWithPrisma = typeof globalThis & {
  __luodianPrisma?: PrismaClient;
};

const globalWithPrisma = globalThis as GlobalWithPrisma;

export const prisma =
  globalWithPrisma.__luodianPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['query', 'error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalWithPrisma.__luodianPrisma = prisma;
}

export async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('[Luodian Backend] database connected successfully');
    return { ok: true as const };
  } catch (error) {
    console.error('[Luodian Backend] database connection failed', error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
