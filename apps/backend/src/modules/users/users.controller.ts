/**
 * Users Controller — Kullanıcı profil REST API.
 *
 * Endpoint'ler:
 *   POST  /api/users     → Yeni kullanıcı oluştur
 *   GET   /api/users/:id → Kullanıcı bilgisi getir
 *   PATCH /api/users/:id → Kullanıcı güncelle
 *
 * Validation:
 *   Body → ZodValidationPipe ile create/update schema'dan geçer.
 *   URL params (id) → ParseUUIDPipe ile UUID formatı doğrulanır.
 *
 * Neden DELETE yok?
 *   MVP'de kullanıcı silme özelliği planlanmadı.
 *   İleride gerekirse eklemek 5 satır iş.
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  UsePipes,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { createUserSchema, updateUserSchema } from '@scrape/shared';
import type { CreateUserInput, UpdateUserInput } from '@scrape/shared';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { UsersService } from './users.service';
import type { UserDto } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * POST /api/users — Yeni kullanıcı oluştur.
   *
   * Body: { email, name, techStack?, experienceYears?, preferredRoles?, preferredLocations? }
   *
   * Response: 201 Created + UserDto
   * Hata: 400 (validation) | 409 (email zaten var)
   *
   * @HttpCode(201) — NestJS POST default'u zaten 201, ama açıkça belirtmek
   * kodun niyetini daha okunabilir kılar.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(createUserSchema))
  async create(@Body() body: CreateUserInput): Promise<UserDto> {
    return this.usersService.create(body);
  }

  /**
   * GET /api/users/:id — Kullanıcı bilgisi getir.
   *
   * ParseUUIDPipe: URL'deki :id parametresinin gerçek UUID formatında
   * olduğunu doğrular. "abc123" gibi geçersiz ID'ler 400 döner.
   *
   * Response: 200 OK + UserDto
   * Hata: 400 (geçersiz UUID) | 404 (kullanıcı yok)
   */
  @Get(':id')
  async findById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<UserDto> {
    return this.usersService.findById(id);
  }

  /**
   * PATCH /api/users/:id — Kullanıcı güncelle.
   *
   * PATCH vs PUT farkı:
   *   - PUT: "Tüm kaynağı değiştir" — TÜM alanlar zorunlu
   *   - PATCH: "Sadece gönderilenleri güncelle" — kısmi güncelleme
   *
   * Frontend sadece { techStack: ["React"] } gönderebilir,
   * geriye kalan alanlar DB'deki değerlerini korur.
   *
   * Response: 200 OK + güncellenmiş UserDto
   * Hata: 400 (validation/uuid) | 404 (kullanıcı yok) | 409 (email çakışması)
   */
  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateUserSchema))
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateUserInput,
  ): Promise<UserDto> {
    return this.usersService.update(id, body);
  }
}
