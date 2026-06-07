/**
 * Users Controller — user profile REST API.
 *
 * With auth, all endpoints are protected — users can only access
 * their own profile. The POST /users flow has moved to /api/auth/signup.
 *
 * Endpoints:
 *   GET   /api/users        → Returns only the current user wrapped in an array
 *   GET   /api/users/:id    → 403 if :id is not the current user
 *   PATCH /api/users/:id    → 403 if :id is not the current user
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
   * GET /api/users — Backwards compatible with the frontend's legacy
   * "user list" flow; returns only the current user as a single-element array.
   */
  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<UserDto[]> {
    const me = await this.usersService.findById(user.id);
    return [me];
  }

  /** GET /api/users/:id — access only to own profile. */
  @Get(':id')
  async findById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserDto> {
    ensureOwnership(id, user.id);
    return this.usersService.findById(id);
  }

  /** PATCH /api/users/:id — can only update own profile. */
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
