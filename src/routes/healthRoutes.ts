import { Router } from 'express';

import {
  checkDatabaseConnection,
  prisma,
  prismaRuntimeInfo,
} from '../prisma.js';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  res.json({ ok: true });
});

healthRouter.get('/db', async (req, res) => {
  const result = await checkDatabaseConnection();
  if (result.ok) {
    res.json({
      ok: true,
      database: 'connected',
    });
    return;
  }

  res.status(503).json({
    ok: false,
    database: 'disconnected',
    error: result.error,
  });
});

healthRouter.get('/runtime', (req, res) => {
  res.json({
    ok: true,
    prisma: prismaRuntimeInfo,
  });
});

healthRouter.get('/schema', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string }>
    >`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'messages', 'friendships')
      ORDER BY table_name, column_name
    `;

    const tables = rows.reduce<Record<string, string[]>>((acc, row) => {
      acc[row.table_name] ??= [];
      acc[row.table_name].push(row.column_name);
      return acc;
    }, {});

    const required = {
      users: ['id', 'username', 'password', 'created_at'],
      messages: [
        'id',
        'from_user_id',
        'to_user_id',
        'content',
        'created_at',
        'is_read',
        'read_at',
      ],
      friendships: [
        'id',
        'user_id',
        'friend_id',
        'requested_by_id',
        'status',
        'created_at',
      ],
    };

    const missing = Object.entries(required).flatMap(([table, columns]) => {
      const existing = new Set(tables[table] ?? []);
      if (!tables[table]) {
        return [`${table}.*`];
      }

      return columns
        .filter((column) => !existing.has(column))
        .map((column) => `${table}.${column}`);
    });

    res.status(missing.length > 0 ? 500 : 200).json({
      ok: missing.length === 0,
      schema: missing.length === 0 ? 'ready' : 'incomplete',
      tables,
      missing,
    });
  } catch (error) {
    console.error('[Luodian Backend] schema health check failed', error);
    res.status(503).json({
      ok: false,
      schema: 'unknown',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
