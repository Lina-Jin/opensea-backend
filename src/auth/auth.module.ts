import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthRequest } from 'src/entities';
import { User } from 'src/entities/User';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    //jwt 모듈에서 secret값을 사용 할수 있도록 ConfigModule, ConfigService import하기
    ConfigModule,
    TypeOrmModule.forFeature([AuthRequest, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy], //JwtStrategy를 등록
})
export class AuthModule {}
