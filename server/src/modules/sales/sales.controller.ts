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
  CreateSalesIssueDto,
  CreateSalesOrderDto,
  CreateSalesPriceDto,
  CreateSalesReturnDto,
  ResolveSalesPriceDto,
  SalesQueryDto,
  UpdateSalesIssueDto,
  UpdateSalesPriceDto,
} from './dto/sales.dto';
import { SalesService } from './sales.service';

@ApiTags('Sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('prices')
  prices(@Query() query: SalesQueryDto) {
    return this.sales.listPrices(query);
  }

  @Get('prices/resolve')
  resolvePrice(@Query() query: ResolveSalesPriceDto) {
    return this.sales.resolvePrice(query);
  }

  @Post('prices')
  createPrice(
    @Body() payload: CreateSalesPriceDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.sales.createPrice(payload, actor, request.requestId);
  }

  @Patch('prices/:id')
  updatePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateSalesPriceDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.sales.updatePrice(id, payload, actor, request.requestId);
  }

  @Get('orders')
  orders(@Query() query: SalesQueryDto) {
    return this.sales.listOrders(query);
  }

  @Post('orders')
  createOrder(
    @Body() payload: CreateSalesOrderDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.sales.createOrder(payload, actor, request.requestId);
  }

  @Post('orders/:id/confirm')
  confirmOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.sales.confirmOrder(id, actor, request.requestId);
  }

  @Post('orders/:id/cancel')
  cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.sales.cancelOrder(id, actor, request.requestId);
  }

  @Get('issues')
  issues(@Query() query: SalesQueryDto) {
    return this.sales.listIssues(query);
  }

  @Post('issues')
  createIssue(
    @Body() payload: CreateSalesIssueDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.sales.createIssue(payload, actor, request.requestId);
  }

  @Patch('issues/:id')
  updateIssue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateSalesIssueDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.sales.updateIssue(id, payload, actor, request.requestId);
  }

  @Post('issues/:id/post')
  postIssue(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.sales.postIssue(id, idempotencyKey, actor, request.requestId);
  }

  @Get('returns')
  returns(@Query() query: SalesQueryDto) {
    return this.sales.listReturns(query);
  }

  @Post('returns')
  createReturn(
    @Body() payload: CreateSalesReturnDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.sales.createReturn(payload, actor, request.requestId);
  }

  @Post('returns/:id/post')
  postReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.sales.postReturn(id, idempotencyKey, actor, request.requestId);
  }

  @Get('receivables')
  receivables(@Query() query: SalesQueryDto) {
    return this.sales.listReceivables(query);
  }

  @Get('customer-refunds')
  refunds(@Query() query: SalesQueryDto) {
    return this.sales.listRefunds(query);
  }
}
