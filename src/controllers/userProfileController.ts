import type { Response } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { prisma } from '../prisma.js';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function getUserProfile(
  req: AuthenticatedRequest,
  res: Response,
) {
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      username: true,
      createdAt: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    created_at: user.createdAt,
  });
}
