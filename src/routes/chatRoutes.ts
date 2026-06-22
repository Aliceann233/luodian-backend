import { Router } from 'express';

import { getChatList } from '../controllers/chatListController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncRoute } from '../utils/apiResponse.js';

export const chatRouter = Router();

chatRouter.get('/list', requireAuth, asyncRoute(getChatList));
