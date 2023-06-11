import { ConfigService } from '@nestjs/config';
import { NftProperty } from './../entities/NftProperty';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Nft } from 'src/entities';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';

export interface NftAttribute {
  trait_type: string;
  value: string;
}

export interface ILazyNft {
  address: string;
  name: string;
  image: string;
  description: string;
  attributes: NftAttribute[];
}

@Injectable()
export class MintingService {
  //nft, nftproperty db 가져오기
  constructor(
    @InjectRepository(Nft) private nftRepository: Repository<Nft>,
    @InjectRepository(NftProperty)
    private nftPropertyRepository: Repository<NftProperty>,
    //환경변수값 사용
    private configService: ConfigService,
  ) {}

  //lazy 민팅 컨트렉트 가져오기
  get lazyMintingContract() {
    return this.configService.get('LAZY_MINTING_CONTRACT');
  }

  //lazy 민팅
  async generateNftLazy({
    address,
    name,
    image,
    description,
    attributes,
  }: ILazyNft) {
    //해당 지갑에서 민팅된 마지막 토큰 가져오기
    const lastToken = await this.nftRepository.findOne({
      where: {
        creatorAddress: address,
        contractAddress: this.lazyMintingContract,
      },
      order: { tokenId: 'desc' },
    });

    //지값에 최초로 발행시
    let tokenIndex = 1;

    //lastToken이 존재시, 새로운 tokenIndex는 기존 토큰 아이에서 앞 20바이트 즉 주로를 자른값에 +1
    if (lastToken) {
      tokenIndex = parseInt(lastToken.tokenId.slice(40), 16) + 1;
    }

    //lazy 민팅된 nft를 db에 넣기
    const newToken = new Nft();
    newToken.creatorAddress = address;
    newToken.contractAddress = this.lazyMintingContract;
    newToken.name = name;
    newToken.description = description;
    newToken.image = image;
    newToken.isLazy = true;
    newToken.tokenId = (
      ethers.utils.hexZeroPad(ethers.utils.hexlify('0x' + address), 20) +
      ethers.utils.hexZeroPad(ethers.utils.hexlify(tokenIndex), 12)
    ).replace(/0x/g, '');
    newToken.properties = attributes
      .filter((property) => property.trait_type && property.value)
      .map(({ trait_type, value }) => {
        const property = new NftProperty();

        property.nft = newToken;
        property.propertyKey = trait_type;
        property.value = value;

        return property;
      });

    const result = await this.nftRepository.save(newToken);
    await this.nftPropertyRepository.save(newToken.properties);

    return result;
  }
}
