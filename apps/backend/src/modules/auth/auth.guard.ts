import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
const { verify } = jwt;
import { IS_PUBLIC_KEY } from './public.decorator';
import { AUTH_COOKIE_NAME, getAuthSecret } from './auth.constants';
import type { AuthenticatedUser } from './auth.types';

// ═══════════════════════════════════════════
// AuthGuard — global JWT cookie validator
// ═══════════════════════════════════════════
// On every request the auth_token cookie is verified and the payload is written to req.user.
// Handlers marked with @Public() are bypassed.

interface JwtUserPayload extends JwtPayload {
  sub: string;
  email: string;
  name: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Oturum bulunamadı, lütfen giriş yap');
    }

    try {
      const payload = verify(token, getAuthSecret()) as JwtUserPayload;
      const user: AuthenticatedUser = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
      };
      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Oturum süresi doldu, tekrar giriş yap');
    }
  }
}

/**
 * Extracts the token from the cookie or Authorization header.
 * Cookie takes precedence — comes via fetch credentials:'include'.
 * The Bearer header is a fallback for mobile/script integration.
 */
function extractToken(request: Request): string | null {
  const cookieRecord = request.cookies as Record<string, string | undefined> | undefined;
  const cookieToken = cookieRecord?.[AUTH_COOKIE_NAME];
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.authorization ?? '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  return null;
}
