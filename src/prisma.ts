import { PrismaClient } from '@prisma/client';

type GlobalWithPrisma = typeof globalThis & {
  __luodianPrisma?: PrismaClient;
};

const globalWithPrisma = globalThis as GlobalWithPrisma;

function buildPoolerSafeDatabaseUrl(rawUrl: string | undefined) {
  if (!rawUrl) {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const port = url.port;
    const looksLikePooler =
      host.includes('pooler.supabase.com') || port === '6543';

    if (looksLikePooler) {
      url.searchParams.set('pgbouncer', 'true');
      url.searchParams.set('connection_limit', '1');
      url.searchParams.set('sslmode', 'require');
    }

    return url.toString();
  } catch (error) {
    console.error('[Luodian Backend] invalid DATABASE_URL format', error);
    return rawUrl;
  }
}

const datasourceUrl = buildPoolerSafeDatabaseUrl(process.env.DATABASE_URL);

export const prismaRuntimeInfo = (() => {
  if (!datasourceUrl) {
    return {
      hasDatabaseUrl: false,
      poolerMode: false,
      host: null,
      port: null,
      pgbouncer: false,
      connectionLimit: null,
      sslmode: null,
    };
  }

  try {
    const url = new URL(datasourceUrl);
    return {
      hasDatabaseUrl: true,
      poolerMode:
        url.hostname.toLowerCase().includes('pooler.supabase.com') ||
        url.port === '6543',
      host: url.hostname,
      port: url.port,
      pgbouncer: url.searchParams.get('pgbouncer') === 'true',
      connectionLimit: url.searchParams.get('connection_limit'),
      sslmode: url.searchParams.get('sslmode'),
    };
  } catch {
    return {
      hasDatabaseUrl: true,
      poolerMode: false,
      host: 'invalid-url',
      port: null,
      pgbouncer: false,
      connectionLimit: null,
      sslmode: null,
    };
  }
})();

export const prisma =
  globalWithPrisma.__luodianPrisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    ...(datasourceUrl
      ? {
          datasources: {
            db: {
              url: datasourceUrl,
            },
          },
        }
      : {}),
  });

globalWithPrisma.__luodianPrisma = prisma;

process.on('beforeExit', () => {
  void prisma.$disconnect().catch((error) => {
    console.error('[Luodian Backend] prisma disconnect failed', error);
  });
});

export async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('[Luodian Backend] database connected successfully');
    return { ok: true as const };
  } catch (error) {
    console.error(
      'DATABASE_CONNECTION_FAILED: check pooler config',
      error,
    );
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
