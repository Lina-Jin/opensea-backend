import { JwtAuthGuard } from './../auth/jwt-auth.guard';
import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { MintingService } from './minting.service';

@Controller('minting')
export class MintingController {
  constructor(private mintingService: MintingService) {}

  @UseGuards(JwtAuthGuard) //로그인 유저만 사용하도록 제한
  @Post()
  async mintLazy(@Body() body, @Request() request) {
    const { address } = request.user;
    const { name, image, description, properties } = body;

    //lazy민팅 함수 호출
    const token = await this.mintingService.generateNftLazy({
      address,
      name,
      image,
      description,
      attributes: properties,
    });

    return {
      ...token,
      properties: token.properties.map((v) => ({
        trait_type: v.propertyKey,
        value: v.value,
      })),
    };
  }
}
