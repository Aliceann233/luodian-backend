import { Router } from 'express';

import { login, me, register } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncRoute } from '../utils/apiResponse.js';

export const authRouter = Router();

authRouter.post('/register', asyncRoute(register));
authRouter.post('/login', asyncRoute(login));
authRouter.get('/me', requireAuth, asyncRoute(me));
