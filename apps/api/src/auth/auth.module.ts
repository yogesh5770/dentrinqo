import { Module, Global } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  providers: [AuthService, AuthGuard, RolesGuard],
  controllers: [AuthController],
  exports: [AuthService, AuthGuard, RolesGuard],
})
export class AuthModule {}