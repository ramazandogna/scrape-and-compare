/**
 * Users Tests — User CRUD and Zod validation tests.
 *
 * What do we test?
 *   1. Zod schema validation (createUserSchema, updateUserSchema)
 *   2. Service business logic (with a mock Prisma)
 *   3. Edge cases: empty array, max limit, email format
 *
 * Test approach: the service is tested with a mock PrismaService.
 * No real DB required — unit tests must be fast and isolated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUserSchema, updateUserSchema } from '@scrape/shared';
import { UsersService } from '../modules/users/users.service';
import type { UserDto } from '../modules/users/users.service';

// ═══════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════

const MOCK_USER: UserDto = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'dev@example.com',
  name: 'Test User',
  techStack: ['React', 'TypeScript', 'Node.js'],
  experienceYears: 5,
  preferredRoles: ['Frontend Developer'],
  preferredLocations: ['Istanbul', 'Remote'],
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const VALID_CREATE_INPUT = {
  email: 'dev@example.com',
  name: 'Test User',
  techStack: ['React', 'TypeScript'],
  experienceYears: 5,
  preferredRoles: ['Frontend Developer'],
  preferredLocations: ['Istanbul'],
};

const NORMALIZED_CREATE_INPUT = {
  email: 'dev@example.com',
  name: 'Test User',
  techStack: ['react', 'typescript'],
  experienceYears: 5,
  preferredRoles: ['frontend developer'],
  preferredLocations: ['istanbul'],
};

// ═══════════════════════════════════════════
// ZOD SCHEMA TESTS
// ═══════════════════════════════════════════

describe('createUserSchema', () => {
  it('geçerli input kabul edilir', () => {
    const result = createUserSchema.safeParse(VALID_CREATE_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('dev@example.com');
      expect(result.data.techStack).toEqual(['React', 'TypeScript']);
    }
  });

  it('minimal input kabul edilir — sadece email + name', () => {
    const result = createUserSchema.safeParse({
      email: 'min@test.com',
      name: 'Min',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.techStack).toEqual([]);
      expect(result.data.experienceYears).toBe(0);
      expect(result.data.preferredRoles).toEqual([]);
      expect(result.data.preferredLocations).toEqual([]);
    }
  });

  it('geçersiz email reddedilir', () => {
    const result = createUserSchema.safeParse({
      ...VALID_CREATE_INPUT,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('boş name reddedilir', () => {
    const result = createUserSchema.safeParse({
      ...VALID_CREATE_INPUT,
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('negatif experienceYears reddedilir', () => {
    const result = createUserSchema.safeParse({
      ...VALID_CREATE_INPUT,
      experienceYears: -1,
    });
    expect(result.success).toBe(false);
  });

  it('50 üzeri experienceYears reddedilir', () => {
    const result = createUserSchema.safeParse({
      ...VALID_CREATE_INPUT,
      experienceYears: 51,
    });
    expect(result.success).toBe(false);
  });

  it('string experienceYears coerce ile number olur', () => {
    const result = createUserSchema.safeParse({
      ...VALID_CREATE_INPUT,
      experienceYears: '7',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.experienceYears).toBe(7);
    }
  });

  it('50 den fazla techStack reddedilir', () => {
    const result = createUserSchema.safeParse({
      ...VALID_CREATE_INPUT,
      techStack: Array.from({ length: 51 }, (_, i) => `skill-${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('boş string techStack elemanı reddedilir', () => {
    const result = createUserSchema.safeParse({
      ...VALID_CREATE_INPUT,
      techStack: ['React', ''],
    });
    expect(result.success).toBe(false);
  });

  it('email whitespace trim edilir', () => {
    const result = createUserSchema.safeParse({
      ...VALID_CREATE_INPUT,
      email: '  dev@example.com  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('dev@example.com');
    }
  });
});

describe('updateUserSchema', () => {
  it('boş obje kabul edilir — hiçbir şey güncellenmez', () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('tek alan güncellemesi kabul edilir', () => {
    const result = updateUserSchema.safeParse({
      techStack: ['Vue', 'Nuxt'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.techStack).toEqual(['Vue', 'Nuxt']);
      expect(result.data.email).toBeUndefined();
    }
  });

  it('geçersiz email güncelleme reddedilir', () => {
    const result = updateUserSchema.safeParse({
      email: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════
// SERVICE TESTS (Mock Prisma)
// ═══════════════════════════════════════════

/**
 * Mock PrismaService factory — clean mock for every test.
 *
 * Why a factory? If vi.fn() references are shared across tests, one test's
 * mock behavior affects another. The factory produces a new object each time.
 */
function createMockPrisma() {
  return {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    // The UsersService constructor expects PrismaService,
    // but we pass a mock — bypassing DI (unit test)
    service = new UsersService(mockPrisma as never);
  });

  describe('create', () => {
    it('başarılı oluşturma — UserDto döner', async () => {
      mockPrisma.user.create.mockResolvedValue(MOCK_USER);

      const result = await service.create(VALID_CREATE_INPUT);

      expect(result).toEqual(MOCK_USER);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: NORMALIZED_CREATE_INPUT,
        select: expect.objectContaining({ id: true, email: true }),
      });
    });

    it('duplicate email → ConflictException fırlatır', async () => {
      mockPrisma.user.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.create(VALID_CREATE_INPUT)).rejects.toThrow(
        'Bu email adresi zaten kayıtlı',
      );
    });

    it('diğer Prisma hataları aynen fırlatılır', async () => {
      const dbError = new Error('Connection refused');
      mockPrisma.user.create.mockRejectedValue(dbError);

      await expect(service.create(VALID_CREATE_INPUT)).rejects.toThrow(
        'Connection refused',
      );
    });
  });

  describe('findById', () => {
    it('mevcut kullanıcı — UserDto döner', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

      const result = await service.findById(MOCK_USER.id);

      expect(result).toEqual(MOCK_USER);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: MOCK_USER.id },
        select: expect.objectContaining({ id: true, email: true }),
      });
    });

    it('olmayan kullanıcı → NotFoundException fırlatır', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.findById('non-existent-id'),
      ).rejects.toThrow('Kullanıcı bulunamadı');
    });
  });

  describe('update', () => {
    it('başarılı güncelleme — güncel UserDto döner', async () => {
      const updatedUser = { ...MOCK_USER, techStack: ['Vue', 'Nuxt'] };
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(MOCK_USER.id, {
        techStack: ['Vue', 'Nuxt'],
      });

      expect(result.techStack).toEqual(['Vue', 'Nuxt']);
    });

    it('olmayan kullanıcı güncelleme → NotFoundException', async () => {
      mockPrisma.user.count.mockResolvedValue(0);

      await expect(
        service.update('non-existent', { name: 'New' }),
      ).rejects.toThrow('Kullanıcı bulunamadı');
    });

    it('email çakışması → ConflictException', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.user.update.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.update(MOCK_USER.id, { email: 'taken@test.com' }),
      ).rejects.toThrow('Bu email adresi zaten kayıtlı');
    });

    it('update payload normalize edilerek Prisma ya gider', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.user.update.mockResolvedValue(MOCK_USER);

      await service.update(MOCK_USER.id, {
        techStack: ['React', 'Node.js', 'react'],
        preferredRoles: ['Frontend Developer'],
        preferredLocations: ['Istanbul'],
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_USER.id },
          data: {
            techStack: ['react', 'nodejs'],
            preferredRoles: ['frontend developer'],
            preferredLocations: ['istanbul'],
          },
        }),
      );
    });
  });
});
