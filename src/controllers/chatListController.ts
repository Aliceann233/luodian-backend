import type { Response } from 'express';

import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { prisma } from '../prisma.js';

const peerUserSelect = {
  id: true,
  username: true,
  createdAt: true,
} as const;

export async function getChatList(
  req: AuthenticatedRequest,
  res: Response,
) {
  const currentUserId = req.user!.userId;

  const messages = await prisma.message.findMany({
    where: {
      OR: [{ fromUserId: currentUserId }, { toUserId: currentUserId }],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      fromUser: { select: peerUserSelect },
      toUser: { select: peerUserSelect },
    },
  });

  const conversations = new Map<string, (typeof messages)[number]>();
  for (const message of messages) {
    const peerId =
      message.fromUserId === currentUserId
        ? message.toUserId
        : message.fromUserId;

    if (!conversations.has(peerId)) {
      conversations.set(peerId, message);
    }
  }

  const peerIds = Array.from(conversations.keys());
  const unreadCounts = new Map<string, number>();
  if (peerIds.length > 0) {
    const unreadGroups = await prisma.message.groupBy({
      by: ['fromUserId'],
      where: {
        fromUserId: { in: peerIds },
        toUserId: currentUserId,
        isRead: false,
      },
      _count: { _all: true },
    });

    for (const group of unreadGroups) {
      unreadCounts.set(group.fromUserId, group._count._all);
    }
  }

  res.json(
    Array.from(conversations.entries()).map(([peerId, message]) => {
      const peer =
        message.fromUserId === currentUserId ? message.toUser : message.fromUser;

      return {
        peer: {
          id: peer.id,
          username: peer.username,
          created_at: peer.createdAt,
        },
        lastMessage: {
          id: message.id,
          content: message.content,
          created_at: message.createdAt,
          from_user_id: message.fromUserId,
          to_user_id: message.toUserId,
          is_read: message.isRead,
          read_at: message.readAt,
        },
        updatedAt: message.createdAt,
        unreadCount: unreadCounts.get(peerId) ?? 0,
      };
    }),
  );
}
