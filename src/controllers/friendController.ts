import type { Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { prisma } from '../prisma.js';
import { getFriendshipPair } from '../services/friendshipService.js';

const userIdSchema = z.object({
  userId: z.string().uuid(),
});

const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

const friendshipIdSchema = z.object({
  friendshipId: z.string().uuid(),
});

const legacyRequestIdSchema = z.object({
  requestId: z.string().uuid(),
});

const friendUserSelect = {
  id: true,
  username: true,
  createdAt: true,
} as const;

export async function sendFriendRequest(
  req: AuthenticatedRequest,
  res: Response,
) {
  const parsed = userIdSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid target user id' });
    return;
  }

  const currentUserId = req.user!.userId;
  const targetUserId = parsed.data.userId;
  if (currentUserId === targetUserId) {
    res.status(400).json({ error: 'Cannot add yourself as friend' });
    return;
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!targetUser) {
    res.status(404).json({ error: 'Target user not found' });
    return;
  }

  const pair = getFriendshipPair(currentUserId, targetUserId);
  const existing = await prisma.friendship.findUnique({
    where: { userId_friendId: pair },
  });

  if (existing?.status === 'accepted') {
    res.status(409).json({ error: 'Already friends' });
    return;
  }

  if (existing?.status === 'pending') {
    res.status(409).json({ error: 'Friend request already pending' });
    return;
  }

  try {
    const friendship = await prisma.friendship.upsert({
      where: { userId_friendId: pair },
      update: {
        requestedById: currentUserId,
        status: 'pending',
      },
      create: {
        ...pair,
        requestedById: currentUserId,
      },
      include: friendshipInclude,
    });

    res.status(201).json(formatFriendship(friendship, currentUserId));
  } catch (error) {
    console.error('[Luodian Backend] friend request failed', error);
    res.status(500).json({
      error: 'Friend request failed',
      debug: prismaErrorInfo(error),
    });
  }
}

export async function acceptFriendRequest(
  req: AuthenticatedRequest,
  res: Response,
) {
  await updateFriendshipStatus(req, res, 'accepted');
}

export async function rejectFriendRequest(
  req: AuthenticatedRequest,
  res: Response,
) {
  await updateFriendshipStatus(req, res, 'rejected');
}

export async function listFriends(req: AuthenticatedRequest, res: Response) {
  const currentUserId = req.user!.userId;
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ userId: currentUserId }, { friendId: currentUserId }],
    },
    orderBy: { createdAt: 'desc' },
    include: friendshipInclude,
  });

  const friends = friendships.map((friendship) => {
    return friendship.userId === currentUserId
      ? friendship.friend
      : friendship.user;
  });

  res.json(friends);
}

export async function listFriendRequests(
  req: AuthenticatedRequest,
  res: Response,
) {
  const currentUserId = req.user!.userId;
  const requests = await prisma.friendship.findMany({
    where: {
      status: 'pending',
      requestedById: { not: currentUserId },
      OR: [{ userId: currentUserId }, { friendId: currentUserId }],
    },
    orderBy: { createdAt: 'desc' },
    include: friendshipInclude,
  });

  res.json(requests.map((request) => formatFriendship(request, currentUserId)));
}

export async function getFriendStatus(
  req: AuthenticatedRequest,
  res: Response,
) {
  const parsed = userIdParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  const currentUserId = req.user!.userId;
  const targetUserId = parsed.data.userId;

  if (currentUserId === targetUserId) {
    res.json({ status: 'none', isRequester: false });
    return;
  }

  const pair = getFriendshipPair(currentUserId, targetUserId);
  const friendship = await prisma.friendship.findUnique({
    where: { userId_friendId: pair },
    select: {
      status: true,
      requestedById: true,
    },
  });

  if (!friendship) {
    res.json({ status: 'none', isRequester: false });
    return;
  }

  res.json({
    status: friendship.status,
    isRequester: friendship.requestedById === currentUserId,
  });
}

const friendshipInclude = {
  user: { select: friendUserSelect },
  friend: { select: friendUserSelect },
  requestedBy: { select: friendUserSelect },
} as const;

type FriendshipWithUsers = Prisma.FriendshipGetPayload<{
  include: typeof friendshipInclude;
}>;

function formatFriendship(
  friendship: FriendshipWithUsers,
  currentUserId: string,
) {
  const peer =
    friendship.userId === currentUserId ? friendship.friend : friendship.user;

  return {
    id: friendship.id,
    friendshipId: friendship.id,
    status: friendship.status,
    createdAt: friendship.createdAt,
    requestedById: friendship.requestedById,
    peer,
    user: friendship.user,
    friend: friendship.friend,
    requestedBy: friendship.requestedBy,
  };
}

async function updateFriendshipStatus(
  req: AuthenticatedRequest,
  res: Response,
  status: 'accepted' | 'rejected',
) {
  const parsed = parseFriendshipIdentifier(req.body);
  if (!parsed) {
    res.status(400).json({ error: 'Invalid friendship id' });
    return;
  }

  const currentUserId = req.user!.userId;
  const friendship = await prisma.friendship.findUnique({
    where: { id: parsed },
    include: friendshipInclude,
  });
  if (!friendship) {
    res.status(404).json({ error: 'Friend request not found' });
    return;
  }

  if (friendship.status !== 'pending') {
    res.status(409).json({ error: 'Friend request already handled' });
    return;
  }

  const currentUserInPair =
    friendship.userId === currentUserId || friendship.friendId === currentUserId;
  if (!currentUserInPair || friendship.requestedById === currentUserId) {
    res.status(403).json({ error: 'Only receiver can update request' });
    return;
  }

  const updated = await prisma.friendship.update({
    where: { id: friendship.id },
    data: { status },
    include: friendshipInclude,
  });

  res.json(formatFriendship(updated, currentUserId));
}

function parseFriendshipIdentifier(body: unknown): string | null {
  const friendshipId = friendshipIdSchema.safeParse(body);
  if (friendshipId.success) {
    return friendshipId.data.friendshipId;
  }

  const legacyRequestId = legacyRequestIdSchema.safeParse(body);
  if (legacyRequestId.success) {
    return legacyRequestId.data.requestId;
  }

  return null;
}

function prismaErrorInfo(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
    meta?: unknown;
  };

  return {
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    message:
      typeof candidate.message === 'string' ? candidate.message : undefined,
    meta: candidate.meta,
  };
}
