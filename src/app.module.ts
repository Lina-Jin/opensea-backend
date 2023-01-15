import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config/dist';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AuthRequest } from './entities';

@Module({
  imports: [
    ConfigModule.forRoot(), 
    TypeOrmModule.forRootAsync({
    imports:[ConfigModule,AuthModule],
    useFactory: (configService: ConfigService) =>({
      type: 'mysql',
      host: configService.get('DB_HOST'),
      port: configService.get('DB_PORT'),
      username: configService.get('DB_USERNAME'),
      password: configService.get('DB_PASSWORD'),
      database: configService.get('DB_DBNAME'),
      entities:[AuthRequest],
      synchronize:false,//db초기화 및 테이블 재생성 옵션, 로컬시만 권장, 실행시 데이터가 사라짐
    }),
    inject: [ConfigService]
  }), 
  AuthModule
],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
