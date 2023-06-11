import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entities/User';
import { Repository } from 'typeorm';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  //id값으로 userRepository에서 유저 정보 찾아서 리턴
  async getUser(id: number) {
    return await this.userRepository.findOneBy({ id });
  }
}
