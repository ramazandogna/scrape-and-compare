/**
 * Users Service — Kullanıcı profil CRUD operasyonları.
 *
 * Bu servis Prisma ORM üzerinden User tablosunu yönetir.
 * Controller HTTP katmanıyla, Service veritabanı katmanıyla ilgilenir (SRP).
 *
 * Neden NotFoundException burada fırlatılıyor?
 *   Service katmanında "bu kayıt yok" bilgisi yaşar.
 *   Controller bunu yakalayıp HTTP 404'e çevirir diyebilirsin ama
 *   NestJS exception filter'ı NotFoundException'ı otomatik 404 yapar.
 *   Yani service → exception → NestJS filter → 404 JSON response.
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import type { CreateUserInput, UpdateUserInput } from '@scrape/shared';

// ═══════════════════════════════════════════
// RESPONSE TYPE
// ═══════════════════════════════════════════

/**
 * User DTO — frontend'e dönen kullanıcı verisi.
 *
 * Prisma'nın User tipi yerine kendi DTO'muzu tanımlıyoruz:
 *   - Hangi alanların dönüldüğü açıkça belirtilir
 *   - İleride hassas alanlar (password vb.) eklense bile sızmaz
 *   - API contract'ı DB schema'sından bağımsız olur
 */
export interface UserDto {
  id: string;
  email: string;
  name: string;
  techStack: string[];
  experienceYears: number;
  preferredRoles: string[];
  preferredLocations: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Prisma select — sadece DTO'daki alanları çek (over-fetching önleme) */
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  techStack: true,
  experienceYears: true,
  preferredRoles: true,
  preferredLocations: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ═══════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Yeni kullanıcı oluştur.
   *
   * Prisma unique constraint (email) ihlal edilirse P2002 kodu döner.
   * Bunu yakalayıp anlamlı bir ConflictException fırlatıyoruz.
   */
  async create(input: CreateUserInput): Promise<UserDto> {
    try {
      return await this.prisma.user.create({
        data: input,
        select: USER_SELECT,
      });
    } catch (error: unknown) {
      if (isPrismaUniqueViolation(error)) {
        throw new ConflictException('Bu email adresi zaten kayıtlı');
      }
      throw error;
    }
  }

  /**
   * Tüm kullanıcıları listele (son oluşturulan önce).
   */
  async findAll(): Promise<UserDto[]> {
    return this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Kullanıcı bilgisini ID ile getir.
   *
   * findUnique → primary key ile arar, en hızlı Prisma sorgusu.
   * Bulunamazsa 404 fırlatırız (frontend "profil yok" mesajı gösterir).
   */
  async findById(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`Kullanıcı bulunamadı: ${id}`);
    }

    return user;
  }

  /**
   * Kullanıcı profilini güncelle.
   *
   * Prisma update: undefined olan alanlar güncellenmez (PATCH semantiği).
   * Yani frontend sadece { techStack: ["React", "TS"] } gönderirse
   * sadece techStack güncellenir, diğer alanlar aynen kalır.
   */
  async update(id: string, input: UpdateUserInput): Promise<UserDto> {
    await this.ensureUserExists(id);

    try {
      return await this.prisma.user.update({
        where: { id },
        data: input,
        select: USER_SELECT,
      });
    } catch (error: unknown) {
      if (isPrismaUniqueViolation(error)) {
        throw new ConflictException('Bu email adresi zaten kayıtlı');
      }
      throw error;
    }
  }

  /**
   * Kullanıcı var mı kontrolü — update/delete öncesi.
   *
   * Neden ayrı metod? findById zaten yapıyor diyebilirsin ama
   * update senaryosunda "user yoksa 404, email çakışırsa 409"
   * gibi farklı hata yolları var. Kontrolü ayırmak daha net.
   */
  private async ensureUserExists(id: string): Promise<void> {
    const count = await this.prisma.user.count({ where: { id } });
    if (count === 0) {
      throw new NotFoundException(`Kullanıcı bulunamadı: ${id}`);
    }
  }
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Prisma P2002 unique constraint violation kontrolü.
 *
 * Prisma hataları PrismaClientKnownRequestError tipinde gelir.
 * code="P2002" → unique constraint ihlali.
 * Neden instanceof yerine duck typing? Prisma client
 * farklı output path'lerde farklı class reference'ı olabiliyor.
 */
function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}
