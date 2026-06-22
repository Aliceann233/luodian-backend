import type { Server, Socket } from 'socket.io';
import { z } from 'zod';

import { type AuthPayload, verifyToken } from './middleware/authMiddleware.js';
import { prisma } from './prisma.js';
import { areUsersFriends } from './services/friendshipService.js';

type AuthedSocketData = {
  user: AuthPayload;
};

const sendMessageSchema = z.object({
  toUserId: z.string().uuid(),
  content: z.string().trim().min(1).max(2000),
});

const messageReadSchema = z.object({
  fromUserId: z.string().uuid(),
});

type SendMessagePayload = z.infer<typeof sendMessageSchema>;

type SendMessageAck =
  | { ok: true; message: RealtimeMessagePayload }
  | { ok: false; error: string };

type MessageAck = (response: SendMessageAck) => void;

type ReadMessagePayload = z.infer<typeof messageReadSchema>;

type ReadMessageAck = (
  response:
    | { ok: true; readCount: number; fromUserId: string; by: string }
    | { ok: false; error: string },
) => void;

type PersistedMessage = {
  id: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  createdAt: Date;
  isRead: boolean;
  readAt: Date | null;
  fromUser: {
    id: string;
    username: string;
    avatar: string | null;
  };
};

type RealtimeMessagePayload = {
  id: string;
  from: string;
  to: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  createdAt: string;
  timestamp: number;
  isRead: boolean;
  readAt: string | null;
  fromUser: PersistedMessage['fromUser'];
};

function getHandshakeToken(socket: Socket): string | undefined {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  const authorization = socket.handshake.headers.authorization;
  if (typeof authorization === 'string') {
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    return token || undefined;
  }

  const queryToken = socket.handshake.query.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }

  return undefined;
}

function toRealtimeMessage(message: PersistedMessage): RealtimeMessagePayload {
  return {
    id: message.id,
    from: message.fromUserId,
    to: message.toUserId,
    fromUserId: message.fromUserId,
    toUserId: message.toUserId,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    timestamp: message.createdAt.getTime(),
    isRead: message.isRead,
    readAt: message.readAt?.toISOString() ?? null,
    fromUser: message.fromUser,
  };
}

export function registerSocketHandlers(io: Server) {
  io.use((socket, next) => {
    const token = getHandshakeToken(socket);
    if (!token) {
      next(new Error('Unauthorized'));
      return;
    }

    try {
      const user = verifyToken(token);
      (socket.data as AuthedSocketData).user = user;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data as AuthedSocketData;
    socket.join(user.userId);

    console.log('[Luodian Socket] user connected', {
      userId: user.userId,
      socketId: socket.id,
    });

    socket.on(
      'send_message',
      async (payload: SendMessagePayload, ack?: MessageAck) => {
        const parsed = sendMessageSchema.safeParse(payload);
        if (!parsed.success) {
          ack?.({ ok: false, error: 'Invalid message payload' });
          return;
        }

        const { toUserId, content } = parsed.data;

        try {
          const recipient = await prisma.user.findUnique({
            where: { id: toUserId },
            select: { id: true },
          });

          if (!recipient) {
            ack?.({ ok: false, error: 'Recipient not found' });
            return;
          }

          const canChat = await areUsersFriends(user.userId, toUserId);
          if (!canChat) {
            ack?.({
              ok: false,
              error: 'You can only chat with accepted friends',
            });
            return;
          }

          const savedMessage = await prisma.message.create({
            data: {
              fromUserId: user.userId,
              toUserId,
              content,
              isRead: false,
            },
            include: {
              fromUser: {
                select: { id: true, username: true, avatar: true },
              },
            },
          });

          const realtimeMessage = toRealtimeMessage(savedMessage);

          io.to(toUserId).emit('receive_message', realtimeMessage);
          io.to(user.userId).emit('receive_message', realtimeMessage);
          ack?.({ ok: true, message: realtimeMessage });
        } catch (error) {
          console.error('[Luodian Socket] failed to send message', error);
          ack?.({ ok: false, error: 'Message send failed' });
        }
      },
    );

    socket.on(
      'message_read',
      async (payload: ReadMessagePayload, ack?: ReadMessageAck) => {
        const parsed = messageReadSchema.safeParse(payload);
        if (!parsed.success) {
          ack?.({ ok: false, error: 'Invalid read payload' });
          return;
        }

        const { fromUserId } = parsed.data;

        try {
          const canChat = await areUsersFriends(user.userId, fromUserId);
          if (!canChat) {
            ack?.({
              ok: false,
              error: 'You can only mark accepted friend messages as read',
            });
            return;
          }

          const readAt = new Date();
          const updated = await prisma.message.updateMany({
            where: {
              fromUserId,
              toUserId: user.userId,
              isRead: false,
            },
            data: {
              isRead: true,
              readAt,
            },
          });

          const receipt = {
            by: user.userId,
            fromUserId,
            readAt: readAt.toISOString(),
            readCount: updated.count,
          };

          io.to(fromUserId).emit('messages_read', receipt);
          io.to(user.userId).emit('messages_read', receipt);
          ack?.({
            ok: true,
            readCount: updated.count,
            fromUserId,
            by: user.userId,
          });
        } catch (error) {
          console.error('[Luodian Socket] failed to mark messages read', error);
          ack?.({ ok: false, error: 'Message read failed' });
        }
      },
    );

    socket.on('disconnect', (reason) => {
      console.log('[Luodian Socket] user disconnected', {
        userId: user.userId,
        socketId: socket.id,
        reason,
      });
    });
  });
}
