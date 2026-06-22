import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { z } from 'zod';

import {
  signToken,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.js';
import { prisma } from '../prisma.js';
import { config } from '../config.js';

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(32),
  password: z.string().min(6).max(128),
});

const safeUserSelect = {
  id: true,
  username: true,
  avatar: true,
  createdAt: true,
} as const;

function isDatabaseConnectionError(error: unknown) {
  if (!config.hasDatabaseUrl) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Can't reach database server") ||
    message.includes('Environment variable not found: DATABASE_URL') ||
    message.includes('PrismaClientInitializationError')
  );
}

function prismaErrorInfo(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as {
    code?: unknown;
    meta?: unknown;
    name?: unknown;
    message?: unknown;
  };

  return {
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    message:
      typeof candidate.message === 'string' ? candidate.message : undefined,
    meta: candidate.meta,
  };
}

function sendAuthFailure(res: Response, action: 'register' | 'login', error: unknown) {
  console.error(`[Luodian Backend] ${action} failed`, error);
  const debug = prismaErrorInfo(error);
  if (isDatabaseConnectionError(error)) {
    res.status(503).json({
      code: 'DATABASE_UNAVAILABLE',
      error: 'Database unavailable',
      debug,
    });
    return;
  }

  res.status(500).json({
    code: action === 'register' ? 'REGISTER_FAILED' : 'LOGIN_FAILED',
    error: action === 'register' ? 'Register failed' : 'Login failed',
    debug,
  });
}

export async function register(req: Request, res: Response) {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid username or password' });
      return;
    }

    const username = parsed.data.username.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }

    const password = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: { username, password, avatar: '' },
      select: safeUserSelect,
    });

    const token = signToken({ userId: user.id, username: user.username });
    res.status(201).json({ token, user });
  } catch (error) {
    sendAuthFailure(res, 'register', error);
  }
}

export async function login(req: Request, res: Response) {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid username or password' });
      return;
    }

    const username = parsed.data.username.toLowerCase();
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const matched = await bcrypt.compare(parsed.data.password, user.password);
    if (!matched) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken({ userId: user.id, username: user.username });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    sendAuthFailure(res, 'login', error);
  }
}

export async function me(req: AuthenticatedRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: safeUserSelect,
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user });
}
