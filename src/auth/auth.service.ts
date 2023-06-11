import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthRequest } from 'src/entities';
import { Repository } from 'typeorm';
import { v4 } from 'uuid';
import { ethers } from 'ethers';
import { User } from 'src/entities/User';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    //AuthRequest를 사용하기 위한 레파지토리 가져오기
    @InjectRepository(AuthRequest)
    private authRequestRepository: Repository<AuthRequest>,
    //✅ User테이블 import
    @InjectRepository(User)
    private userRepository: Repository<User>,
    //✅
    private jwtService: JwtService,
  ) {}

  //클라이언트 요청시 AuthRequest를 db에 넣어주기
  async generateAuthRequest(address: string) {
    const authRequest = new AuthRequest();

    authRequest.address = address;
    authRequest.nonce = v4();
    authRequest.expiredAt = new Date(new Date().getTime() + 10 * 60 * 1000); //현재 시간으로부터 10분 후

    //새로 생성된 정보를 db에 저장하고 리턴
    return await this.authRequestRepository.save(authRequest);
  }

  //사인 메세지 생성
  generateSignatureMessage(authRequest: AuthRequest) {
    return `welcocme to  opensea \naddress:${authRequest.address}\nnonce: ${authRequest.nonce}`;
  }

  //서명 검증
  async verifyAuthRequest(id: number, signature: string) {
    //id 값이 일치한 사용되지않은 authRequest가져오기(재진입 공격 막기위해)
    const authRequest = await this.authRequestRepository.findOne({
      where: { id, verified: false },
    });

    if (!authRequest) {
      throw new HttpException('auth not found', HttpStatus.BAD_REQUEST);
    }

    //만료데이터가 있고 현재  시간보다 만료시간이 더전이면 완료 에러 리턴
    if (
      authRequest.expiredAt &&
      authRequest.expiredAt.getTime() < new Date().getTime()
    ) {
      throw new HttpException('expired', HttpStatus.BAD_REQUEST);
    }

    //서명 검증: verifyMessage로 리턴 받은 recoverAddr가 db 주소와 일치 한지 검증
    const recoverAddr = ethers.utils.verifyMessage(
      this.generateSignatureMessage(authRequest),
      signature,
    );
    if (
      recoverAddr.replace('0x', '').toLowerCase() !==
      authRequest.address.toLowerCase()
    ) {
      throw new HttpException('invalid', HttpStatus.BAD_REQUEST);
    }
    authRequest.verified = true;
    await this.authRequestRepository.save(authRequest);

    //✅ 인증 성공 시 authRequest 에서 주소를 가져와 유저 조회
    let user = await this.userRepository.findOne({
      where: { address: authRequest.address },
    });
    if (!user) {
      //db가 없으면(최초 로그인 등) db 추가
      user = new User();
      user.address = authRequest.address;
      user = await this.userRepository.save(user);
    }

    //✅Jwt 토큰을 생성 후 클라이언트에게 반환
    return {
      accessToken: this.jwtService.sign({
        sub: user.id,
        address: user.address,
      }),
    };
  }
}
