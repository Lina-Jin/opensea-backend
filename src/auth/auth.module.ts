import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthRequest } from 'src/entities';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports:[TypeOrmModule.forFeature([AuthRequest])],
  controllers: [AuthController],
  providers: [AuthService]
})
export class AuthModule {}
