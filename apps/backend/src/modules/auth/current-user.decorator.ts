import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.types';

// ═══════════════════════════════════════════
// @CurrentUser() — req.user injection
// ═══════════════════════════════════════════
// Controller'larda body.userId yerine sırayı bozmadan auth user'a erişim için.
// AuthGuard çalıştığında req.user set edilir.

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new Error('CurrentUser decorator çağrıldı ama AuthGuard çalışmadı.');
    }
    return request.user;
  },
);
