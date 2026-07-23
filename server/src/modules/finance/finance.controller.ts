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
  CreateAccountAdjustmentDto,
  CreateExpenseBillDto,
  CreateFinancialAccountDto,
  CreatePaymentDto,
  CreateReceiptDto,
  FinanceQueryDto,
  UpdateFinancialAccountDto,
} from './dto/finance.dto';
import { FinanceService } from './finance.service';

@ApiTags('Finance')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('accounts')
  accounts(@Query() query: FinanceQueryDto) {
    return this.finance.listAccounts(query);
  }

  @Post('accounts')
  createAccount(
    @Body() payload: CreateFinancialAccountDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.finance.createAccount(payload, actor, request.requestId);
  }

  @Patch('accounts/:id')
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateFinancialAccountDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.finance.updateAccount(id, payload, actor, request.requestId);
  }

  @Get('payables')
  payables(@Query() query: FinanceQueryDto) {
    return this.finance.listPayables(query);
  }

  @Get('receivables')
  receivables(@Query() query: FinanceQueryDto) {
    return this.finance.listReceivables(query);
  }

  @Get('payments')
  payments(@Query() query: FinanceQueryDto) {
    return this.finance.listPayments(query);
  }

  @Post('payments')
  createPayment(
    @Body() payload: CreatePaymentDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.finance.createPayment(payload, actor, request.requestId);
  }

  @Post('payments/:id/post')
  postPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.finance.postPayment(id, idempotencyKey, actor, request.requestId);
  }

  @Get('receipts')
  receipts(@Query() query: FinanceQueryDto) {
    return this.finance.listReceipts(query);
  }

  @Post('receipts')
  createReceipt(
    @Body() payload: CreateReceiptDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.finance.createReceipt(payload, actor, request.requestId);
  }

  @Post('receipts/:id/post')
  postReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.finance.postReceipt(id, idempotencyKey, actor, request.requestId);
  }

  @Get('adjustments')
  adjustments(@Query() query: FinanceQueryDto) {
    return this.finance.listAdjustments(query);
  }

  @Get('expenses')
  expenses(@Query() query: FinanceQueryDto) {
    return this.finance.listExpenseBills(query);
  }

  @Post('expenses')
  createExpense(
    @Body() payload: CreateExpenseBillDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.finance.createExpenseBill(payload, actor, request.requestId);
  }

  @Post('expenses/:id/post')
  postExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.finance.postExpenseBill(id, idempotencyKey, actor, request.requestId);
  }

  @Post('adjustments')
  createAdjustment(
    @Body() payload: CreateAccountAdjustmentDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.finance.createAdjustment(payload, actor, request.requestId);
  }

  @Post('adjustments/:id/post')
  postAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.finance.postAdjustment(id, idempotencyKey, actor, request.requestId);
  }

  @Get('transactions')
  transactions(@Query() query: FinanceQueryDto) {
    return this.finance.listTransactions(query);
  }

  @Get('analytics')
  analytics(@Query() query: FinanceQueryDto) {
    return this.finance.analytics(query);
  }
}
