import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Processor, Process } from '@nestjs/bull';
import { Nft, NftContract, NftProperty } from 'src/entities';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bull';
import { firstValueFrom } from 'rxjs';
import { Logger } from '@nestjs/common';

@Processor('nft')
export class NftConsumer {
  private readonly logger = new Logger(NftConsumer.name);

  private readonly alchemyEndpoint: string;
  private readonly alchemyApiKey: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    @InjectRepository(Nft) private nftRepository: Repository<Nft>,
    @InjectRepository(NftContract)
    private nftContractRepository: Repository<NftContract>,
  ) {
    this.alchemyEndpoint = configService.get('ALCHEMY_ENDPOINT');
    this.alchemyApiKey = configService.get('ALCHEMY_API_KEY');
  }

  @Process('nft-token-load')
  //알케미로 토큰 리스트를 받아 db업데이트하기
  async loadTokenList(job: Job) {
    this.logger.log('in start');

    let contract = null;
    while (!contract) {
      //컨트랙트 정보를 가져오기
      contract = await this.nftContractRepository.findOne({
        where: { contractAddress: job.data.contractAddress },
      });
    }
    this.logger.log('contract', contract);

    //싱크 완료시(synced=true) 종료
    if (contract.synced) {
      return;
    }

    //싱크 미완료시(synced=false) 알케미로부터 토큰 리스트 업데이트하기
    let startToken = '0';
    let added = 0;
    while (startToken) {
      //알케미에서 첫번째 100개 토큰 데이타 받아서 promise 형태로 전환
      const result = await firstValueFrom(
        this.httpService.get(
          `/nft/v2/${this.alchemyApiKey}/getNFTsForCollection`,
          {
            baseURL: this.alchemyEndpoint,
            params: {
              contractAddress: job.data.contractAddress,
              withMetadata: true,
              startToken,
            },
          },
        ),
      );

      const nfts = result.data.nfts;

      //다음 100개 페이지 값을 startToken에 저장
      //다음 페이지가 없을시 startToken 값이 null이 되면서 위 while문 중단
      startToken = result.data.nextToken;

      //받은 토큰 데이타를 db에 저장
      const nftRows = nfts.map((nft) => {
        const nftRow = new Nft();

        nftRow.tokenId = nft.id.tokenId;
        nftRow.contractAddress = job.data.contractAddress;
        nftRow.description = nft.description;
        nftRow.isLazy = false;
        nftRow.image = nft?.media[0]?.gateway;
        nftRow.properties = nft?.metadata?.attributes.map((attribute) => {
          const property = new NftProperty();
          property.propertyKey = attribute.trait_type;
          property.value = attribute.value;

          return property;
        });

        return nftRow;
      });

      for (const nftRow of nftRows) {
        await this.nftRepository.save(nftRow);
      }

      //while 한번 실행시 마다 추가된 nft 개수를 로깅
      added += nftRows.length; //토큰 개수 만큼 더하기
      this.logger.log(
        `loading NFTs for contract ${job.data.contractAddress}. (${added}/?)`,
      );
    }

    //토큰 리스트 업데이트 완료 후 컨트랙트 상태를 싱크 완료로 바꿔주기
    contract.synced = true;
    await this.nftContractRepository.save(contract);
  }
}
