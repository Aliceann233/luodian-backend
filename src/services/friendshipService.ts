import { prisma } from '../prisma.js';

export function getFriendshipPair(firstUserId: string, secondUserId: string) {
  return firstUserId < secondUserId
    ? { userId: firstUserId, friendId: secondUserId }
    : { userId: secondUserId, friendId: firstUserId };
}

export async function areUsersFriends(
  firstUserId: string,
  secondUserId: string,
) {
  const pair = getFriendshipPair(firstUserId, secondUserId);
  const friendship = await prisma.friendship.findUnique({
    where: { userId_friendId: pair },
    select: { status: true },
  });

  return friendship?.status === 'accepted';
}
