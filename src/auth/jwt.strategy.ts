import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      //Request에서 JWT 토큰을 추출하는 방법을 설정 -> Authorization에서 Bearer Token에 JWT 토큰을 담아 전송해야한다.
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // header의 bearerToken을 해석
      ignoreExpiration: false, //true로 설정하면 Passport에 토큰 검증을 위임하지 않고 직접 검증, false는 Passport에 검증 위임
      secretOrKey: configService.get('JWT_SECRET'), //비밀키
    });
  }

  //jwt 토큰 값을 파싱하여 아이디와 주소를 가져오기
  async validate(payload: any) {
    return { userId: payload.sub, address: payload.address };
  }
}
