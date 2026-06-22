import { Router } from 'express';

import {
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.js';
import { getUserProfile } from '../controllers/userProfileController.js';
import { searchUsers } from '../controllers/userSearchController.js';
import { prisma } from '../prisma.js';
import { asyncRoute } from '../utils/apiResponse.js';

export const userRouter = Router();

userRouter.get('/search', requireAuth, asyncRoute(searchUsers));

userRouter.get('/', requireAuth, asyncRoute(async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;
  const users = await prisma.user.findMany({
    where: {
      id: { not: currentUserId },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      avatar: true,
      createdAt: true,
    },
  });

  res.json(users);
}));

userRouter.get('/:id', requireAuth, asyncRoute(getUserProfile));
