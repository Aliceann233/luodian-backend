import type { Response } from 'express';

import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { prisma } from '../prisma.js';

const friendUserSelect = {
  id: true,
  username: true,
  createdAt: true,
} as const;

export async function getFriendList(
  req: AuthenticatedRequest,
  res: Response,
) {
  const currentUserId = req.user!.userId;

  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ userId: currentUserId }, { friendId: currentUserId }],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: friendUserSelect },
      friend: { select: friendUserSelect },
    },
  });

  res.json(
    friendships.map((friendship) => ({
      id: friendship.id,
      user: toPublicUser(friendship.user),
      friend: toPublicUser(friendship.friend),
      peer:
        friendship.userId === currentUserId
          ? toPublicUser(friendship.friend)
          : toPublicUser(friendship.user),
    })),
  );
}

function toPublicUser(user: {
  id: string;
  username: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    created_at: user.createdAt,
  };
}
