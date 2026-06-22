import { Router } from 'express';
import { z } from 'zod';

import {
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.js';
import { prisma } from '../prisma.js';
import { areUsersFriends } from '../services/friendshipService.js';
import { asyncRoute } from '../utils/apiResponse.js';

const paramsSchema = z.object({
  userId: z.string().uuid(),
});

export const messageRouter = Router();

messageRouter.get(
  '/:userId',
  requireAuth,
  asyncRoute(async (req: AuthenticatedRequest, res) => {
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const currentUserId = req.user!.userId;
    const peerUserId = parsed.data.userId;

    const canChat = await areUsersFriends(currentUserId, peerUserId);
    if (!canChat) {
      res.status(403).json({ error: 'You can only chat with accepted friends' });
      return;
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { fromUserId: currentUserId, toUserId: peerUserId },
          { fromUserId: peerUserId, toUserId: currentUserId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        fromUser: { select: { id: true, username: true } },
      },
    });

    res.json({ messages });
  }),
);
