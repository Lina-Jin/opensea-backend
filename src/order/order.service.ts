import { Order } from './../entities/Order';
import { ConfigService } from '@nestjs/config';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { BigNumber, ethers } from 'ethers';
import {
  erc20Abi,
  erc721Abi,
  exchangeAbi,
  proxyRegistryAbi,
} from './order.abi';
import { OrderSig, SolidityOrder } from './order.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

@Injectable()
export class OrderService {
  private readonly alchemyKey: string;

  private readonly provider: ethers.providers.JsonRpcProvider;
  private readonly proxyRegistryContract: ethers.Contract;

  private readonly exchangeAddress: string;
  private readonly exchangeContract: ethers.Contract;

  private readonly wethContractAddress: string;

  constructor(
    configService: ConfigService,
    @InjectRepository(Order) private orderRepository: Repository<Order>,
  ) {
    //알케미를 통해 컨트랙트 함수 호출 하므로 알케미 키와 네트워크 저장
    this.alchemyKey = configService.get('ALCHEMY_API_KEY');
    const network = configService.get('ALCHEMY_NETWORK');

    this.provider = new ethers.providers.AlchemyProvider(
      network,
      this.alchemyKey,
    );

    this.proxyRegistryContract = new ethers.Contract(
      configService.get('PROXY_REGISTRY_CONTRACT_ADDRESS'),
      proxyRegistryAbi,
      this.provider, //알케미 provider
    );

    this.exchangeAddress = configService.get('EXCHANGE_CONTRACT_ADDRESS');
    this.exchangeContract = new ethers.Contract(
      this.exchangeAddress,
      exchangeAbi,
      this.provider, //알케미 provider
    );

    this.wethContractAddress = configService.get('WETH_CONTRACT_ADDRESS');
  }

  //판매주문을 생성
  async generateSellOrder({ maker, contract, tokenId, price, expirationTime }) {
    //판매 주문 생성
    const solidityOrder = {
      exchange: this.exchangeAddress,
      maker: maker,
      taker: '0x0000000000000000000000000000000000000000', //특정 판매가 아니므로 null
      saleSide: 1, //SaleSide {BUY,SELL}이므로 buy는 0, sell은1
      saleKind: 0, //SaleKind { FIXED_PRICE, AUCTION } 이므로 FIXED_PRICE는 0
      target: contract,
      paymentToken: '0x0000000000000000000000000000000000000000', //eth로 거래하므로 null
      calldata_: [
        '0x42842e0e', //safeTransferFrom
        ethers.utils.hexZeroPad(maker, 32).replace('0x', ''), //from = maker 주소
        ethers.utils.hexZeroPad('0x00', 32).replace('0x', ''), //to = 0
        this.toUint256(tokenId).replace('0x', ''), //32바이트 토큰 아이디
      ].join(''),
      replacementPattern: [
        '0x00000000',
        '0000000000000000000000000000000000000000000000000000000000000000',
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        '0000000000000000000000000000000000000000000000000000000000000000',
      ].join(''),
      staticTarget: '0x0000000000000000000000000000000000000000',
      staticExtra: '0x',
      basePrice: BigNumber.from(price).toHexString(), //고정 값 거래므로 baseprice =  endprice
      endPrice: BigNumber.from(price).toHexString(),
      listingTime: 0, //거래생성 될시 거래가 가능하도록 0으로 설정
      expirationTime,
      salt: ethers.utils.hexZeroPad(ethers.utils.randomBytes(32), 32), //32바이트 랜덤 값
    } as SolidityOrder;

    //db에 주문 저장 후 리턴
    const order = new Order();
    order.raw = JSON.stringify(solidityOrder); //json형태로 저장
    order.maker = solidityOrder.maker;
    order.contractAddress = contract;
    order.tokenId = this.toUint256(tokenId); //정렬을 위해 제로패딩한 HexString으로 저장
    order.price = this.toUint256(price); //가격순대로 정렬을 위해 제로패딩한 HexString으로 저장
    order.expirationTime = expirationTime;
    order.isSell = true;
    order.verified = false;

    return await this.orderRepository.save(order);
  }

  //offer 주문 생성
  async generateOfferOrder({
    maker,
    contract,
    tokenId,
    price,
    expirationTime,
  }) {
    const solidityOrder = {
      exchange: this.exchangeAddress,
      maker: maker,
      taker: '0x0000000000000000000000000000000000000000',
      saleSide: 0, //buy
      saleKind: 0,
      target: contract,
      paymentToken: this.wethContractAddress, //weth
      calldata_: [
        '0x42842e0e',
        ethers.utils.hexZeroPad('0x00', 32).replace('0x', ''),
        ethers.utils.hexZeroPad(maker, 32).replace('0x', ''),
        this.toUint256(tokenId).replace('0x', ''),
      ].join(''),
      replacementPattern: [
        '0x00000000',
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        '0000000000000000000000000000000000000000000000000000000000000000',
        '0000000000000000000000000000000000000000000000000000000000000000',
      ].join(''),
      staticTarget: '0x0000000000000000000000000000000000000000',
      staticExtra: '0x',
      basePrice: BigNumber.from(price).toHexString(),
      endPrice: BigNumber.from(price).toHexString(),
      listingTime: 0,
      expirationTime,
      salt: ethers.utils.hexZeroPad(ethers.utils.randomBytes(32), 32),
    } as SolidityOrder;

    //db에 주문 저장 후 리턴
    const order = new Order();
    order.raw = JSON.stringify(solidityOrder);
    order.maker = solidityOrder.maker;
    order.contractAddress = contract;
    order.tokenId = this.toUint256(tokenId);
    order.price = this.toUint256(price);
    order.expirationTime = expirationTime;
    order.isSell = false;
    order.verified = false;

    return await this.orderRepository.save(order);
  }

  //sell 주문에 대응한 buy order 생성
  async generateBuyOrderFromFixedPriceSell(orderId: number, maker: string) {
    //db 에서 주문 데이터 가져오기
    const order = await this.orderRepository.findOneBy({
      id: orderId,
      verified: true,
      isSell: true,
    });

    if (!order) {
      throw new HttpException('not exist', HttpStatus.BAD_REQUEST);
    }

    //주문 만료 여부 체크
    if (order.expirationTime < new Date().getTime() / 1000) {
      throw new HttpException('expired order', HttpStatus.BAD_REQUEST);
    }

    //주문 구조체 데이터 가져오기
    const sellOrder = JSON.parse(order.raw);

    //고정가 판매 주문이 맞는지 체크
    if (sellOrder.saleKind !== 0) {
      throw new HttpException('not fixed price', HttpStatus.BAD_REQUEST);
    }

    //판매주문에 대응되는 구매 주문 생성
    return {
      exchange: this.exchangeAddress,
      maker: maker,
      taker: '0x0000000000000000000000000000000000000000',
      saleSide: 0,
      saleKind: sellOrder.saleKind,
      target: sellOrder.target,
      paymentToken: sellOrder.paymentToken,
      calldata_: [
        '0x42842e0e',
        ethers.utils.hexZeroPad('0x00', 32).replace('0x', ''),
        ethers.utils.hexZeroPad(maker, 32).replace('0x', ''),
        this.toUint256(order.tokenId).replace('0x', ''),
      ].join(''),
      replacementPattern: [
        '0x00000000',
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        '0000000000000000000000000000000000000000000000000000000000000000',
        '0000000000000000000000000000000000000000000000000000000000000000',
      ].join(''),
      staticTarget: '0x0000000000000000000000000000000000000000',
      staticExtra: '0x',
      basePrice: sellOrder.basePrice,
      endPrice: sellOrder.endPrice,
      listingTime: sellOrder.listingTime,
      expirationTime: sellOrder.expirationTime,
      salt: ethers.utils.hexZeroPad(ethers.utils.randomBytes(32), 32),
    } as SolidityOrder;
  }

  //offer주문에 대응하는 판매주문 생성
  async generateSellOrderFromOffer(orderId: number, maker: string) {
    const order = await this.orderRepository.findOneBy({
      id: orderId,
      verified: true,
      isSell: false,
    });

    if (!order) {
      throw new HttpException('not exist', HttpStatus.BAD_REQUEST);
    }

    if (order.expirationTime < new Date().getTime() / 1000) {
      throw new HttpException('expired order', HttpStatus.BAD_REQUEST);
    }

    const buyOrder = JSON.parse(order.raw);

    if (buyOrder.saleKind !== 0) {
      throw new HttpException('not fixed price', HttpStatus.BAD_REQUEST);
    }

    // Offer 에 대응되는 판매 주문을 생성
    return {
      exchange: this.exchangeAddress,
      maker: maker,
      taker: '0x0000000000000000000000000000000000000000',
      saleSide: 1,
      saleKind: buyOrder.saleKind,
      target: buyOrder.target,
      paymentToken: buyOrder.paymentToken,
      calldata_: [
        '0x42842e0e',
        ethers.utils.hexZeroPad(maker, 32).replace('0x', ''),
        ethers.utils.hexZeroPad('0x00', 32).replace('0x', ''),
        this.toUint256(order.tokenId).replace('0x', ''),
      ].join(''),
      replacementPattern: [
        '0x00000000',
        '0000000000000000000000000000000000000000000000000000000000000000',
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        '0000000000000000000000000000000000000000000000000000000000000000',
      ].join(''),
      staticTarget: '0x0000000000000000000000000000000000000000',
      staticExtra: '0x',
      basePrice: buyOrder.basePrice,
      endPrice: buyOrder.endPrice,
      listingTime: buyOrder.listingTime,
      expirationTime: buyOrder.expirationTime,
      salt: ethers.utils.hexZeroPad(ethers.utils.randomBytes(32), 32),
    } as SolidityOrder;
  }

  //db에 저장된 주문 검증
  async validateOrder(orderId: number, sig: OrderSig) {
    //db에 저장된 주문을 찾기
    const dbOrder = await this.orderRepository.findOneBy({ id: orderId });

    if (!dbOrder) {
      return false;
    }

    const solidityOrder = JSON.parse(dbOrder.raw) as SolidityOrder;

    if (dbOrder.isSell) {
      //판매(maker) 주문에 대한 검증
      //판매자의 프록시 주소를 가져오기
      const userProxyAddress = await this.getProxyAddress(dbOrder.maker);

      //주소가 null일시 프로시 컨트랙트를 생성 안했으면 검증 실패 리턴
      if (userProxyAddress === '0x0000000000000000000000000000000000000000') {
        return false;
      }
      //판매할 nft의 컨트랙트 가져오기
      const nftContract = new ethers.Contract(
        dbOrder.contractAddress,
        erc721Abi,
        this.provider,
      );

      //판매자가 프록시 컨트랙트에 토큰을 허용했는지 체크
      if (
        !(await nftContract.isApprovedForAll(dbOrder.maker, userProxyAddress))
      ) {
        //허용을 안했으면 검증 실패 리턴
        return false;
      }

      //판매할 nft의 owner 가져오기
      const tokenOwner = await nftContract.ownerOf(dbOrder.tokenId);

      //판매자가 토큰 owner가 맞는기 체크,대소문자가 다를 수 있으므로 bignumber로 비교
      if (!BigNumber.from(tokenOwner).eq(BigNumber.from(dbOrder.maker))) {
        return false;
      }
    } else {
      // offer 주문에 대한 검증
      const erc20Contract = new ethers.Contract(
        solidityOrder.paymentToken,
        erc20Abi,
        this.provider,
      );

      //maker가 거래컨트랙트에 허락한 토큰양을 가져오기
      const allowance = await erc20Contract.allowance(
        dbOrder.maker,
        this.exchangeAddress,
      );
      //maker의 토큰 보유 수량 가져오기
      const balance = await erc20Contract.balanceOf(dbOrder.maker);

      //allowance와 balance가 주문 가격보다 작은경우 검증 실패 리턴
      if (BigNumber.from(allowance).lt(BigNumber.from(dbOrder.price))) {
        return false;
      }
      if (BigNumber.from(balance).lt(BigNumber.from(dbOrder.price))) {
        return false;
      }
    }

    try {
      //서명검증
      await this.callVerification(solidityOrder, sig);

      //서명 거증 통과 시 서명값과 verified= true 로 db 업데이트
      dbOrder.verified = true;
      dbOrder.signature = `${sig.r}${sig.s}${sig.v}`.replace(/0x/g, '');

      await this.orderRepository.save(dbOrder);
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  //판매 주문 조회하기
  async getSellOrders(contract: string, tokenId: string) {
    //판매 주문의 nft의 컨트랙트 가져오기
    const nftContract = new ethers.Contract(contract, erc721Abi, this.provider);
    //판매 주문의 nft의 owner 가져오기
    const owner = (
      await nftContract.ownerOf(BigNumber.from(tokenId).toHexString())
    ).toLowerCase();

    //db에서 주문 찾기
    return await this.orderRepository.find({
      where: {
        contractAddress: contract,
        tokenId: this.toUint256(tokenId),
        maker: owner,
        expirationTime: LessThanOrEqual(new Date().getTime()), //현재 시점 기준으로 만료되지 않은 주문만 가져오기
        verified: true, //검증이 통과된 주문 만 가져오기
        isSell: true,
      },
      order: {
        price: 'asc', //가젹 낮은순으로 리턴
      },
    });
  }

  //offer주문 리스트 가져오기
  async getOfferOrders(contract: string, tokenId: string) {
    return await this.orderRepository.find({
      where: {
        contractAddress: contract,
        tokenId: this.toUint256(tokenId),
        isSell: false,
        expirationTime: LessThanOrEqual(new Date().getTime()),
        verified: true,
      },
      order: {
        price: 'desc', //가격 높은순으로 정렬
      },
    });
  }

  //거래 컨트랙트의 validateOrder함수를 호출하여 주문 서명 검증
  async callVerification(order: SolidityOrder, sig: OrderSig) {
    await this.exchangeContract.validateOrder(
      [
        order.exchange,
        order.maker,
        order.taker,
        order.saleSide,
        order.saleKind,
        order.target,
        order.paymentToken,
        order.calldata_,
        order.replacementPattern,
        order.staticTarget,
        order.staticExtra,
        order.basePrice,
        order.endPrice,
        order.listingTime,
        order.expirationTime,
        order.salt,
      ],
      [sig.r, sig.s, sig.v],
    );
  }

  //지갑의 proxy 컨트랙트 주소 가져오기
  async getProxyAddress(address: string) {
    return await this.proxyRegistryContract.proxies(address);
  }

  //토큰 아이디를 32바이트형으로 변환
  toUint256(id: string) {
    return ethers.utils.hexZeroPad(BigNumber.from(id).toHexString(), 32);
  }
}
