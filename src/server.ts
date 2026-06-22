import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';

import { config } from './config.js';
import { authRouter } from './routes/authRoutes.js';
import { chatRouter } from './routes/chatRoutes.js';
import { friendRouter } from './routes/friendRoutes.js';
import { healthRouter } from './routes/healthRoutes.js';
import { messageRouter } from './routes/messageRoutes.js';
import { userRouter } from './routes/userRoutes.js';
import { checkDatabaseConnection } from './prisma.js';
import { registerSocketHandlers } from './socket.js';
import {
  errorHandler,
  notFoundHandler,
  responseEnvelope,
} from './utils/apiResponse.js';

process.on('unhandledRejection', (reason) => {
  console.error('[Luodian Backend] unhandled rejection', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Luodian Backend] uncaught exception', error);
});

const app = express();
const server = http.createServer(app);
const corsOrigin = config.corsOrigins.includes('*') ? true : config.corsOrigins;
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(responseEnvelope);

app.use((req, res, next) => {
  const isAuthRequest =
    req.path === '/login' ||
    req.path === '/register' ||
    req.path === '/auth/login' ||
    req.path === '/auth/register';

  if (!isAuthRequest) {
    next();
    return;
  }

  const startedAt = Date.now();
  const safeBody = {
    ...req.body,
    password:
      typeof req.body?.password === 'string'
        ? `*** (${req.body.password.length} chars)`
        : undefined,
  };

  console.log('[Luodian Backend] auth request received', {
    method: req.method,
    path: req.path,
    origin: req.headers.origin,
    host: req.headers.host,
    body: safeBody,
  });

  res.on('finish', () => {
    console.log('[Luodian Backend] auth response sent', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
});

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/friend', friendRouter);
app.use('/friends', friendRouter);
app.use('/chats', chatRouter);
app.use('/messages', messageRouter);
app.use('/users', userRouter);

registerSocketHandlers(io);

app.use(notFoundHandler);
app.use(errorHandler);

server.listen(config.port, () => {
  console.log(`Luodian backend listening on port ${config.port}`);
  console.log('[Luodian Backend] runtime config', {
    hasDatabaseUrl: config.hasDatabaseUrl,
    corsOrigins: config.corsOrigins,
    nodeEnv: config.nodeEnv,
  });
  void checkDatabaseConnection();
});
