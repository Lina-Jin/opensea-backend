import { NftService } from './nft.service';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { map } from 'rxjs';
import { BigNumber } from 'ethers';

@Controller('nft')
export class NftController {
  constructor(private nftService: NftService) {}

  @Get('/contract/:address')
  async getContractMetadata(@Param() param) {
    const { address } = param;
    return this.nftService.getNftContract(address);
  }

  @Get('/contract/:address/tokens')
  async getNfts(@Param() param, @Query() query) {
    const { address } = param;
    const { startToken } = query;

    return this.nftService.getNfts(address, startToken).pipe(
      map((result) => ({
        result,
        nextToken: this.nftService.getNextToken(result),
      })),
    );
  }

  @Get('/contract/:address/tokens/:tokenId')
  async getOneNft(@Param() param) {
    const { address, tokenId } = param;

    return this.nftService.getNft(address, tokenId);
  }

  @Get('/contract/:address/tokens/:tokenId/history')
  async getNftHistory(@Param() param) {
    const { address, tokenId } = param;

    //최큰 천개 히스토리 중 해당 토큰 아이디만 리턴
    return this.nftService.getRecentHistory(address).pipe(
      map((history) => {
        return history
          .filter((event) =>
            //히스토리의 erc721TokenId와 api 호출 tokenid가 같은것 만 리턴
            //event.erc721TokenId가 스티링인데 몇진수로 표현될지 알수 없으므로 bignumber 전환 필수
            BigNumber.from(event.erc721TokenId).eq(BigNumber.from(tokenId)),
          )
          .slice(0, 3); //이벤트를 최대 3개만 받기
      }),
    );
  }
}
