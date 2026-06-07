import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.types';

// ═══════════════════════════════════════════
// @CurrentUser() — req.user injection
// ═══════════════════════════════════════════
// Used in controllers to access the auth user without relying on body.userId.
// AuthGuard sets req.user when it runs.

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new Error('CurrentUser decorator çağrıldı ama AuthGuard çalışmadı.');
    }
    return request.user;
  },
);
