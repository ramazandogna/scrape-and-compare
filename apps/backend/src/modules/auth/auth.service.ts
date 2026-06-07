/**
 * AuthService — password hashing, JWT signing, register/login/forgot-password logic.
 *
 * Intentional side effects:
 *   - signUp: create User row + auto-login (issues a token, controller sets the cookie)
 *   - logIn: email + bcrypt comparison + issues a token
 *   - issueResetToken: random 32-byte hex + valid for 1 hour
 *   - resetPassword: validate token + new hash + clear token
 */

import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
// bcryptjs doesn't expose ESM named exports — default import + destructure.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
const { hash, compare } = bcrypt;
const { sign } = jwt;
import { randomBytes } from 'node:crypto';
import { PrismaService } from '@/database/prisma.service';
import {
  BCRYPT_ROUNDS,
  RESET_TOKEN_EXPIRY_MS,
  getAuthSecret,
} from './auth.constants';
import type { AuthenticatedUser } from './auth.types';

// ═══════════════════════════════════════════
// PUBLIC TYPES
// ═══════════════════════════════════════════

export interface AuthSession {
  user: AuthenticatedUser;
  token: string;
}

interface SignUpInput {
  email: string;
  name: string;
  password: string;
}

interface LogInInput {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new user and signs them in automatically.
   * Returns 409 Conflict if the email is already registered.
   */
  async signUp(input: SignUpInput): Promise<AuthSession> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      // If a legacy seed user exists (passwordHash null), upgrade with the new password;
      // otherwise raise an "already registered" error.
      if (existing.passwordHash === null) {
        const passwordHash = await hash(input.password, BCRYPT_ROUNDS);
        const upgraded = await this.prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash, name: input.name },
          select: { id: true, email: true, name: true },
        });
        return this.buildSession(upgraded);
      }
      throw new ConflictException('Bu email adresi zaten kayıtlı');
    }

    const passwordHash = await hash(input.password, BCRYPT_ROUNDS);
    const created = await this.prisma.user.create({
      data: {
        email,
        name: input.name,
        passwordHash,
      },
      select: { id: true, email: true, name: true },
    });

    return this.buildSession(created);
  }

  /**
   * Login with email + password. We always call bcrypt.compare to keep the
   * comparison constant-time (timing-attack protection).
   */
  async logIn(input: LogInInput): Promise<AuthSession> {
    const email = input.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Even when user is missing, call bcrypt to keep timing constant.
    const dummyHash =
      '$2a$10$CwTycUXWue0Thq9StjUM0uJ8nrbKyMU3y3J3MqVgjGpYzhPPbz3hC';
    const comparisonHash = user?.passwordHash ?? dummyHash;
    const valid = await compare(input.password, comparisonHash);

    if (!user || !user.passwordHash || !valid) {
      throw new UnauthorizedException('Email veya şifre hatalı');
    }

    return this.buildSession({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  }

  /**
   * Forgot-password: generates a random token and writes it to the DB.
   * No SMTP in MVP — token is returned in the API response (dev usage).
   * A TODO is left for integrating a mail service in production.
   */
  async issueResetToken(email: string): Promise<{ token: string | null }> {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true },
    });

    // Against email enumeration: return a null token even when the user is missing.
    if (!user) return { token: null };

    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpires: expires,
      },
    });

    // TODO(prod): send the reset link via a mail service (Resend / SES).
    return { token };
  }

  async resetPassword(token: string, newPassword: string): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { passwordResetToken: token },
    });

    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Token geçersiz veya süresi dolmuş');
    }

    const passwordHash = await hash(newPassword, BCRYPT_ROUNDS);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
      select: { id: true, email: true, name: true },
    });

    return this.buildSession(updated);
  }

  /**
   * /auth/me — fetches the full profile from req.user (techStack, etc).
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        techStack: true,
        experienceYears: true,
        preferredRoles: true,
        preferredLocations: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');
    return user;
  }

  // ─── Helpers ──────────────────────────────

  private buildSession(user: AuthenticatedUser): AuthSession {
    const token = sign(
      { sub: user.id, email: user.email, name: user.name },
      getAuthSecret(),
      { expiresIn: '7d' },
    );
    return { user, token };
  }
}
