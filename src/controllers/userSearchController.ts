import type { Response } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { prisma } from '../prisma.js';

const searchQuerySchema = z.object({
  q: z.string().optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(20).optional().default(20),
});

export async function searchUsers(req: AuthenticatedRequest, res: Response) {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid search query' });
    return;
  }

  const q = parsed.data.q.trim();
  if (!q) {
    res.json([]);
    return;
  }

  const currentUserId = req.user!.userId;
  const limit = parsed.data.limit;
  const page = parsed.data.page;

  const users = await prisma.user.findMany({
    where: {
      id: { not: currentUserId },
      username: {
        contains: q,
        mode: 'insensitive',
      },
    },
    orderBy: { username: 'asc' },
    take: limit,
    skip: (page - 1) * limit,
    select: {
      id: true,
      username: true,
      createdAt: true,
    },
  });

  res.json(
    users.map((user) => ({
      id: user.id,
      username: user.username,
      created_at: user.createdAt,
    })),
  );
}
