import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import type { AuthUser } from '../auth/auth.types';
import {
  CreatePurchaseOrderDto,
  CreatePurchasePriceDto,
  CreatePurchaseReceiptDto,
  CreatePurchaseReturnDto,
  PurchaseQueryDto,
  UpdatePurchaseOrderDto,
  UpdatePurchasePriceDto,
} from './dto/purchase.dto';
import { PurchaseService } from './purchase.service';

@ApiTags('Purchase')
@ApiBearerAuth()
@Controller('purchase')
export class PurchaseController {
  constructor(private readonly purchase: PurchaseService) {}

  @Get('prices')
  prices(@Query() query: PurchaseQueryDto) {
    return this.purchase.listPrices(query);
  }

  @Post('prices')
  createPrice(
    @Body() payload: CreatePurchasePriceDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.purchase.createPrice(payload, actor, request.requestId);
  }

  @Patch('prices/:id')
  updatePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdatePurchasePriceDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.purchase.updatePrice(id, payload, actor, request.requestId);
  }

  @Get('orders')
  orders(@Query() query: PurchaseQueryDto) {
    return this.purchase.listOrders(query);
  }

  @Post('orders')
  createOrder(
    @Body() payload: CreatePurchaseOrderDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.purchase.createOrder(payload, actor, request.requestId);
  }

  @Patch('orders/:id')
  updateOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdatePurchaseOrderDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.purchase.updateOrder(id, payload, actor, request.requestId);
  }

  @Post('orders/:id/confirm')
  confirmOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.purchase.confirmOrder(id, actor, request.requestId);
  }

  @Post('orders/:id/cancel')
  cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.purchase.cancelOrder(id, actor, request.requestId);
  }

  @Get('receipts')
  receipts(@Query() query: PurchaseQueryDto) {
    return this.purchase.listReceipts(query);
  }

  @Post('receipts')
  createReceipt(
    @Body() payload: CreatePurchaseReceiptDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.purchase.createReceipt(payload, actor, request.requestId);
  }

  @Post('receipts/:id/post')
  postReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.purchase.postReceipt(id, idempotencyKey, actor, request.requestId);
  }

  @Get('returns')
  returns(@Query() query: PurchaseQueryDto) {
    return this.purchase.listReturns(query);
  }

  @Post('returns')
  createReturn(
    @Body() payload: CreatePurchaseReturnDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.purchase.createReturn(payload, actor, request.requestId);
  }

  @Post('returns/:id/post')
  postReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.purchase.postReturn(id, idempotencyKey, actor, request.requestId);
  }

  @Get('payables')
  payables(@Query() query: PurchaseQueryDto) {
    return this.purchase.listPayables(query);
  }

  @Get('supplier-credits')
  supplierCredits(@Query() query: PurchaseQueryDto) {
    return this.purchase.listSupplierCredits(query);
  }
}
