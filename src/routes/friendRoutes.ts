import { Router } from 'express';

import {
  acceptFriendRequest,
  getFriendStatus,
  listFriendRequests,
  rejectFriendRequest,
  sendFriendRequest,
} from '../controllers/friendController.js';
import { getFriendList } from '../controllers/friendListController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncRoute } from '../utils/apiResponse.js';

export const friendRouter = Router();

friendRouter.post('/request', requireAuth, asyncRoute(sendFriendRequest));
friendRouter.post('/accept', requireAuth, asyncRoute(acceptFriendRequest));
friendRouter.post('/reject', requireAuth, asyncRoute(rejectFriendRequest));
friendRouter.get('/status/:userId', requireAuth, asyncRoute(getFriendStatus));
friendRouter.get('/list', requireAuth, asyncRoute(getFriendList));
friendRouter.get('/requests', requireAuth, asyncRoute(listFriendRequests));
