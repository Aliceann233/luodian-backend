import { prisma } from '../prisma.js';

export function getFriendshipPair(firstUserId: string, secondUserId: string) {
  return uuidSortKey(firstUserId) < uuidSortKey(secondUserId)
    ? { userId: firstUserId, friendId: secondUserId }
    : { userId: secondUserId, friendId: firstUserId };
}

function uuidSortKey(value: string) {
  return value.replace(/-/g, '').toLowerCase();
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
