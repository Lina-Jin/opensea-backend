import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthRequest } from 'src/entities';
import { Repository } from 'typeorm';
import {v4} from "uuid"

@Injectable()
export class AuthService {
  //AuthRequest를 사용하기 위한 레파지토리 가져오기
  constructor (
    @InjectRepository(AuthRequest)
    private authRequestRepository:Repository<AuthRequest>
  ){}

  //클라이언트 요청시 AuthRequest를 db에 넣어주기
  async generateAuthRequest(address:string){
    const authRequest = new AuthRequest()

    authRequest.address =address;
    authRequest.nonce =v4();
    authRequest.expiredAt = new Date (new Date().getTime() +10*60*1000) //현재 시간으로부터 10분 후 

    //새로 생성된 정보를 db에 저장하고 리턴
    return await this.authRequestRepository.save(authRequest)
  }

  //사인 메세지 생성
  generateSignatureMessage(authRequest:AuthRequest){
    return `welcocme to  opensea \naddress:${authRequest.address}\nnonce: ${authRequest.nonce}`
  }

}
