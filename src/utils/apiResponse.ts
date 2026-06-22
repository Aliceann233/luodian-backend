import type { NextFunction, Request, Response } from 'express';

const rawResponsePaths = new Set(['/health', '/health/db']);

type JsonPayload = {
  success?: boolean;
  data?: unknown;
  message?: string;
  [key: string]: unknown;
};

function normalizeMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const body = payload as JsonPayload;
    const message = body.message ?? body.error;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function isWrappedPayload(payload: unknown) {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    Object.prototype.hasOwnProperty.call(payload, 'success')
  );
}

function isRawResponsePath(req: Request) {
  const originalPath = req.originalUrl.split('?')[0];
  const mountedPath = `${req.baseUrl}${req.path}`;
  return rawResponsePaths.has(originalPath) || rawResponsePaths.has(mountedPath);
}

export function responseEnvelope(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const originalJson = res.json.bind(res);

  res.json = ((payload: unknown) => {
    if (isRawResponsePath(req) || isWrappedPayload(payload)) {
      return originalJson(payload);
    }

    const success = res.statusCode < 400;
    const wrapped = success
      ? { success: true, data: payload }
      : {
          success: false,
          message: normalizeMessage(payload, 'Request failed'),
          data: payload,
        };

    return originalJson(wrapped);
  }) as Response['json'];

  next();
}

export function asyncRoute<TReq extends Request = Request>(
  handler: (req: TReq, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req as TReq, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`,
  });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[Luodian Backend] unhandled request error', {
    method: req.method,
    path: req.path,
    message,
    error,
  });

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
}
