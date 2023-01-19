import { Controller, Param,Get, HttpException, HttpStatus,Post,Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor (private authService:AuthService){}

  //주소 받을시 db생성 후, 사인 메세지 및 유효 시간 리턴
  @Get (':address')
  async getSignMessage(@Param()params){
    const address =params.address;

    //지갑주소가 정확한 양식인지 체크 (이더리움 지갑주소는 16진수, 문자열 40 )
    if(! /^[0-9a-fA-F]{40}$/.test(address)){
      throw new HttpException('wrong address', HttpStatus.BAD_REQUEST);
    }

    const authRequest = await this.authService.generateAuthRequest(address);

    return {
      id: authRequest.id,
      message: this.authService.generateSignatureMessage(authRequest),
      expiredAt: authRequest.expiredAt,
    }
  }

  @Post('verify')
  async verifySignMessage(@Body() body){
    const {signature, id} =body
     return this.authService.verifyAuthRequest(signature, id)
  }
}
