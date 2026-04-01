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
   * Normalizasyon Stratejisi (Defense-in-Depth):
   *   - Frontend: UX iyileştirmesi (immediate feedback)
   *   - Backend: Database truth — single source of truth
   *
   * Neden backend'de de? Eğer birisi API'ye doğrudan "React", "REACT" gönderirse,
   * backend normalizasyonu olmadan aynı skill 2 farklı şekilde kaydedilirdi.
   * Bu LLM matching accuracy'sini düşürürdü.
   *
   * Prisma unique constraint (email) ihlal edilirse P2002 kodu döner.
   * Bunu yakalayıp anlamlı bir ConflictException fırlatıyoruz.
   */
  async create(input: CreateUserInput): Promise<UserDto> {
    const normalizedInput = this.normalizeCreateUserInput(input);

    try {
      return await this.prisma.user.create({
        data: normalizedInput,
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
   *
   * Normalizasyon: input → normalizasyon → DB update (defense-in-depth).
   */
  async update(id: string, input: UpdateUserInput): Promise<UserDto> {
    await this.ensureUserExists(id);

    const normalizedInput = this.normalizeUpdateUserInput(input);

    try {
      return await this.prisma.user.update({
        where: { id },
        data: normalizedInput,
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

  /**
   * Normalizasyon Helper — techStack, preferredRoles, preferredLocations'ı normalize et.
   *
   * Normalizasyon Kuralları:
   *   - Lowercase: "React" → "react"
   *   - Dot removal: "Node.js" → "nodejs"
   *   - Dedup: ["react", "REACT"] → ["react"]  (lowercase'ten sonra)
   *   - Empty removal: [] ve whitespace-only array'ler ignored
   *
   * Neden?
   *   1. LLM matching accuracy: "React" ve "REACT" aynı skill olarak görülecek
   *   2. Database consistency: single source of truth
   *   3. API contract: consumers reliable data alacak
   *
   * Immutable pattern: gelen input'u değiştirmeyiz, copy döneriz.
   */
  private normalizeCreateUserInput(input: CreateUserInput): CreateUserInput {
    const normalized: CreateUserInput = { ...input };

    if (normalized.techStack?.length) {
      normalized.techStack = this.normalizeStringArray(normalized.techStack);
    }

    if (normalized.preferredRoles?.length) {
      normalized.preferredRoles = this.normalizeStringArray(normalized.preferredRoles);
    }

    if (normalized.preferredLocations?.length) {
      normalized.preferredLocations = this.normalizeStringArray(
        normalized.preferredLocations,
      );
    }

    return normalized;
  }

  private normalizeUpdateUserInput(input: UpdateUserInput): UpdateUserInput {
    const normalized: UpdateUserInput = { ...input };

    if (normalized.techStack?.length) {
      normalized.techStack = this.normalizeStringArray(normalized.techStack);
    }

    if (normalized.preferredRoles?.length) {
      normalized.preferredRoles = this.normalizeStringArray(normalized.preferredRoles);
    }

    if (normalized.preferredLocations?.length) {
      normalized.preferredLocations = this.normalizeStringArray(
        normalized.preferredLocations,
      );
    }

    return normalized;
  }

  /**
   * String array normalizasyon helper.
   *
   * Adımlar:
   *   1. Her string'i normalize et: trim() → lowercase() → dot removal
   *   2. Boş string'leri filtrele
   *   3. Tekrarlı olanları kaldır (Set dedup)
   *   4. Array'e çevir ve dön
   *
   * @param items Raw string array
   * @returns Normalized deduplicated string array
   */
  private normalizeStringArray(items: string[]): string[] {
    if (!items.length) return [];

    const normalized = items
      .map((item) =>
        item
          .trim()                    // Whitespace
          .toLowerCase()             // Büyük harf → küçük
          .replaceAll('.', ''),      // Nokta removal (Node.js → nodejs)
      )
      .filter(Boolean);              // Empty string'ler kaldır

    return Array.from(new Set(normalized)); // Dedup via Set
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
