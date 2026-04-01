/**
 * Users Module — Kullanıcı profil yönetimi.
 *
 * Sorumluluk: User CRUD (Create, Read, Update)
 *   - POST /api/users       → yeni profil oluştur
 *   - GET /api/users/:id    → profil getir
 *   - PATCH /api/users/:id  → profil güncelle
 *
 * Delete yok — MVP'de kullanıcı silme özelliği gereksiz.
 *
 * PrismaService erişimi: DatabaseModule @Global() olduğu için
 * burada import etmeye gerek yok — otomatik erişilebilir.
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
