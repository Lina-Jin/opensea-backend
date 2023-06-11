import { Controller, UseGuards, Get, Request } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  //인증된 유저만 호출할수 있도록 선언
  @UseGuards(JwtAuthGuard)
  //현재 로그인된 유저 정보 가져오는 api
  //req.user: jwt.strategy.ts 의 validate 값이 들어간 객체
  @Get('me')
  async getMe(@Request() req) {
    const userId = req.user.userId;
    return this.userService.getUser(userId);
  }
}
