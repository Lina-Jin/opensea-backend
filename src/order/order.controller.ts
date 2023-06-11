import { OrderService } from './order.service';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';

@Controller('order')
export class OrderController {
  constructor(private orderService: OrderService) {}

  //지갑의 프록시 컨트랙트 주소  가져오기
  @Get('/proxy/:address')
  async getProxyAddress(@Param() param) {
    const { address } = param;
    return {
      proxy: await this.orderService.getProxyAddress(address),
    };
  }

  //판매 주문 조회
  @Get('/sell/:address/:tokenId')
  async getSellOrders(@Param() param) {
    const { address, tokenId } = param;

    return await this.orderService.getSellOrders(address, tokenId);
  }

  //offer 주문 조회
  @Get('/offer/:address/:tokenId')
  async getOfferOrders(@Param() param) {
    const { address, tokenId } = param;

    return await this.orderService.getOfferOrders(address, tokenId);
  }

  //판매 주문 생성
  @Post('/sell')
  async generateSellOrder(@Body() body) {
    const { maker, contract, tokenId, price, expirationTime } = body;

    return await this.orderService.generateSellOrder({
      maker,
      contract,
      tokenId,
      price,
      expirationTime,
    });
  }

  //sell주문에 대응한 구매 주문 생성
  @Post('/buy')
  async generateBuyOrder(@Body() body) {
    const { orderId, maker } = body;
    return this.orderService.generateBuyOrderFromFixedPriceSell(orderId, maker);
  }

  //offer주문 생성
  @Post('/offer')
  async generateOfferOrder(@Body() body) {
    const { maker, contract, tokenId, price, expirationTime } = body;

    return await this.orderService.generateOfferOrder({
      maker,
      contract,
      tokenId,
      price,
      expirationTime,
    });
  }

  //offer주문 검증
  @Post('/offer/verify')
  async verifyOfferOrder(@Body() body) {
    const { orderId, sig } = body;
    return this.orderService.validateOrder(orderId, sig);
  }

  //offer주문에 대응하는 판매주문 생성
  @Post('/offer/accept')
  async acceptOrder(@Body() body) {
    const { orderId, maker } = body;
    return await this.orderService.generateSellOrderFromOffer(orderId, maker);
  }

  //구매 주문 서명 검증
  @Post('/verify')
  async verifyBuyOrder(@Body() body) {
    const { order, sig } = body;

    try {
      await this.orderService.callVerification(order, sig);
      return true;
    } catch (e) {
      return false;
    }
  }

  //판매 주문 검증
  @Post('/sell/verify')
  verifySellOrder(@Body() body) {
    const { orderId, sig } = body;
    return this.orderService.validateOrder(orderId, sig);
  }
}
