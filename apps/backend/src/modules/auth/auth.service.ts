/**
 * AuthService — şifre hash, JWT imza, register/login/forgot-password mantığı.
 *
 * Kasıtlı side-effect'ler:
 *   - signUp: User row create + auto-login (token üretir, cookie controller'da set edilir)
 *   - logIn: email + bcrypt karşılaştırma + token üretir
 *   - issueResetToken: random 32-byte hex + 1 saat geçerli
 *   - resetPassword: token doğrula + yeni hash + token sıfırla
 */

import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
// bcryptjs ESM named exports vermiyor — default import + destructure.
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
   * Yeni kullanıcı oluşturur ve otomatik giriş yaptırır.
   * Email zaten kayıtlıysa 409 Conflict döner.
   */
  async signUp(input: SignUpInput): Promise<AuthSession> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      // Legacy seed user (passwordHash null) varsa yeni şifre ile upgrade et;
      // aksi halde "zaten kayıtlı" hatası.
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
   * Email + password ile login. Sabit-süreli karşılaştırma için her zaman
   * bcrypt.compare çağırıyoruz (timing-attack koruması).
   */
  async logIn(input: LogInInput): Promise<AuthSession> {
    const email = input.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // User yoksa yine de bcrypt çağırarak timing'i sabit tut.
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
   * Forgot-password: random token üretir, DB'ye yazar.
   * MVP'de SMTP yok — token API response'unda dönüyor (dev kullanım).
   * Üretimde mail servisinin entegrasyonu için TODO işareti var.
   */
  async issueResetToken(email: string): Promise<{ token: string | null }> {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true },
    });

    // Email enumeration'a karşı: kullanıcı yoksa bile null token dönüyoruz.
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

    // TODO(prod): mail servisi (Resend / SES) ile reset link gönder.
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
   * /auth/me — req.user'dan tam profil çeker (techStack vs).
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
