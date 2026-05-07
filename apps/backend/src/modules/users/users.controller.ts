/**
 * Users Controller — Kullanıcı profil REST API.
 *
 * Auth ile birlikte tüm endpoint'ler korunuyor — kullanıcı sadece kendi
 * profiline erişebilir. POST /users akışı /api/auth/signup'a taşındı.
 *
 * Endpoint'ler:
 *   GET   /api/users        → Sadece current user'ı array içinde döner
 *   GET   /api/users/:id    → :id current user değilse 403
 *   PATCH /api/users/:id    → :id current user değilse 403
 */

import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { updateUserSchema } from '@scrape/shared';
import type { UpdateUserInput } from '@scrape/shared';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { UsersService } from './users.service';
import type { UserDto } from './users.service';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthenticatedUser } from '@/modules/auth/auth.types';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/users — Frontend'in legacy "kullanıcı listesi" akışı için
   * geriye uyumlu kalır; sadece current user'ı tek-elemanlı dizide döner.
   */
  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<UserDto[]> {
    const me = await this.usersService.findById(user.id);
    return [me];
  }

  /** GET /api/users/:id — sadece kendi profiline erişim. */
  @Get(':id')
  async findById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserDto> {
    ensureOwnership(id, user.id);
    return this.usersService.findById(id);
  }

  /** PATCH /api/users/:id — sadece kendi profilini güncelleyebilir. */
  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserDto> {
    ensureOwnership(id, user.id);
    return this.usersService.update(id, body);
  }
}

function ensureOwnership(targetId: string, currentId: string): void {
  if (targetId !== currentId) {
    throw new ForbiddenException('Sadece kendi profiline erişebilirsin');
  }
}
