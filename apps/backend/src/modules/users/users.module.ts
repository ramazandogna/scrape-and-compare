/**
 * Users Module — user profile management.
 *
 * Responsibility: User CRUD (Create, Read, Update)
 *   - POST /api/users       → create a new profile
 *   - GET /api/users/:id    → fetch profile
 *   - PATCH /api/users/:id  → update profile
 *
 * No delete — user deletion is unnecessary in MVP.
 *
 * PrismaService access: since DatabaseModule is @Global() there is no
 * need to import it here — it's available automatically.
 */

import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
