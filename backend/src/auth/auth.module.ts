import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { ProfileCompletedGuard } from './profile-completed.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'campaignai_secret_key_123',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [AuthService, JwtAuthGuard, RolesGuard, ProfileCompletedGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, RolesGuard, ProfileCompletedGuard, JwtModule],
})
export class AuthModule {}
