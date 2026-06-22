import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { config } from '../config.js';
import { prisma } from '../prisma.js';

export type AuthPayload = {
  userId: string;
  username: string;
};

export type AuthenticatedRequest = Request & {
  user?: AuthPayload;
};

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '14d' });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, config.jwtSecret) as AuthPayload;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  let payload: AuthPayload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true },
    });

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.user = payload;
    next();
  } catch (error) {
    console.error('[Luodian Backend] auth database check failed', error);
    res.status(503).json({
      success: false,
      message: 'Database unavailable',
    });
  }
}
