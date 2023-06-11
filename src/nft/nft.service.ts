import { ConfigService } from '@nestjs/config';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Nft, NftContract } from 'src/entities';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { catchError, from, map, mergeMap, of, zip } from 'rxjs';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Logger } from '@nestjs/common';
import { BigNumber, ethers } from 'ethers';

@Injectable()
export class NftService {
  private readonly logger = new Logger('Nft service');

  private readonly alchemyEndpoint: string;
  private readonly alchemyApiKey: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    @InjectRepository(Nft) private nftRepository: Repository<Nft>,
    @InjectRepository(NftContract)
    private nftContractRepository: Repository<NftContract>,
    @InjectQueue('nft') private nftQueue: Queue,
  ) {
    this.alchemyEndpoint = configService.get('ALCHEMY_ENDPOINT');
    this.alchemyApiKey = configService.get('ALCHEMY_API_KEY');
  }

  //nft 컨트랙트 정보 가져오기
  getNftContract(contractAddress: string) {
    return from(
      //NftContract db에 저장되어 있는지 확인
      this.nftContractRepository.findOne({
        where: {
          contractAddress,
        },
      }),
    ).pipe(
      //NftContract db에 저장되어 있으면 컨트랙트 정보 리턴, 없으면 null 리턴
      mergeMap((nftContract) => {
        if (nftContract) {
          return of(nftContract);
        }

        //alchemy로부터 조회하여 contract 데이터 받아오기
        return this.httpService
          .get(`/nft/v2/${this.alchemyApiKey}/getContractMetadata`, {
            baseURL: this.alchemyEndpoint,
            params: {
              contractAddress,
            },
          })
          .pipe(
            //알케미 api 에러 처리
            catchError(() => {
              throw new HttpException('not NFT contract', HttpStatus.NOT_FOUND);
            }),
            //alchemy에서 받은 컨트랙트 데이터를 db에 저장
            mergeMap(async (result) => {
              const contractMetadata = result.data.contractMetadata;

              if (contractMetadata.tokenType != 'ERC721') {
                throw new HttpException('not erc721', HttpStatus.NOT_FOUND);
              } //erc721만 취급

              const nftContract = new NftContract();
              nftContract.contractAddress = contractAddress;
              nftContract.name = contractMetadata.name;
              nftContract.description = contractMetadata.openSea?.description;
              nftContract.symbol = contractMetadata.symbol;
              nftContract.synced = false;
              nftContract.image = contractMetadata.openSea?.imageUrl;
              nftContract.totalSupply = contractMetadata.totalSupply || 0;

              const newData = await this.nftContractRepository.save(
                nftContract,
              );
              this.logger.log('newData', newData);
              //토큰 리스트 가져오기
              this.nftQueue.add('nft-token-load', { contractAddress });

              return newData;
            }),
          );
      }),
    );
  }

  //요청한 컨트랙트 상태가 synced이면 db에서 토큰 리스트 가져오기, 그외 알케미에 요청하여 받기
  getNfts(contractAddress: string, startToken?: string) {
    return this.getNftContract(contractAddress).pipe(
      mergeMap((contract) => {
        if (contract.synced) {
          return this.getNftsFromDB(contractAddress, startToken);
        } else {
          return this.getNftsFromAlchemy(contractAddress, startToken);
        }
      }),
    );
  }

  //db에서 nft 토큰 리스트 가져오기, 최대 100개
  getNftsFromDB(contractAddress: string, startToken?: string) {
    return from(
      this.nftRepository.find({
        where: {
          tokenId: MoreThanOrEqual(startToken || '0'),
          contractAddress,
        },
        order: {
          tokenId: 'asc',
        },
        take: 100,
      }),
    ).pipe(
      map((nfts) =>
        nfts.map((nft) => ({
          tokenId: nft.tokenId,
          name: nft.name,
          description: nft.description,
          image: nft.image,
        })),
      ),
    );
  }

  //Alchemy에서 nft 토큰 리스트 가져오기, 최대 100개
  getNftsFromAlchemy(contractAddress: string, startToken?: string) {
    return this.httpService
      .get(`/nft/v2/${this.alchemyApiKey}/getNFTsForCollection`, {
        baseURL: this.alchemyEndpoint,
        params: {
          contractAddress,
          withMetadata: true,
          startToken,
        },
      })
      .pipe(
        map((result) => {
          return result.data.nfts.map((nft) => ({
            tokenId: nft.id.tokenId,
            name: nft.title,
            description: nft.description,
            image: nft.media[0]?.gateway,
          }));
        }),
      );
  }

  //next토큰 값 구하기
  getNextToken(result) {
    //result의 마지막 tokenId를 가져와서 BigNumber를 받아서 1을 더해주고 toHexString으로 바꿔준 다음 hexZeroPad로 32바이트로 고정해주기
    return result.length > 0
      ? ethers.utils.hexZeroPad(
          BigNumber.from(result[result.length - 1].tokenId)
            .add(1)
            .toHexString(),
          32,
        )
      : null;
  }

  //개별 토큰 메타데이터 가져오기
  getNftMetadta(contractAddress: string, tokenId: string) {
    return this.httpService
      .get(`/nft/v2/${this.alchemyApiKey}/getNFTMetadata`, {
        baseURL: this.alchemyEndpoint,
        params: {
          contractAddress,
          tokenId,
        },
      })
      .pipe(map((result) => result.data));
  }

  //토큰 소유자 가져오기
  getOwnersForToken(contractAddress: string, tokenId: string) {
    return this.httpService
      .get(`/nft/v2/${this.alchemyApiKey}/getOwnersForToken`, {
        baseURL: this.alchemyEndpoint,
        params: {
          contractAddress,
          tokenId,
        },
      })
      .pipe(map((result) => result.data));
  }

  //getNftMetadta와 getOwnersForToken를 호출하여 데이타를 취합
  getNft(contractAddress: string, tokenId: string) {
    //zip 함수를 async하게 실행하여 결과를 배열로 리턴
    return zip(
      this.getNftMetadta(contractAddress, tokenId),
      this.getOwnersForToken(contractAddress, tokenId),
    ).pipe(
      map(([nftMetadata, ownersForToken]) => {
        return {
          ...nftMetadata,
          ...ownersForToken,
        };
      }),
    );
  }

  //알케미 api로 해당 nft컨트랙트의 최근 1000개 transfer 히스토리 가져오기
  getRecentHistory(contractAddress: string) {
    return this.httpService
      .post(
        `/v2/${this.alchemyApiKey}`,
        {
          id: 1,
          jsonrpc: '2.0',
          method: 'alchemy_getAssetTransfers',
          params: [
            {
              fromBlock: '0x0',
              toBlock: 'latest',
              category: ['ERC721'],
              contractAddresses: [contractAddress],
              withMetadata: false,
              maxCount: '0x3e8',
              order: 'desc',
            },
          ],
        },
        {
          baseURL: this.alchemyEndpoint,
        },
      )
      .pipe(map((result) => result.data?.result?.transfers || [])); //결과 값중 transfer만 남기기
  }
}
