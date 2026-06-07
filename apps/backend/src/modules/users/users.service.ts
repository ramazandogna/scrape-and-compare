/**
 * Users Service — user profile CRUD operations.
 *
 * This service manages the User table via Prisma ORM.
 * Controller handles the HTTP layer, Service handles the database layer (SRP).
 *
 * Why is NotFoundException thrown here?
 *   The "record not found" knowledge lives in the service layer.
 *   You could let the controller catch and convert to HTTP 404 but
 *   NestJS exception filter turns NotFoundException into a 404 automatically.
 *   So: service → exception → NestJS filter → 404 JSON response.
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
 * User DTO — user data returned to the frontend.
 *
 * We define our own DTO instead of Prisma's User type:
 *   - Returned fields are explicit
 *   - Sensitive fields (password, etc.) cannot leak later
 *   - API contract is decoupled from the DB schema
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

/** Prisma select — fetch only DTO fields (prevent over-fetching) */
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
   * Create a new user.
   *
   * Normalization Strategy (Defense-in-Depth):
   *   - Frontend: UX improvement (immediate feedback)
   *   - Backend: Database truth — single source of truth
   *
   * Why also on the backend? If someone hits the API directly with "React", "REACT",
   * without backend normalization the same skill would be saved two different ways.
   * That would degrade LLM matching accuracy.
   *
   * If the Prisma unique constraint (email) is violated, code P2002 is returned.
   * We catch it and throw a meaningful ConflictException.
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
   * List all users (most recently created first).
   */
  async findAll(): Promise<UserDto[]> {
    return this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Fetch user info by ID.
   *
   * findUnique → primary-key lookup, the fastest Prisma query.
   * If not found we throw 404 (frontend shows "no profile" message).
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
   * Update the user profile.
   *
   * Prisma update: undefined fields are not updated (PATCH semantics).
   * So if the frontend sends only { techStack: ["React", "TS"] },
   * only techStack is updated, the other fields stay the same.
   *
   * Normalization: input → normalize → DB update (defense-in-depth).
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
   * Check that the user exists — before update/delete.
   *
   * Why a separate method? You could say findById already does this, but
   * the update scenario has distinct error paths ("user missing → 404,
   * email conflict → 409"). Separating the check is cleaner.
   */
  private async ensureUserExists(id: string): Promise<void> {
    const count = await this.prisma.user.count({ where: { id } });
    if (count === 0) {
      throw new NotFoundException(`Kullanıcı bulunamadı: ${id}`);
    }
  }

  /**
   * Normalization Helper — normalize techStack, preferredRoles, preferredLocations.
   *
   * Normalization Rules:
   *   - Lowercase: "React" → "react"
   *   - Dot removal: "Node.js" → "nodejs"
   *   - Dedup: ["react", "REACT"] → ["react"]  (after lowercase)
   *   - Empty removal: [] and whitespace-only arrays are ignored
   *
   * Why?
   *   1. LLM matching accuracy: "React" and "REACT" are treated as the same skill
   *   2. Database consistency: single source of truth
   *   3. API contract: consumers get reliable data
   *
   * Immutable pattern: we never mutate the input, we return a copy.
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
   * String array normalization helper.
   *
   * Steps:
   *   1. Normalize each string: trim() → lowercase() → dot removal
   *   2. Filter out empty strings
   *   3. Drop duplicates (Set dedup)
   *   4. Convert back to array and return
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
          .toLowerCase()             // Upper → lower
          .replaceAll('.', ''),      // Dot removal (Node.js → nodejs)
      )
      .filter(Boolean);              // Drop empty strings

    return Array.from(new Set(normalized)); // Dedup via Set
  }
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Prisma P2002 unique constraint violation check.
 *
 * Prisma errors arrive as PrismaClientKnownRequestError instances.
 * code="P2002" → unique constraint violation.
 * Why duck typing instead of instanceof? The Prisma client can have
 * different class references across output paths.
 */
function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}
